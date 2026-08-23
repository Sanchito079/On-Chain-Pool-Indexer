import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface } from 'ethers';
import { decodeUniswapV4Initialize } from '../src/evm/bsc/uniswap-v4-indexer.js';
import { calculateUniswapV4Price, decodeUniswapV4Swap } from '../src/evm/bsc/uniswap-v4-price.js';

const bnb = '0x0000000000000000000000000000000000000000';
const token = '0x0000000000000000000000000000000000000001';

function pool(currency0: string, currency1: string) {
  return { address: `0x${'03'.padStart(64, '0')}`, poolType: 'uniswap_v4' as const, chain: 'bsc' as const, manager: '0x0000000000000000000000000000000000000004', poolId: `0x${'01'.padStart(64, '0')}`, currency0, currency0Symbol: null, currency0Decimals: 18, currency1, currency1Symbol: null, currency1Decimals: 18, fee: 3000, tickSpacing: 60, hooks: bnb, sqrtPriceX96: '0', tick: 0, transactionHash: '0x', blockNumber: 1, discoveredAt: new Date().toISOString() };
}

test('decodes Uniswap v4 Initialize events', () => {
  const iface = new Interface(['event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)']);
  const id = `0x${'01'.padStart(64, '0')}`;
  const encoded = iface.encodeEventLog(iface.getEvent('Initialize')!, [id, token, bnb, 3000, 60, bnb, 2n ** 96n, -1]);
  assert.deepEqual(decodeUniswapV4Initialize({ topics: encoded.topics, data: encoded.data }), { poolId: id, currency0: token, currency1: bnb, fee: 3000, tickSpacing: 60, hooks: bnb, sqrtPriceX96: 2n ** 96n, tick: -1 });
});

test('calculates and orients Uniswap v4 BSC CL price', () => {
  const result = calculateUniswapV4Price(pool(token, bnb), 2n ** 96n, 100n, 0, 3000, 10);
  assert.equal(result.price, 1);
  assert.equal(result.baseCurrency, token);
  assert.equal(result.quoteCurrency, bnb);
});

test('decodes Uniswap v4 Swap events', () => {
  const iface = new Interface(['event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)']);
  const encoded = iface.encodeEventLog(iface.getEvent('Swap')!, [`0x${'01'.padStart(64, '0')}`, bnb, -10n, 20n, 2n ** 96n, 123n, -4, 3000]);
  assert.deepEqual(decodeUniswapV4Swap({ topics: encoded.topics, data: encoded.data }), { poolId: `0x${'01'.padStart(64, '0')}`, sqrtPriceX96: 2n ** 96n, liquidity: 123n, tick: -4, fee: 3000 });
});