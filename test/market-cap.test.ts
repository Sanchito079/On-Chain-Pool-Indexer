import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMarketCap, quotePriceUsd } from '../src/market-cap.js';

test('calculates FDV from total on-chain supply without mislabeling it as market cap', () => {
  const result = calculateMarketCap(0.0000004, 100, { totalSupplyRaw: 1_000_000_000_000_000n, decimals: 6 });
  assert.ok(Math.abs((result.tokenPriceUsd ?? 0) - 0.00004) < 1e-12);
  assert.equal(result.fdvUsd, 40_000);
  assert.equal(result.marketCapUsd, null);
  assert.equal(result.supplyBasis, 'total_supply');
});

test('uses circulating supply for market cap when explicitly available', () => {
  const result = calculateMarketCap(2, 1, { totalSupplyRaw: 1_000n, circulatingSupplyRaw: 250n, decimals: 2 });
  assert.equal(result.fdvUsd, 20);
  assert.equal(result.marketCapUsd, 5);
  assert.equal(result.supplyBasis, 'circulating_supply');
});

test('only recognizes trusted quote mints for USD conversion', () => {
  assert.equal(quotePriceUsd('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', null), 1);
  assert.equal(quotePriceUsd('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', null, 0.9998), 0.9998);
  assert.equal(quotePriceUsd('So11111111111111111111111111111111111111112', 150), 150);
  assert.equal(quotePriceUsd('unknown', 150), null);
});