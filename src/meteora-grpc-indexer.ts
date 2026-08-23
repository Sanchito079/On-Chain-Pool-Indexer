import ClientModule, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from '@triton-one/yellowstone-grpc';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { PoolDatabase } from './db.js';
import { loadTokenMetadata, metadataAddresses } from './metadata.js';
import { RotatingRpc } from './rpc.js';
import { METEORA_DAMM_V2_PROGRAM_ID } from './meteora-constants.js';
import { decodeMeteoraPool, meteoraPoolDiscriminator } from './meteora-decoder.js';
import { asPublicKey } from './solana-keys.js';

const INITIALIZE_DISCRIMINATORS = new Set([
  'X7QKrFSu6Cg=',
  'lVJIxf38RA8=',
  'FKHxGL3dtAI=',
]);

export class MeteoraGrpcIndexer {
  private readonly client: { subscribe(): Promise<unknown> };
  private readonly http: RotatingRpc;
  private readonly processing = new Set<string>();

  private readonly poolAddresses = new Set<string>();
  private stream: { write(request: SubscribeRequest): boolean } | undefined;

  constructor(endpoint: string, apiKey: string, private readonly database: PoolDatabase, httpUrls: string[], private readonly onUpdate?: (update: SubscribeUpdate) => void, private readonly onPool?: (pool: import('./meteora-types.js').MeteoraDammV2PoolRecord) => void, private readonly onPoolAccount?: (address: string, data: Uint8Array, slot: number) => void) {
    const Client = ClientModule as unknown as new (url: string, token: string, options?: undefined) => { subscribe(): Promise<unknown> };
    this.client = new Client(endpoint, apiKey, undefined);
    this.http = new RotatingRpc(httpUrls);
  }

  async start(): Promise<void> {
    const stream = await this.client.subscribe() as { on(event: string, listener: (...args: never[]) => void): void; write(request: SubscribeRequest): boolean };
    this.stream = stream;
    for (const pool of this.database.meteoraPools()) this.poolAddresses.add(pool.address);
    stream.on('data', (update: SubscribeUpdate) => {
      const account = update.account?.account;
      if (account) {
        const address = new PublicKey(account.pubkey).toBase58();
        if (this.poolAddresses.has(address)) this.onPoolAccount?.(address, account.data, Number(update.account?.slot ?? 0));
        return;
      }
      const transaction = update.transaction?.transaction;
      if (!transaction) return;
      this.onUpdate?.(update);
      const slot = Number(update.transaction?.slot ?? 0);
      void this.processStreamedTransaction(transaction, slot).catch((error: unknown) => console.error('Meteora transaction failed:', error));
    });
    stream.on('error', (error: Error) => console.error('Meteora gRPC stream error:', error.message));
    stream.on('end', () => console.error('Meteora gRPC stream ended.'));
    const request = this.subscriptionRequest();
    stream.write(request);
    console.log('Tatum Yellowstone gRPC Meteora DAMM v2 stream active.');
    await new Promise<void>((resolve, reject) => {
      stream.on('close', resolve);
      stream.on('end', resolve);
      stream.on('error', (error: Error) => reject(error));
    });
  }

  private async processStreamedTransaction(transaction: unknown, slot: number): Promise<void> {
    const message = (transaction as { transaction?: { message?: { accountKeys?: Uint8Array[]; instructions?: Array<{ programIdIndex?: number; accounts?: Uint8Array; data?: Uint8Array }> } } }).transaction?.message;
    if (!message?.accountKeys || !message.instructions) return;
    for (const instruction of message.instructions) {
      const programId = instruction.programIdIndex === undefined ? undefined : message.accountKeys[instruction.programIdIndex];
      if (!programId || !Buffer.from(programId).equals(METEORA_DAMM_V2_PROGRAM_ID.toBuffer()) || !instruction.data || !instruction.accounts) continue;
      const discriminator = Buffer.from(instruction.data.subarray(0, 8)).toString('base64');
      if (!INITIALIZE_DISCRIMINATORS.has(discriminator)) continue;
      const poolIndex = discriminator === 'X7QKrFSu6Cg=' ? 6 : discriminator === 'lVJIxf38RA8=' ? 7 : 5;
      const poolBytes = instruction.accounts[poolIndex];
      if (poolBytes === undefined) continue;
      const poolKey = new PublicKey(message.accountKeys[poolBytes]);
      const address = poolKey.toBase58();
      if (this.processing.has(address) || this.database.hasMeteoraPool(address)) continue;
      const account = await this.http.getAccountInfo(poolKey);
      if (!account || !account.owner.equals(METEORA_DAMM_V2_PROGRAM_ID) || account.data.length < 1112 || !account.data.subarray(0, 8).equals(meteoraPoolDiscriminator())) continue;
      this.processing.add(address);
      try { await this.processPool(address, account.data, slot); } finally { this.processing.delete(address); }
    }
  }

  async processSignature(signature: string, slot: number): Promise<void> {
    const transaction = await this.http.getParsedTransaction(signature);
    const message = transaction?.transaction.message as unknown as { accountKeys: unknown[]; instructions: Array<{ programId: unknown; accounts?: unknown[]; data?: string }> } | undefined;
    if (!message) return;
    const publicKeys = message.accountKeys.map(asPublicKey);
    if (publicKeys.some((key) => !key)) return;
    const keys = publicKeys.map((key) => key!.toBuffer());
    const instructions = message.instructions.map((instruction) => ({
      programIdIndex: publicKeys.findIndex((key) => key?.equals(asPublicKey(instruction.programId) ?? PublicKey.default)),
      accounts: Uint8Array.from((instruction.accounts ?? []).map((key) => publicKeys.findIndex((candidate) => candidate?.equals(asPublicKey(key) ?? PublicKey.default)))),
      data: instruction.data ? bs58.decode(instruction.data) : undefined,
    }));
    await this.processStreamedTransaction({ transaction: { message: { accountKeys: keys, instructions } } }, slot);
  }

  private async processPool(address: string, poolData: Buffer, slot: number): Promise<void> {
      const mintKeys = [new PublicKey(poolData.subarray(168, 200)), new PublicKey(poolData.subarray(200, 232))];
      const mintAccounts = await this.http.getMultipleAccountsInfo(mintKeys);
      const metadataAccounts = await this.http.getMultipleAccountsInfo(metadataAddresses(mintKeys));
      const metadata = new Map<string, { symbol: string | null; decimals: number; logoUrl: string | null; totalSupplyRaw: string }>();
      for (const [mintIndex, mint] of mintKeys.entries()) {
        const token = await loadTokenMetadata(mint, mintAccounts[mintIndex]?.data ?? null, metadataAccounts[mintIndex]?.data ?? null);
        metadata.set(mint.toBase58(), { ...token, decimals: mintAccounts[mintIndex]?.data[44] ?? 0 });
      }
      const pool = decodeMeteoraPool(address, poolData, slot, metadata);
      this.database.upsertMeteoraPool(pool);
      this.poolAddresses.add(address);
      this.updateAccountSubscription();
      this.onPool?.(pool);
      console.log(`Indexed new Meteora DAMM v2 pool ${address} (${this.database.meteoraCount()} total).`);
  }

  private updateAccountSubscription(): void {
    this.stream?.write(this.subscriptionRequest());
  }

  private subscriptionRequest(): SubscribeRequest {
    return {
      accounts: { meteora_pools: { account: [...this.poolAddresses], owner: [METEORA_DAMM_V2_PROGRAM_ID.toBase58()], filters: [{ datasize: '1112' }, { memcmp: { offset: '0', base58: bs58.encode(meteoraPoolDiscriminator()) } }] } }, slots: {},
      transactions: { meteora_damm_v2: { vote: false, failed: false, accountInclude: [METEORA_DAMM_V2_PROGRAM_ID.toBase58()], accountExclude: [], accountRequired: [] } },
      transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [], commitment: CommitmentLevel.CONFIRMED,
    };
  }
}