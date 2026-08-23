import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface } from 'ethers';
import { decodeUniswapV3PoolCreated } from '../src/evm/bsc/uniswap-v3-indexer.js';
import { calculateUniswapV3Price, decodeUniswapV3Swap } from '../src/evm/bsc/uniswap-v3-price.js';

const wbnb = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const token = '0x0000000000000000000000000000000000000001';

function pool(token0: string, token1: string) {
  return { address: '0x0000000000000000000000000000000000000003', poolType: 'uniswap_v3' as const, chain: 'bsc' as const, factory: '0x0000000000000000000000000000000000000004', token0, token0Symbol: null, token0Decimals: 18, token1, token1Symbol: null, token1Decimals: 18, fee: 3000, tickSpacing: 60, transactionHash: '0x', blockNumber: 1, discoveredAt: new Date().toISOString() };
}

test('decodes Uniswap V3 PoolCreated events', () => {
  const iface = new Interface(['event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)']);
  const encoded = iface.encodeEventLog(iface.getEvent('PoolCreated')!, [token, wbnb, 3000, 60, pool(token, wbnb).address]);
  assert.deepEqual(decodeUniswapV3PoolCreated({ topics: encoded.topics, data: encoded.data }), { token0: token, token1: wbnb, fee: 3000, tickSpacing: 60, pool: pool(token, wbnb).address });
});

test('calculates and orients Uniswap V3 BSC price', () => {
  const result = calculateUniswapV3Price(pool(token, wbnb), 2n ** 96n, 100n, 0, 10);
  assert.equal(result.price, 1);
  assert.equal(result.baseToken, token);
  assert.equal(result.quoteToken, wbnb);
});

test('decodes Uniswap V3 Swap events', () => {
  const iface = new Interface(['event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)']);
  const encoded = iface.encodeEventLog(iface.getEvent('Swap')!, [token, wbnb, -10n, 20n, 2n ** 96n, 123n, -4]);
  assert.deepEqual(decodeUniswapV3Swap({ topics: encoded.topics, data: encoded.data }), { sqrtPriceX96: 2n ** 96n, liquidity: 123n, tick: -4 });
});