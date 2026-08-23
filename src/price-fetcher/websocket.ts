import WebSocket from 'ws';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { PUMPSWAP_PROGRAM_ID } from '../constants.js';
import { calculatePrice } from './calculator.js';
import { orientPool } from './orientation.js';
import { PoolForPricing, PoolPrice } from './types.js';
import { RotatingRpc } from '../rpc.js';
import { SubscribeUpdate } from '@triton-one/yellowstone-grpc';

type RpcMessage = { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: { subscription?: number; result: { context: { slot: number }; value: { signature?: string; logs?: string[]; err?: unknown; data?: [string, string] | string } } } };

export class PriceWebSocket {
  private nextId = 1;
  private socket: WebSocket | undefined;
  private readonly pending = new Map<number, (message: RpcMessage) => void>();
  private readonly poolsByVault = new Map<string, { pool: PoolForPricing; side: 'base' | 'quote' }>();
  private readonly latestSlot = new Map<string, number>();
  private readonly latestPrice = new Map<string, number>();
  private readonly reserves = new Map<string, { base?: bigint; quote?: bigint; slot: number }>();
  private readonly inFlightSignatures = new Set<string>();
  private readonly eventQueue: Array<{ signature: string; slot: number; resolve: () => void; reject: (error: unknown) => void }> = [];
  private activeEvents = 0;
  private readonly httpConnection: RotatingRpc;
  private readonly subscribedVaults = new Set<string>();
  private readonly vaultsBySubscription = new Map<number, string>();
  private accountSubscriptions = false;

  constructor(private readonly endpoint: string, private readonly onPrice: (price: PoolPrice) => void, httpEndpoints = [endpoint.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')]) {
    this.httpConnection = new RotatingRpc(httpEndpoints);
  }

  async start(pools: PoolForPricing[]): Promise<void> {
    for (const pool of pools) this.addPool(pool);
    const socket = new WebSocket(this.endpoint);
    this.socket = socket;
    socket.on('message', (raw) => {
      try { this.handleMessage(JSON.parse(raw.toString()) as RpcMessage); }
      catch (error) { console.error('Invalid price WebSocket message:', error); }
    });
    socket.on('error', (error) => console.error('Price WebSocket error:', error.message));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    try {
      const subscriptions: unknown[] = [];
      for (const vault of this.poolsByVault.keys()) subscriptions.push(await this.subscribeVault(vault));
      this.accountSubscriptions = true;
      console.log(`Price account WebSocket active (${subscriptions.length} vault subscriptions) for ${pools.length} pools.`);
    } catch (error) {
      console.warn('Vault subscriptions unavailable; using one logs subscription with Infura HTTP hydration:', error instanceof Error ? error.message : error);
      const subscription = await this.request(socket, 'logsSubscribe', [{ mentions: [PUMPSWAP_PROGRAM_ID.toBase58()] }, { commitment: 'confirmed' }]);
      console.log(`Price event WebSocket active (subscription ${subscription}) for ${pools.length} pools.`);
    }
    await this.initializeReserves();
    await new Promise<void>((resolve, reject) => { socket.once('close', () => reject(new Error('Price WebSocket closed'))); socket.once('error', reject); });
  }

  addPool(pool: PoolForPricing): void {
    const orientation = orientPool(pool);
    if (!orientation) return;
    this.poolsByVault.set(orientation.baseVault, { pool, side: 'base' });
    this.poolsByVault.set(orientation.quoteVault, { pool, side: 'quote' });
    if (this.socket && this.accountSubscriptions) {
      void this.subscribeVault(orientation.baseVault).catch((error: unknown) => console.error('Base vault subscription failed:', error));
      void this.subscribeVault(orientation.quoteVault).catch((error: unknown) => console.error('Quote vault subscription failed:', error));
    }
  }

  addPools(pools: PoolForPricing[]): void {
    for (const pool of pools) this.addPool(pool);
  }

  private request(socket: WebSocket, method: string, params: unknown[]): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  private async subscribeVault(vault: string): Promise<unknown> {
    if (this.subscribedVaults.has(vault)) return null;
    const subscription = await this.request(this.socket!, 'accountSubscribe', [vault, { commitment: 'confirmed', encoding: 'base64' }]);
    this.subscribedVaults.add(vault);
    this.vaultsBySubscription.set(Number(subscription), vault);
    return subscription;
  }

  private handleMessage(message: RpcMessage): void {
    if (message.id) {
      this.pending.get(message.id)?.(message);
      this.pending.delete(message.id);
      return;
    }
    const params = message.params;
    const result = params?.result;
    const notification = result?.value;
    const signature = notification?.signature;
    if (message.method === 'logsNotification' && signature && notification.logs?.some((log) => /instruction:\s*(buy|sell|deposit|withdraw)/i.test(log)) && params) {
      if (!this.inFlightSignatures.has(signature)) {
        this.inFlightSignatures.add(signature);
        void this.enqueueEvent(signature, params.result.context.slot)
          .catch((error: unknown) => console.error(`Price event ${signature} failed:`, error))
          .finally(() => this.inFlightSignatures.delete(signature));
      }
      return;
    }
    const vault = params?.subscription === undefined ? undefined : this.vaultsBySubscription.get(params.subscription);
    if (message.method !== 'accountNotification' || !vault || !notification?.data || !result) return;
    const match = this.poolsByVault.get(vault);
    if (!match) return;
    const encoded = Array.isArray(notification.data) ? notification.data[0] : notification.data;
    const data = Buffer.from(encoded, 'base64');
    if (data.length < 72) return;
    const current = this.reserves.get(match.pool.address) ?? { slot: result.context.slot };
    current[match.side] = data.readBigUInt64LE(64);
    current.slot = result.context.slot;
    this.reserves.set(match.pool.address, current);
    if (current.base !== undefined && current.quote !== undefined) this.publish(match.pool, current.base, current.quote, result.context.slot);
  }

  async processEvent(signature: string, notificationSlot: number): Promise<void> {
    return this.enqueueEvent(signature, notificationSlot);
  }

  async processGrpcTransaction(update: SubscribeUpdate): Promise<void> {
    const transaction = update.transaction;
    const info = transaction?.transaction;
    const message = info?.transaction?.message as { accountKeys?: Uint8Array[] } | undefined;
    const meta = info?.meta as { postTokenBalances?: Array<{ accountIndex: number; uiTokenAmount?: { amount?: string } }> } | undefined;
    if (!transaction || !info || !message?.accountKeys || !meta?.postTokenBalances) return;
    const keys = message.accountKeys.map((key) => new PublicKey(key).toBase58());
    const changedPools = new Map<string, { pool: PoolForPricing; base?: bigint; quote?: bigint }>();
    for (const balance of meta.postTokenBalances) {
      const match = this.poolsByVault.get(keys[balance.accountIndex]);
      const amount = balance.uiTokenAmount?.amount;
      if (!match || !amount) continue;
      const current = changedPools.get(match.pool.address) ?? { pool: match.pool };
      current[match.side] = BigInt(amount);
      changedPools.set(match.pool.address, current);
    }
    for (const changed of changedPools.values()) {
      if (changed.base !== undefined && changed.quote !== undefined) this.publish(changed.pool, changed.base, changed.quote, Number(transaction.slot));
    }
  }

  private enqueueEvent(signature: string, slot: number): Promise<void> {
    if (this.eventQueue.length >= 32) this.eventQueue.shift()?.resolve();
    return new Promise((resolve, reject) => {
      this.eventQueue.push({ signature, slot, resolve, reject });
      void this.drainEvents();
    });
  }

  private async drainEvents(): Promise<void> {
    if (this.activeEvents >= 2) return;
    const event = this.eventQueue.shift();
    if (!event) return;
    this.activeEvents += 1;
    try {
      await this.processEventNow(event.signature, event.slot);
      event.resolve();
    } catch (error) {
      event.reject(error);
    } finally {
      this.activeEvents -= 1;
      void this.drainEvents();
    }
  }

  private async processEventNow(signature: string, notificationSlot: number): Promise<void> {
    const transaction = await this.httpConnection.getParsedTransaction(signature);
    if (!transaction?.meta) return;
    const slot = Math.max(notificationSlot, transaction.slot);
    const keys = transaction.transaction.message.accountKeys.map((account) => account.pubkey.toBase58());
    const changedPools = new Map<string, { pool: PoolForPricing; base?: bigint; quote?: bigint }>();
    for (const balance of transaction.meta.postTokenBalances ?? []) {
      const match = this.poolsByVault.get(keys[balance.accountIndex]);
      if (!match) continue;
      const current = changedPools.get(match.pool.address) ?? { pool: match.pool };
      current[match.side] = BigInt(balance.uiTokenAmount.amount);
      changedPools.set(match.pool.address, current);
    }
    for (const changed of changedPools.values()) {
      if (changed.base === undefined || changed.quote === undefined) continue;
      this.publish(changed.pool, changed.base, changed.quote, slot);
    }
  }

  private async initializeReserves(): Promise<void> {
    const vaults = [...this.poolsByVault.keys()];
    const slot = await this.httpConnection.getSlot();
    for (let offset = 0; offset < vaults.length; offset += 100) {
      const keys = vaults.slice(offset, offset + 100);
      const accounts = await this.httpConnection.getMultipleAccountsInfo(keys.map((key) => new PublicKey(key)));
      for (const [index, account] of accounts.entries()) {
        const match = this.poolsByVault.get(keys[index]);
        if (!match || !account || account.data.length < 72) continue;
        const current = this.reserves.get(match.pool.address) ?? { slot };
        current[match.side] = account.data.readBigUInt64LE(64);
        current.slot = slot;
        this.reserves.set(match.pool.address, current);
        if (current.base !== undefined && current.quote !== undefined) this.publish(match.pool, current.base, current.quote, slot);
      }
    }
  }

  private publish(pool: PoolForPricing, base: bigint, quote: bigint, slot: number): void {
    if ((this.latestSlot.get(pool.address) ?? 0) > slot) return;
    this.latestSlot.set(pool.address, slot);
    this.reserves.set(pool.address, { base, quote, slot });
    const orientation = orientPool(pool);
    if (orientation) {
      const price = calculatePrice(orientation, base, quote, slot, pool.address, this.latestPrice.get(pool.address) ?? null);
      if (price.price !== null) this.latestPrice.set(pool.address, price.price);
      this.onPrice(price);
    }
  }
}
