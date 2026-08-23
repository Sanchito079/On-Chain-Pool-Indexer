import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePancakeSwapV2Price, decodeSyncLog } from '../src/evm/bsc/pancakeswap-v2-price.js';
import { Interface } from 'ethers';

const wbnb = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const token = '0x0000000000000000000000000000000000000001';
const usdt = '0x55d398326f99059ff775485246999027b3197955';

function pool(token0: string, token1: string, decimals0 = 18, decimals1 = 18) {
  return { address: '0x0000000000000000000000000000000000000003', poolType: 'pancakeswap_v2' as const, chain: 'bsc' as const, factory: '0x0000000000000000000000000000000000000004', token0, token0Symbol: null, token0Decimals: decimals0, token1, token1Symbol: null, token1Decimals: decimals1, pairIndex: '1', transactionHash: '0x', blockNumber: 1, discoveredAt: new Date().toISOString() };
}

test('calculates token price against WBNB with decimals', () => {
  const result = calculatePancakeSwapV2Price(pool(token, wbnb), 2_000_000_000_000_000_000n, 1_000_000_000_000_000_000n, 10);
  assert.equal(result.price, 0.5);
  assert.equal(result.inversePrice, 2);
  assert.equal(result.baseToken, token);
  assert.equal(result.quoteToken, wbnb);
});

test('calculates token price against a stablecoin when token1 is USDT', () => {
  const result = calculatePancakeSwapV2Price(pool(token, usdt, 18, 18), 2_000_000_000_000_000_000n, 4_000_000_000_000_000_000n, 10);
  assert.equal(result.price, 2);
});

test('decodes Sync reserve logs', () => {
  const iface = new Interface(['event Sync(uint112 reserve0, uint112 reserve1)']);
  const encoded = iface.encodeEventLog(iface.getEvent('Sync')!, [123n, 456n]);
  assert.deepEqual(decodeSyncLog({ topics: encoded.topics, data: encoded.data }), { reserve0: 123n, reserve1: 456n });
});