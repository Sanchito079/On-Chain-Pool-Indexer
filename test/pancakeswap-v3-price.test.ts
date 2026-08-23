import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface } from 'ethers';
import { calculatePancakeSwapV3Price, decodeSwapLog } from '../src/evm/bsc/pancakeswap-v3-price.js';

const wbnb = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const token = '0x0000000000000000000000000000000000000001';

function pool(token0: string, token1: string, decimals0 = 18, decimals1 = 18) {
  return { address: '0x0000000000000000000000000000000000000003', poolType: 'pancakeswap_v3' as const, chain: 'bsc' as const, factory: '0x0000000000000000000000000000000000000004', token0, token0Symbol: null, token0Decimals: decimals0, token1, token1Symbol: null, token1Decimals: decimals1, fee: 2500, tickSpacing: 60, transactionHash: '0x', blockNumber: 1, discoveredAt: new Date().toISOString() };
}

test('calculates PancakeSwap V3 price from sqrtPriceX96', () => {
  const result = calculatePancakeSwapV3Price(pool(token, wbnb), 2n ** 96n, 100n, 0, 10);
  assert.equal(result.price, 1);
  assert.equal(result.inversePrice, 1);
  assert.equal(result.baseToken, token);
  assert.equal(result.quoteToken, wbnb);
});

test('inverts PancakeSwap V3 price when WBNB is token0', () => {
  const result = calculatePancakeSwapV3Price(pool(wbnb, token), 2n ** 96n, 100n, 0, 10);
  assert.equal(result.price, 1);
  assert.equal(result.inversePrice, 1);
  assert.equal(result.baseToken, token);
  assert.equal(result.quoteToken, wbnb);
});

test('decodes PancakeSwap V3 Swap logs', () => {
  const iface = new Interface(['event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)']);
  const encoded = iface.encodeEventLog(iface.getEvent('Swap')!, ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002', -10n, 20n, 2n ** 96n, 123n, -4]);
  assert.deepEqual(decodeSwapLog({ topics: encoded.topics, data: encoded.data }), { sqrtPriceX96: 2n ** 96n, liquidity: 123n, tick: -4 });
});