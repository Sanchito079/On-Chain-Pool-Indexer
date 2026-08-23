import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePrice, calculateSqrtPrice } from '../src/price-fetcher/calculator.js';
import { orientPool, USDC_MINT, WSOL_MINT } from '../src/price-fetcher/orientation.js';
import { PoolForPricing } from '../src/price-fetcher/types.js';

const pool = (baseMint: string, quoteMint: string): PoolForPricing => ({
  address: 'pool', baseMint, baseSymbol: 'ALT', baseDecimals: 6, poolBaseTokenAccount: 'base-vault',
  poolType: 'pumpswap_amm',
  quoteMint, quoteSymbol: quoteMint === WSOL_MINT ? 'SOL' : 'USDC', quoteDecimals: quoteMint === WSOL_MINT ? 9 : 6,
  poolQuoteTokenAccount: 'quote-vault',
});

test('keeps protocol base/quote when altcoin is protocol base', () => {
  const orientation = orientPool(pool('ALT_MINT', WSOL_MINT));
  assert.equal(orientation?.baseMint, 'ALT_MINT');
  assert.equal(orientation?.quoteAsset, 'WSOL');
  assert.equal(orientation?.protocolIsMarketOriented, true);
});

test('inverts protocol orientation when WSOL is protocol base', () => {
  const orientation = orientPool(pool(WSOL_MINT, 'ALT_MINT'));
  assert.equal(orientation?.baseMint, 'ALT_MINT');
  assert.equal(orientation?.quoteMint, WSOL_MINT);
  assert.equal(orientation?.protocolIsMarketOriented, false);
});

test('calculates normalized and inverse prices once', () => {
  const orientation = orientPool(pool('ALT_MINT', USDC_MINT));
  assert.ok(orientation);
  const result = calculatePrice(orientation, 2_000_000n, 500_000n, 123, 'pool', 0.2);
  assert.ok(Math.abs((result.price ?? 0) - 0.25) < 1e-12);
  assert.equal(result.inversePrice, 4);
  assert.ok(Math.abs((result.priceChange ?? 0) - 0.05) < 1e-12);
  assert.ok(Math.abs((result.priceChangePercent ?? 0) - 25) < 1e-12);
  assert.equal(result.priceChangeDirection, 'up');
});

test('returns null prices for empty liquidity', () => {
  const orientation = orientPool(pool('ALT_MINT', WSOL_MINT));
  assert.ok(orientation);
  const result = calculatePrice(orientation, 0n, 500_000_000n, 123, 'pool', 1);
  assert.equal(result.price, null);
  assert.equal(result.inversePrice, null);
});

test('uses Q64.64 sqrt price for concentrated or fee-aware pools', () => {
  const orientation = orientPool({ ...pool(WSOL_MINT, USDC_MINT), baseDecimals: 9, quoteDecimals: 6 });
  assert.ok(orientation);
  const sqrtPrice = BigInt(Math.round(Math.sqrt(93 / 1_000) * 2 ** 64));
  const result = calculateSqrtPrice(orientation, sqrtPrice, 1n, 1n, 123, 'pool');
  assert.ok(Math.abs((result.price ?? 0) - 93) < 0.01);
  assert.equal(result.inversePrice !== null, true);
});

test('uses protocol decimals before inverting a flipped Meteora pair', () => {
  const orientation = orientPool({ ...pool(WSOL_MINT, 'ALT_MINT'), baseDecimals: 9, quoteDecimals: 6 });
  assert.ok(orientation);
  const sqrtPrice = BigInt(Math.round(Math.sqrt(1 / 4e-7 / 1_000) * 2 ** 64));
  const result = calculateSqrtPrice(orientation, sqrtPrice, 1n, 1n, 123, 'pool');
  assert.ok(Math.abs((result.price ?? 0) - 4e-7) < 1e-9);
});