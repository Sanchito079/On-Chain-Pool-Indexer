import WebSocket from 'ws';
import { PublicKey } from '@solana/web3.js';
import { decodeMintDecimals, decodePool, poolDiscriminator } from './decoder.js';
import { PUMPSWAP_PROGRAM_ID } from './constants.js';
import { PoolDatabase } from './db.js';
import { loadTokenMetadata, metadataAddresses } from './metadata.js';
import { RotatingRpc } from './rpc.js';

type RpcResponse = { result?: unknown; error?: { message: string } };

export class PumpSwapWebSocketIndexer {
  private nextId = 1;
  private readonly pending = new Map<number, (response: RpcResponse) => void>();
  private socket: WebSocket | undefined;
  private readonly httpConnection: RotatingRpc;

  constructor(private readonly endpoint: string, private readonly database: PoolDatabase, private readonly onPool?: (pool: import('./types.js').PoolRecord) => Promise<void> | void, httpEndpoints = [endpoint.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')]) {
    this.httpConnection = new RotatingRpc(httpEndpoints);
  }

  async start(): Promise<void> {
    const socket = new WebSocket(this.endpoint);
    this.socket = socket;
    socket.on('message', (raw) => {
      try {
        this.handleMessage(JSON.parse(raw.toString()) as RpcResponse & { id?: number; method?: string; params?: { result: { context: { slot: number }; value: { signature: string; logs: string[]; err: unknown } } } });
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
      }
    });
    socket.on('error', (error) => console.error('PumpSwap WebSocket error:', error.message));
    socket.on('close', (code, reason) => console.error(`PumpSwap WebSocket closed (${code}): ${reason.toString() || 'no reason'}`));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const subscriptionId = await this.request(socket, 'logsSubscribe', [{ mentions: [PUMPSWAP_PROGRAM_ID.toBase58()] }, { commitment: 'confirmed' }]);
    console.log(`Subscribed to PumpSwap logs (subscription ${subscriptionId}). Waiting for new pools...`);
    await new Promise<void>((resolve, reject) => {
      socket.once('close', () => reject(new Error('PumpSwap WebSocket closed')));
      socket.once('error', reject);
    });
  }

  private handleMessage(message: RpcResponse & { id?: number; method?: string; params?: { result: { context: { slot: number }; value: { signature: string; logs: string[]; err: unknown } } } }): void {
    if (message.id) {
      this.pending.get(message.id)?.(message);
      this.pending.delete(message.id);
      return;
    }
    const result = message.params?.result;
    if (!result) return;
    const notification = result?.value;
    if (message.method === 'logsNotification' && !notification?.err && notification?.logs.some((log) => /instruction:\s*create[_ ]?pool/i.test(log))) {
      console.log(`CreatePool detected in ${notification.signature}; loading pool account...`);
      void this.processTransaction(notification.signature, result.context.slot).catch((error: unknown) => console.error('Pool event failed:', error));
    }
  }

  private request(socket: WebSocket, method: string, params: unknown[]): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (response) => response.error ? reject(new Error(response.error.message)) : resolve(response.result));
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  async processTransaction(signature: string, slot: number): Promise<void> {
    const transaction = await this.httpConnection.getParsedTransaction(signature);
    const accountKeys = transaction?.transaction.message.accountKeys.map((account) => new PublicKey(account.pubkey.toBase58())) ?? [];
    if (!accountKeys.length) return;
    const accountInfos = await this.httpConnection.getMultipleAccountsInfo(accountKeys);
    for (const [index, account] of accountInfos.entries()) {
      if (!account || !account.owner.equals(PUMPSWAP_PROGRAM_ID)) continue;
      const data = account.data;
      if (!data.subarray(0, 8).equals(poolDiscriminator())) continue;
      await this.persistPool(accountKeys[index].toBase58(), data, slot);
    }
  }

  private async persistPool(address: string, data: Buffer, slot: number): Promise<void> {
    const baseMint = new PublicKey(data.subarray(43, 75));
    const quoteMint = new PublicKey(data.subarray(75, 107));
    const mints = [baseMint, quoteMint];
    const mintResponse = await this.httpConnection.getMultipleAccountsInfo(mints);
    const decimals = new Map<string, number>();
    const symbols = new Map<string, string | null>();
    const logos = new Map<string, string | null>();
    for (const [index, account] of mintResponse.entries()) if (account) {
      decimals.set(mints[index].toBase58(), decodeMintDecimals(account.data));
      symbols.set(mints[index].toBase58(), null);
    }
    const metadataKeys = metadataAddresses(mints);
    const metadataResponse = await this.httpConnection.getMultipleAccountsInfo(metadataKeys);
    for (const [index, account] of metadataResponse.entries()) if (account) {
      if (!account) continue;
    }
    for (const [index, mint] of mints.entries()) {
      const token = await loadTokenMetadata(mint, mintResponse[index]?.data ?? null, metadataResponse[index]?.data ?? null);
      symbols.set(mint.toBase58(), token.symbol);
      logos.set(mint.toBase58(), token.logoUrl);
    }
    const pool = decodePool(address, data, slot, decimals, symbols, logos);
    this.database.upsert(pool);
    await this.onPool?.(pool);
    console.log(`Indexed new PumpSwap pool ${address} (${this.database.count()} total).`);
  }

}