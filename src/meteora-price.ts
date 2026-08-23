import { PublicKey } from '@solana/web3.js';
import { calculateSqrtPrice } from './price-fetcher/calculator.js';
import { orientPool } from './price-fetcher/orientation.js';
import { PoolForPricing, PoolPrice } from './price-fetcher/types.js';
import { MeteoraDammV2PoolRecord } from './meteora-types.js';
import { applyFdv } from './market-cap.js';

type Balance = { accountIndex?: number | string; uiTokenAmount?: { amount?: string } };

const asPool = (pool: MeteoraDammV2PoolRecord): PoolForPricing => ({
  address: pool.address, poolType: pool.poolType,
  baseMint: pool.tokenAMint, baseSymbol: pool.tokenASymbol, baseDecimals: pool.tokenADecimals,
  poolBaseTokenAccount: pool.tokenAVault, quoteMint: pool.tokenBMint, quoteSymbol: pool.tokenBSymbol,
  quoteDecimals: pool.tokenBDecimals, poolQuoteTokenAccount: pool.tokenBVault,
});

export class MeteoraPriceProcessor {
  private readonly poolsByVault = new Map<string, { pool: PoolForPricing; side: 'base' | 'quote' }>();
  private readonly reserves = new Map<string, { base: bigint; quote: bigint; slot: number }>();
  private readonly latestPrices = new Map<string, number>();
  private readonly sqrtPrices = new Map<string, bigint>();
  private readonly supplies = new Map<string, { raw: bigint; decimals: number }>();
  private solPriceUsd: number | null;
  private usdcPriceUsd: number;

  constructor(private readonly onPrice: (price: PoolPrice) => void, solPriceUsd: number | null = null, usdcPriceUsd = 1) { this.solPriceUsd = solPriceUsd; this.usdcPriceUsd = usdcPriceUsd; }

  setReferencePrices(solPriceUsd: number | null, usdcPriceUsd: number): void { this.solPriceUsd = solPriceUsd; this.usdcPriceUsd = usdcPriceUsd; }

  addPool(pool: MeteoraDammV2PoolRecord): void {
    const pricingPool = asPool(pool);
    const orientation = orientPool(pricingPool);
    if (!orientation) return;
    this.poolsByVault.set(orientation.baseVault, { pool: pricingPool, side: 'base' });
    this.poolsByVault.set(orientation.quoteVault, { pool: pricingPool, side: 'quote' });
    this.reserves.set(pool.address, { base: BigInt(pool.tokenAAmount), quote: BigInt(pool.tokenBAmount), slot: pool.updatedSlot });
    this.sqrtPrices.set(pool.address, BigInt(pool.sqrtPrice));
    const supply = pool.tokenAMint === pricingPool.baseMint ? pool.tokenATotalSupplyRaw : pool.tokenBTotalSupplyRaw;
    const decimals = pool.tokenAMint === pricingPool.baseMint ? pool.tokenADecimals : pool.tokenBDecimals;
    this.supplies.set(pool.address, { raw: BigInt(supply), decimals });
  }

  updatePoolAccount(address: string, data: Uint8Array, slot: number): void {
    const known = [...this.poolsByVault.values()].find(({ pool }) => pool.address === address);
    if (!known || data.length < 696) return;
    const base = BigInt(Buffer.from(data).readBigUInt64LE(680));
    const quote = BigInt(Buffer.from(data).readBigUInt64LE(688));
    const sqrtPrice = this.readU128(Buffer.from(data), 456);
    this.sqrtPrices.set(address, sqrtPrice);
    const current = this.reserves.get(address);
    if (!current || current.slot <= slot) {
      this.reserves.set(address, { base, quote, slot });
      const orientation = orientPool(known.pool);
      if (orientation) {
        const price = calculateSqrtPrice(orientation, sqrtPrice, base, quote, slot, address, this.latestPrices.get(address) ?? null);
        if (price.price !== null) this.latestPrices.set(address, price.price);
        this.onPrice(applyFdv(price, this.supplies.get(address)?.raw ?? 0n, this.supplies.get(address)?.decimals ?? orientation.baseDecimals, this.solPriceUsd, this.usdcPriceUsd));
      }
    }
  }

  addPools(pools: MeteoraDammV2PoolRecord[]): void {
    for (const pool of pools) this.addPool(pool);
  }

  processTransaction(update: unknown): void {
    const transaction = (update as { transaction?: { slot?: string; transaction?: { transaction?: { message?: { accountKeys?: Uint8Array[] } }; meta?: { postTokenBalances?: Balance[] } } } }).transaction;
    const message = transaction?.transaction?.transaction?.message;
    const meta = transaction?.transaction?.meta;
    if (!transaction || !message?.accountKeys || !meta?.postTokenBalances) return;
    const keys = message.accountKeys.map((key) => new PublicKey(key).toBase58());
    const slot = Number(transaction.slot ?? 0);
    const changed = new Map<string, { pool: PoolForPricing; base?: bigint; quote?: bigint }>();
    for (const balance of meta.postTokenBalances) {
      const index = Number(balance.accountIndex);
      const match = this.poolsByVault.get(keys[index]);
      const amount = balance.uiTokenAmount?.amount;
      if (!match || !amount) continue;
      const current = changed.get(match.pool.address) ?? { pool: match.pool };
      current[match.side] = BigInt(amount);
      changed.set(match.pool.address, current);
    }
    for (const update of changed.values()) {
      if (update.base === undefined || update.quote === undefined) continue;
      const current = this.reserves.get(update.pool.address);
      if (current && current.slot > slot) continue;
      this.reserves.set(update.pool.address, { base: update.base, quote: update.quote, slot });
      const orientation = orientPool(update.pool);
      if (!orientation) continue;
      const sqrtPrice = this.sqrtPrices.get(update.pool.address);
      if (sqrtPrice === undefined) continue;
      const price = calculateSqrtPrice(orientation, sqrtPrice, update.base, update.quote, slot, update.pool.address, this.latestPrices.get(update.pool.address) ?? null);
      if (price.price !== null) this.latestPrices.set(update.pool.address, price.price);
      this.onPrice(applyFdv(price, this.supplies.get(update.pool.address)?.raw ?? 0n, this.supplies.get(update.pool.address)?.decimals ?? orientation.baseDecimals, this.solPriceUsd, this.usdcPriceUsd));
    }
  }

  private readU128(data: Buffer, offset: number): bigint {
    let value = 0n;
    for (let index = 15; index >= 0; index -= 1) value = (value << 8n) | BigInt(data[offset + index]);
    return value;
  }
}