import { PublicKey } from '@solana/web3.js';
import { loadTokenMetadata, metadataAddresses } from './metadata.js';
import { decodeMintDecimals } from './decoder.js';
import { RotatingRpc } from './rpc.js';
import { asPublicKey } from './solana-keys.js';
import { wasAccountCreated } from './pool-discovery.js';
import { PoolDatabase } from './db.js';
import { decodeOrcaWhirlpool, orcaWhirlpoolDiscriminator } from './orca-decoder.js';
import { ORCA_WHIRLPOOL_PROGRAM_ID } from './orca-constants.js';

export class OrcaIndexer {
  private readonly http: RotatingRpc;
  private readonly processing = new Set<string>();

  constructor(private readonly database: PoolDatabase, httpUrls: string[], private readonly onPool?: (pool: import('./orca-types.js').OrcaWhirlpoolRecord) => void) { this.http = new RotatingRpc(httpUrls); }

  async processSignature(signature: string, slot: number): Promise<void> {
    const transaction = await this.http.getParsedTransaction(signature);
    if (!transaction) return;
    const keys = transaction.transaction.message.accountKeys.map((account) => asPublicKey(account.pubkey));
    const preBalances = transaction.meta?.preBalances ?? [];
    const postBalances = transaction.meta?.postBalances ?? [];
    const candidates = keys.map((key, index) => ({ key, index })).filter(({ key, index }) => key && wasAccountCreated(preBalances[index], postBalances[index]));
    if (!candidates.length) return;
    const accounts = await this.http.getMultipleAccountsInfo(candidates.map(({ key }) => key!));
    for (const [index, account] of accounts.entries()) {
      const candidate = candidates[index];
      if (!account || !account.owner.equals(ORCA_WHIRLPOOL_PROGRAM_ID) || !account.data.subarray(0, 8).equals(orcaWhirlpoolDiscriminator())) continue;
      const address = candidate.key!.toBase58();
      if (this.processing.has(address) || this.database.hasOrcaWhirlpool(address)) continue;
      this.processing.add(address);
      try { await this.indexPool(address, account.data, slot); } finally { this.processing.delete(address); }
    }
  }

  private async indexPool(address: string, data: Buffer, slot: number): Promise<void> {
    const mints = [new PublicKey(data.subarray(101, 133)), new PublicKey(data.subarray(181, 213))];
    const mintAccounts = await this.http.getMultipleAccountsInfo(mints);
    const metadataAccounts = await this.http.getMultipleAccountsInfo(metadataAddresses(mints));
    const metadata = new Map<string, { symbol: string | null; decimals: number; logoUrl: string | null; totalSupplyRaw: string }>();
    for (const [index, mint] of mints.entries()) {
      const token = await loadTokenMetadata(mint, mintAccounts[index]?.data ?? null, metadataAccounts[index]?.data ?? null);
      metadata.set(mint.toBase58(), { ...token, decimals: mintAccounts[index] ? decodeMintDecimals(mintAccounts[index].data) : 0 });
    }
    const pool = decodeOrcaWhirlpool(address, data, slot, metadata);
    this.database.upsertOrcaWhirlpool(pool);
    this.onPool?.(pool);
    console.log(`Indexed new Orca Whirlpool ${address} (${this.database.orcaWhirlpoolCount()} total).`);
  }
}