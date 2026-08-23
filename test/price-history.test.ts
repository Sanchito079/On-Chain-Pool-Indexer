import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PoolDatabase } from '../src/db.js';
import { calculatePrice } from '../src/price-fetcher/calculator.js';
import { orientPool, WSOL_MINT } from '../src/price-fetcher/orientation.js';

test('persists latest price and aggregates one-minute candle high and low', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pumpswap-history-'));
  const database = new PoolDatabase(path.join(directory, 'prices.db'));
  const orientation = orientPool({
    address: 'pool', baseMint: 'ALT', baseSymbol: 'ALT', baseDecimals: 6, poolBaseTokenAccount: 'base-vault',
    poolType: 'pumpswap_amm',
    quoteMint: WSOL_MINT, quoteSymbol: 'SOL', quoteDecimals: 9, poolQuoteTokenAccount: 'quote-vault',
  });
  assert.ok(orientation);
  const first = calculatePrice(orientation, 1_000_000n, 100_000_000n, 1, 'pool');
  const second = calculatePrice(orientation, 1_000_000n, 200_000_000n, 2, 'pool');
  const timestamp = Date.now();
  database.recordPrice(first, timestamp);
  database.recordPrice(second, timestamp + 1_000);
  const stats = database.twentyFourHourStats('pool', timestamp + 2_000);
  assert.equal(stats.low, 0.1);
  assert.equal(stats.high, 0.2);
  database.close();
  rmSync(directory, { recursive: true, force: true });
});