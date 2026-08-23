import ClientModule, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from '@triton-one/yellowstone-grpc';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { loadTokenMetadata, metadataAddresses } from './metadata.js';
import { decodeMintDecimals } from './decoder.js';
import { RotatingRpc } from './rpc.js';
import { RAYDIUM_CLMM_PROGRAM_ID } from './raydium-constants.js';
import { decodeRaydiumPool, raydiumPoolDiscriminator } from './raydium-decoder.js';
import { PoolDatabase } from './db.js';
import { isRaydiumPoolCreation, wasAccountCreated } from './pool-discovery.js';

export class RaydiumGrpcIndexer {
  private readonly client: { subscribe(): Promise<unknown> };
  private readonly http: RotatingRpc;

  private readonly poolAddresses = new Set<string>();
  private stream: { write(request: SubscribeRequest): boolean } | undefined;

  constructor(endpoint: string, apiKey: string, private readonly database: PoolDatabase, httpUrls: string[], private readonly onPoolAccount?: (address: string, data: Uint8Array, slot: number) => void, private readonly onPool?: (pool: import('./raydium-types.js').RaydiumClmmPoolRecord) => void) {
    const Client = ClientModule as unknown as new (url: string, token: string, options?: undefined) => { subscribe(): Promise<unknown> };
    this.client = new Client(endpoint, apiKey, undefined);
    this.http = new RotatingRpc(httpUrls);
  }

  async start(): Promise<void> {
    const stream = await this.client.subscribe() as { on(event: string, listener: (...args: never[]) => void): void; write(request: SubscribeRequest): boolean };
    this.stream = stream;
    for (const pool of this.database.raydiumPools()) this.poolAddresses.add(pool.address);
    stream.on('data', (update: SubscribeUpdate) => {
      const account = update.account?.account;
      if (account) {
        const address = new PublicKey(account.pubkey).toBase58();
        if (this.poolAddresses.has(address)) this.onPoolAccount?.(address, account.data, Number(update.account?.slot ?? 0));
        return;
      }
      const transaction = update.transaction?.transaction;
      if (!transaction) return;
      const logs = (transaction.meta as { logMessages?: string[] } | undefined)?.logMessages ?? [];
      if (!isRaydiumPoolCreation(logs)) return;
      const signature = bs58.encode(transaction.signature);
      void this.process(signature, Number(update.transaction?.slot ?? 0)).catch((error: unknown) => console.error(`Raydium pool ${signature} failed:`, error));
    });
    stream.on('error', (error: Error) => console.error('Raydium gRPC stream error:', error.message));
    const request: SubscribeRequest = {
      accounts: {}, slots: {},
      transactions: { raydium_clmm: { vote: false, failed: false, accountInclude: [RAYDIUM_CLMM_PROGRAM_ID.toBase58()], accountExclude: [], accountRequired: [] } },
      transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [], commitment: CommitmentLevel.CONFIRMED,
    };
    stream.write(request);
    console.log('Tatum Yellowstone gRPC Raydium CLMM stream active.');
    await new Promise<void>((resolve) => stream.on('close', resolve));
  }

  private async process(signature: string, slot: number): Promise<void> {
    const transaction = await this.http.getParsedTransaction(signature);
    if (!transaction) return;
    const keys = transaction.transaction.message.accountKeys.map((account) => new PublicKey(account.pubkey.toBase58()));
    const accounts = await this.http.getMultipleAccountsInfo(keys);
    const preBalances = transaction.meta?.preBalances ?? [];
    const postBalances = transaction.meta?.postBalances ?? [];
    const poolAccounts = accounts.map((account, index) => ({ account, key: keys[index], index })).filter(({ account, index }) => {
      return wasAccountCreated(preBalances[index], postBalances[index]) && account?.owner.equals(RAYDIUM_CLMM_PROGRAM_ID) && account.data.subarray(0, 8).equals(raydiumPoolDiscriminator());
    });
    for (const { account, key } of poolAccounts) {
      if (!account) continue;
      if (this.database.hasRaydiumPool(key.toBase58())) continue;
      const mintKeys = [new PublicKey(account.data.subarray(73, 105)), new PublicKey(account.data.subarray(105, 137))];
      const mintAccounts = await this.http.getMultipleAccountsInfo(mintKeys);
      const metadataAccounts = await this.http.getMultipleAccountsInfo(metadataAddresses(mintKeys));
      const metadata = new Map<string, { symbol: string | null; decimals: number; logoUrl: string | null; totalSupplyRaw: string }>();
      for (const [index, mint] of mintKeys.entries()) {
        const token = await loadTokenMetadata(mint, mintAccounts[index]?.data ?? null, metadataAccounts[index]?.data ?? null);
        metadata.set(mint.toBase58(), { ...token, decimals: mintAccounts[index] ? decodeMintDecimals(mintAccounts[index].data) : account.data[index === 0 ? 233 : 234] });
      }
      const pool = decodeRaydiumPool(key.toBase58(), account.data, slot, metadata);
      this.database.upsertRaydiumPool(pool);
      this.onPool?.(pool);
      this.poolAddresses.add(key.toBase58());
      this.stream?.write(this.subscriptionRequest());
      console.log(`Indexed new Raydium CLMM pool ${key.toBase58()} (${this.database.raydiumCount()} total).`);
    }
  }

  async processSignature(signature: string, slot: number): Promise<void> { await this.process(signature, slot); }

  private subscriptionRequest(): SubscribeRequest {
    return {
      accounts: { raydium_pools: { account: [...this.poolAddresses], owner: [RAYDIUM_CLMM_PROGRAM_ID.toBase58()], filters: [{ memcmp: { offset: '0', base58: bs58.encode(raydiumPoolDiscriminator()) } }] } }, slots: {},
      transactions: { raydium_clmm: { vote: false, failed: false, accountInclude: [RAYDIUM_CLMM_PROGRAM_ID.toBase58()], accountExclude: [], accountRequired: [] } },
      transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [], commitment: CommitmentLevel.CONFIRMED,
    };
  }
}