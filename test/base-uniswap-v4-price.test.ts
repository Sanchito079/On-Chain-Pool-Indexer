import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateUniswapV4Price } from '../src/evm/bsc/uniswap-v4-price.js';

test('recognizes Base WETH as a trusted Uniswap v4 quote', () => {
  const pool = { address: '0x0000000000000000000000000000000000000003', poolType: 'uniswap_v4' as const, chain: 'base' as const, manager: '0x0000000000000000000000000000000000000004', poolId: '0x01', currency0: '0x0000000000000000000000000000000000000001', currency0Symbol: 'TOKEN', currency0Decimals: 18, currency1: '0x4200000000000000000000000000000000000006', currency1Symbol: 'WETH', currency1Decimals: 18, fee: 3000, tickSpacing: 60, hooks: '0x0000000000000000000000000000000000000000', sqrtPriceX96: '0', tick: 0, transactionHash: '0x', blockNumber: 1, discoveredAt: new Date().toISOString() };
  const price = calculateUniswapV4Price(pool, 2n ** 96n, 1n, 0, 3000, 2);
  assert.equal(price.price, 1);
  assert.equal(price.quoteCurrency, pool.currency1);
});