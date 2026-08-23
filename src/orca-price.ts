import { calculateSqrtPrice } from './price-fetcher/calculator.js';
import { orientPool } from './price-fetcher/orientation.js';
import { PoolForPricing, PoolPrice } from './price-fetcher/types.js';
import { OrcaWhirlpoolRecord } from './orca-types.js';
import { applyFdv } from './market-cap.js';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const asPool = (pool: OrcaWhirlpoolRecord): PoolForPricing => ({
  address: pool.address, poolType: pool.poolType, baseMint: pool.tokenMintA, baseSymbol: pool.tokenMintASymbol,
  baseDecimals: pool.tokenMintADecimals, poolBaseTokenAccount: pool.tokenVaultA, quoteMint: pool.tokenMintB,
  quoteSymbol: pool.tokenMintBSymbol, quoteDecimals: pool.tokenMintBDecimals, poolQuoteTokenAccount: pool.tokenVaultB,
});

export class OrcaPriceProcessor {
  private readonly pools = new Map<string, PoolForPricing>();
  private readonly supplies = new Map<string, { raw: bigint; decimals: number }>();
  private readonly latestSlots = new Map<string, number>();
  private readonly latestPrices = new Map<string, number>();
  private solPriceUsd: number | null;
  private usdcPriceUsd: number;

  constructor(private readonly onPrice: (price: PoolPrice) => void, solPriceUsd: number | null = null, usdcPriceUsd = 1) {
    this.solPriceUsd = solPriceUsd;
    this.usdcPriceUsd = usdcPriceUsd;
  }

  setReferencePrices(solPriceUsd: number | null, usdcPriceUsd: number): void { this.solPriceUsd = solPriceUsd; this.usdcPriceUsd = usdcPriceUsd; }

  addPool(record: OrcaWhirlpoolRecord): void {
    const pool = asPool(record);
    if (!orientPool(pool)) return;
    this.pools.set(record.address, pool);
    const marketBaseIsA = record.tokenMintA !== WSOL_MINT && record.tokenMintA !== USDC_MINT;
    this.supplies.set(record.address, { raw: BigInt(marketBaseIsA ? record.tokenMintATotalSupplyRaw : record.tokenMintBTotalSupplyRaw), decimals: marketBaseIsA ? record.tokenMintADecimals : record.tokenMintBDecimals });
  }

  addPools(records: OrcaWhirlpoolRecord[]): void { for (const record of records) this.addPool(record); }

  updatePoolAccount(address: string, data: Uint8Array, slot: number): void {
    const pool = this.pools.get(address);
    if (!pool || data.length < 81 || slot < (this.latestSlots.get(address) ?? 0)) return;
    const buffer = Buffer.from(data);
    let sqrtPriceX64 = 0n;
    for (let index = 15; index >= 0; index -= 1) sqrtPriceX64 = (sqrtPriceX64 << 8n) | BigInt(buffer[65 + index]);
    const orientation = orientPool(pool);
    if (!orientation || sqrtPriceX64 === 0n) return;
    const previousPrice = this.latestPrices.get(address) ?? null;
    const price = calculateSqrtPrice(orientation, sqrtPriceX64, 0n, 0n, slot, address, previousPrice);
    this.latestSlots.set(address, slot);
    if (price.price === null || price.price === previousPrice) return;
    this.latestPrices.set(address, price.price);
    const supply = this.supplies.get(address);
    this.onPrice(applyFdv(price, supply?.raw ?? 0n, supply?.decimals ?? orientation.baseDecimals, this.solPriceUsd, this.usdcPriceUsd));
  }
}