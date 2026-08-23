import ClientModule, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from '@triton-one/yellowstone-grpc';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { PoolDatabase } from './db.js';
import { loadTokenMetadata, metadataAddresses } from './metadata.js';
import { RotatingRpc } from './rpc.js';
import { METEORA_DLMM_PROGRAM_ID } from './dlmm-constants.js';
import { decodeDlmmPool, dlmmInstructionDiscriminator, dlmmPairDiscriminator } from './dlmm-decoder.js';
import { asPublicKey } from './solana-keys.js';

const CREATE_INSTRUCTIONS = new Map<string, number>([
  ['initialize_lb_pair', 0],
  ['initialize_lb_pair2', 0],
  ['initialize_customizable_permissionless_lb_pair', 0],
  ['initialize_customizable_permissionless_lb_pair2', 0],
  ['initialize_permission_lb_pair', 1],
]);
const CREATE_DISCRIMINATORS = new Map([...CREATE_INSTRUCTIONS.keys()].map((name) => [Buffer.from(dlmmInstructionDiscriminator(name)).toString('base64'), CREATE_INSTRUCTIONS.get(name)!]));

export class DlmmGrpcIndexer {
  private readonly client: { subscribe(): Promise<unknown> };
  private readonly http: RotatingRpc;
  private readonly processing = new Set<string>();
  private readonly poolAddresses = new Set<string>();
  private stream: { write(request: SubscribeRequest): boolean } | undefined;

  constructor(endpoint: string, apiKey: string, private readonly database: PoolDatabase, httpUrls: string[], private readonly onPool?: (pool: import('./dlmm-types.js').MeteoraDlmmPoolRecord) => void, private readonly onPoolAccount?: (address: string, data: Uint8Array, slot: number) => void) {
    const Client = ClientModule as unknown as new (url: string, token: string, options?: undefined) => { subscribe(): Promise<unknown> };
    this.client = new Client(endpoint, apiKey, undefined);
    this.http = new RotatingRpc(httpUrls);
  }

  async start(): Promise<void> {
    const stream = await this.client.subscribe() as { on(event: string, listener: (...args: never[]) => void): void; write(request: SubscribeRequest): boolean };
    this.stream = stream;
    for (const pool of this.database.dlmmPools()) this.poolAddresses.add(pool.address);
    stream.on('data', (update: SubscribeUpdate) => {
      const account = update.account?.account;
      if (account) {
        const address = new PublicKey(account.pubkey).toBase58();
        if (this.poolAddresses.has(address)) this.onPoolAccount?.(address, account.data, Number(update.account?.slot ?? 0));
        return;
      }
      const transaction = update.transaction?.transaction;
      if (!transaction) return;
      void this.processTransaction(transaction, Number(update.transaction?.slot ?? 0)).catch((error: unknown) => console.error('Meteora DLMM transaction failed:', error));
    });
    stream.on('error', (error: Error) => console.error('Meteora DLMM gRPC stream error:', error.message));
    stream.on('end', () => console.error('Meteora DLMM gRPC stream ended.'));
    stream.write(this.subscriptionRequest());
    console.log('Tatum Yellowstone gRPC Meteora DLMM stream active.');
    await new Promise<void>((resolve, reject) => { stream.on('close', resolve); stream.on('end', resolve); stream.on('error', reject); });
  }

  private async processTransaction(transaction: unknown, slot: number): Promise<void> {
    const message = (transaction as { transaction?: { message?: { accountKeys?: Uint8Array[]; instructions?: Array<{ programIdIndex?: number; accounts?: Uint8Array; data?: Uint8Array }> } } }).transaction?.message;
    if (!message?.accountKeys || !message.instructions) return;
    for (const instruction of message.instructions) {
      const programId = instruction.programIdIndex === undefined ? undefined : message.accountKeys[instruction.programIdIndex];
      if (!programId || !Buffer.from(programId).equals(METEORA_DLMM_PROGRAM_ID.toBuffer()) || !instruction.data || !instruction.accounts) continue;
      const discriminator = Buffer.from(instruction.data.subarray(0, 8)).toString('base64');
      const poolIndex = CREATE_DISCRIMINATORS.get(discriminator);
      if (poolIndex === undefined) continue;
      const poolAccountIndex = instruction.accounts[poolIndex];
      if (poolAccountIndex === undefined) continue;
      const poolKey = new PublicKey(message.accountKeys[poolAccountIndex]);
      const address = poolKey.toBase58();
      if (this.processing.has(address) || this.database.hasDlmmPool(address)) continue;
      const account = await this.http.getAccountInfo(poolKey);
      if (!account || !account.owner.equals(METEORA_DLMM_PROGRAM_ID) || !account.data.subarray(0, 8).equals(dlmmPairDiscriminator())) continue;
      this.processing.add(address);
      try {
        const data = account.data;
        const mints = [new PublicKey(data.subarray(88, 120)), new PublicKey(data.subarray(120, 152))];
        const mintAccounts = await this.http.getMultipleAccountsInfo(mints);
        const metadataAccounts = await this.http.getMultipleAccountsInfo(metadataAddresses(mints));
        const metadata = new Map<string, { symbol: string | null; decimals: number; logoUrl: string | null; totalSupplyRaw: string }>();
        for (const [index, mint] of mints.entries()) {
          const token = await loadTokenMetadata(mint, mintAccounts[index]?.data ?? null, metadataAccounts[index]?.data ?? null);
          metadata.set(mint.toBase58(), { ...token, decimals: mintAccounts[index]?.data[44] ?? 0 });
        }
        this.database.upsertDlmmPool(decodeDlmmPool(address, data, slot, metadata));
        this.poolAddresses.add(address);
        this.stream?.write(this.subscriptionRequest());
        this.onPool?.(decodeDlmmPool(address, data, slot, metadata));
        console.log(`Indexed new Meteora DLMM pool ${address} (${this.database.dlmmCount()} total).`);
      } finally {
        this.processing.delete(address);
      }
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
    await this.processTransaction({ transaction: { message: { accountKeys: keys, instructions } } }, slot);
  }

  private subscriptionRequest(): SubscribeRequest {
    return { accounts: { dlmm_pools: { account: [...this.poolAddresses], owner: [METEORA_DLMM_PROGRAM_ID.toBase58()], filters: [{ datasize: '904' }, { memcmp: { offset: '0', base58: bs58.encode(dlmmPairDiscriminator()) } }] } }, slots: {}, transactions: { meteora_dlmm: { vote: false, failed: false, accountInclude: [METEORA_DLMM_PROGRAM_ID.toBase58()], accountExclude: [], accountRequired: [] } }, transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [], commitment: CommitmentLevel.CONFIRMED };
  }
}