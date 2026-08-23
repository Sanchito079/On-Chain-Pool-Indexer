import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { PoolRecord } from './types.js';
import { PoolPrice } from './price-fetcher/types.js';
import { RaydiumClmmPoolRecord } from './raydium-types.js';
import { MeteoraDammV2PoolRecord } from './meteora-types.js';
import { MeteoraDlmmPoolRecord } from './dlmm-types.js';
import { OrcaWhirlpoolRecord } from './orca-types.js';
import { PancakeSwapV2PoolRecord } from './evm/bsc/pancakeswap-v2-types.js';
import { PancakeSwapV3PoolRecord } from './evm/bsc/pancakeswap-v3-types.js';
import { PancakeSwapInfinityClPoolRecord } from './evm/bsc/pancakeswap-infinity-types.js';
import { UniswapV3PoolRecord } from './evm/bsc/uniswap-v3-types.js';

export class PostgresWriter {
  private readonly pool: Pool;
  private readonly readyPromise: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: Number(process.env.POSTGRES_POOL_SIZE ?? 4), connectionTimeoutMillis: 10_000 });
    this.readyPromise = this.initialize();
  }

  ready(): Promise<void> { return this.readyPromise; }

  close(): void { void this.pool.end(); }

  writePool(pool: PoolRecord): void {
    this.enqueue('pools', {
      address: pool.address, pool_type: pool.poolType, program_id: pool.programId, network: pool.network,
      base_mint: pool.baseMint, base_symbol: pool.baseSymbol, base_decimals: pool.baseDecimals, base_logo_url: pool.baseLogoUrl,
      quote_mint: pool.quoteMint, quote_symbol: pool.quoteSymbol, quote_decimals: pool.quoteDecimals, quote_logo_url: pool.quoteLogoUrl,
      lp_mint: pool.lpMint, pool_base_token_account: pool.poolBaseTokenAccount, pool_quote_token_account: pool.poolQuoteTokenAccount,
      creator: pool.creator, coin_creator: pool.coinCreator, pool_index: pool.poolIndex, updated_slot: pool.updatedSlot,
      discovered_at: pool.discoveredAt,
    });
  }

  writeRaydium(pool: RaydiumClmmPoolRecord): void { this.enqueue('raydium_pools', this.camelToSnake(pool)); }
  writeMeteora(pool: MeteoraDammV2PoolRecord): void { this.enqueue('meteora_damm_v2_pools', this.camelToSnake(pool)); }
  writeDlmm(pool: MeteoraDlmmPoolRecord): void { this.enqueue('meteora_dlmm_pools', this.camelToSnake(pool)); }
  writeOrca(pool: OrcaWhirlpoolRecord): void { this.enqueue('orca_whirlpools', this.camelToSnake(pool)); }
  writePancakeSwapV2(pool: PancakeSwapV2PoolRecord): void { this.enqueue('bsc_pancakeswap_v2_pools', this.camelToSnake(pool)); }
  writePancakeSwapV3(pool: PancakeSwapV3PoolRecord): void { this.enqueue('bsc_pancakeswap_v3_pools', this.camelToSnake(pool)); }
  writePancakeSwapInfinity(pool: PancakeSwapInfinityClPoolRecord): void { this.enqueue('bsc_pancakeswap_infinity_cl_pools', this.camelToSnake(pool)); }
  writeUniswapV3(pool: UniswapV3PoolRecord): void { this.enqueue('bsc_uniswap_v3_pools', this.camelToSnake(pool)); }
  writeUniswapV3Price(price: import('./evm/bsc/uniswap-v3-price.js').UniswapV3Price): void { this.enqueue('bsc_uniswap_v3_prices', { pool_address: price.poolAddress, price: price.price, inverse_price: price.inversePrice, base_token: price.baseToken, quote_token: price.quoteToken, sqrt_price_x96: price.sqrtPriceX96.toString(), liquidity: price.liquidity.toString(), tick: price.tick, updated_block: price.updatedBlock, updated_at: price.updatedAt }, 'pool_address'); }
  writePancakeSwapInfinityPrice(price: import('./evm/bsc/pancakeswap-infinity-price.js').PancakeSwapInfinityClPrice): void { this.enqueue('bsc_pancakeswap_infinity_cl_prices', { pool_id: price.poolId, pool_address: price.poolAddress, price: price.price, inverse_price: price.inversePrice, base_currency: price.baseCurrency, quote_currency: price.quoteCurrency, sqrt_price_x96: price.sqrtPriceX96.toString(), liquidity: price.liquidity.toString(), tick: price.tick, fee: price.fee, updated_block: price.updatedBlock, updated_at: price.updatedAt }, 'pool_id'); }
  writePancakeSwapV3Price(price: import('./evm/bsc/pancakeswap-v3-price.js').PancakeSwapV3Price): void {
    this.enqueue('bsc_pancakeswap_v3_prices', { pool_address: price.poolAddress, price: price.price, inverse_price: price.inversePrice, base_token: price.baseToken, quote_token: price.quoteToken, sqrt_price_x96: price.sqrtPriceX96.toString(), liquidity: price.liquidity.toString(), tick: price.tick, updated_block: price.updatedBlock, updated_at: price.updatedAt }, 'pool_address');
  }
  writePancakeSwapV2Price(price: import('./evm/bsc/pancakeswap-v2-price.js').PancakeSwapV2Price): void {
    this.enqueue('bsc_pancakeswap_v2_prices', {
      pool_address: price.poolAddress, reserve0: price.reserve0.toString(), reserve1: price.reserve1.toString(),
      price: price.price, inverse_price: price.inversePrice, base_token: price.baseToken, quote_token: price.quoteToken,
      updated_block: price.updatedBlock, updated_at: price.updatedAt,
    }, 'pool_address');
  }

  writePrice(price: PoolPrice, timestamp = Date.now()): void {
    if (price.price === null) return;
    const now = new Date(timestamp).toISOString();
    this.enqueue('latest_prices', {
      pool_address: price.poolAddress, price: price.price, inverse_price: price.inversePrice, price_change: price.priceChange,
      price_change_percent: price.priceChangePercent, price_change_direction: price.priceChangeDirection, fdv_usd: price.fdvUsd,
      token_price_usd: price.tokenPriceUsd, total_supply: price.totalSupply, supply_basis: price.supplyBasis,
      base_reserve: price.baseReserve.toString(), quote_reserve: price.quoteReserve.toString(), updated_slot: price.updatedSlot, updated_at: now,
    }, 'pool_address');
    const bucketStart = Math.floor(timestamp / 60_000) * 60_000;
    this.enqueue('price_candles', { pool_address: price.poolAddress, timeframe: '1m', bucket_start: bucketStart, open: price.price, high: price.price, low: price.price, close: price.price, volume: null, updated_at: now }, 'pool_address,timeframe,bucket_start', `high=GREATEST(price_candles.high, EXCLUDED.high), low=LEAST(price_candles.low, EXCLUDED.low), close=EXCLUDED.close, updated_at=EXCLUDED.updated_at`);
  }

  private enqueue(table: string, row: Record<string, unknown>, key = 'address', update?: string): void {
    void this.readyPromise.then(() => this.upsert(table, row, key, update)).catch((error: unknown) => console.error(`PostgreSQL write to ${table} failed:`, error instanceof Error ? error.message : error));
  }

  private async initialize(): Promise<void> {
    const schemaPath = path.resolve(process.env.POSTGRES_SCHEMA_PATH ?? 'schema.postgres.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    await this.pool.query(schema);
  }

  private async upsert(table: string, row: Record<string, unknown>, key: string, update?: string): Promise<void> {
    const columns = Object.keys(row);
    const values = columns.map((column) => row[column]);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const keys = key.split(',');
    const updateClause = update ?? columns.filter((column) => !keys.includes(column)).map((column) => `${column}=EXCLUDED.${column}`).join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${keys.join(', ')}) DO UPDATE SET ${updateClause}`;
    await this.pool.query(sql, values);
  }

  private camelToSnake<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), entry]));
  }
}
