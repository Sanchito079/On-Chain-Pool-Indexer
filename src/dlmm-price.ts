import { PublicKey } from '@solana/web3.js';
import { calculateDlmmPrice } from './price-fetcher/calculator.js';
import { orientPool, USDC_MINT, WSOL_MINT } from './price-fetcher/orientation.js';
import { PoolForPricing, PoolPrice } from './price-fetcher/types.js';
import { MeteoraDlmmPoolRecord } from './dlmm-types.js';
import { applyFdv } from './market-cap.js';

const asPool = (pool: MeteoraDlmmPoolRecord): PoolForPricing => ({
  address: pool.address, poolType: pool.poolType, baseMint: pool.tokenXMint, baseSymbol: pool.tokenXSymbol,
  baseDecimals: pool.tokenXDecimals, poolBaseTokenAccount: pool.reserveX, quoteMint: pool.tokenYMint,
  quoteSymbol: pool.tokenYSymbol, quoteDecimals: pool.tokenYDecimals, poolQuoteTokenAccount: pool.reserveY,
});

export class DlmmPriceProcessor {
  private readonly pools = new Map<string, { pool: PoolForPricing; activeId: number; binStep: number }>();
  private readonly latestSlots = new Map<string, number>();
  private readonly latestPrices = new Map<string, number>();
  private readonly supplies = new Map<string, { raw: bigint; decimals: number }>();
  private solPriceUsd: number | null;
  private usdcPriceUsd: number;

  constructor(private readonly onPrice: (price: PoolPrice) => void, solPriceUsd: number | null = null, usdcPriceUsd = 1) { this.solPriceUsd = solPriceUsd; this.usdcPriceUsd = usdcPriceUsd; }

  setReferencePrices(solPriceUsd: number | null, usdcPriceUsd: number): void { this.solPriceUsd = solPriceUsd; this.usdcPriceUsd = usdcPriceUsd; }

  addPool(record: MeteoraDlmmPoolRecord): void {
    const pool = asPool(record);
    if (orientPool(pool)) this.pools.set(record.address, { pool, activeId: record.activeId, binStep: record.binStep });
    const marketBaseIsX = record.tokenXMint !== WSOL_MINT && record.tokenXMint !== USDC_MINT;
    this.supplies.set(record.address, { raw: BigInt(marketBaseIsX ? record.tokenXTotalSupplyRaw : record.tokenYTotalSupplyRaw), decimals: marketBaseIsX ? record.tokenXDecimals : record.tokenYDecimals });
  }

  addPools(records: MeteoraDlmmPoolRecord[]): void { for (const record of records) this.addPool(record); }

  updatePoolAccount(address: string, data: Uint8Array, slot: number): void {
    const state = this.pools.get(address);
    if (!state || data.length < 904) return;
    state.activeId = Buffer.from(data).readInt32LE(76);
    state.binStep = Buffer.from(data).readUInt16LE(80);
    const orientation = orientPool(state.pool);
    if (!orientation || slot < (this.latestSlots.get(address) ?? 0)) return;
    const previousPrice = this.latestPrices.get(address) ?? null;
    this.latestSlots.set(address, slot);
    const price = calculateDlmmPrice(orientation, state.activeId, state.binStep, slot, address, previousPrice);
    if (price.price !== null && previousPrice === price.price) return;
    if (price.price !== null) this.latestPrices.set(address, price.price);
    const supply = this.supplies.get(address);
    this.onPrice(applyFdv(price, supply?.raw ?? 0n, supply?.decimals ?? orientation.baseDecimals, this.solPriceUsd, this.usdcPriceUsd));
  }
}