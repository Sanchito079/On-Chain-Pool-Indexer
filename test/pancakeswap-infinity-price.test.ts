import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface } from 'ethers';
import { calculateInfinityClPrice, decodeInfinitySwap } from '../src/evm/bsc/pancakeswap-infinity-price.js';

const bnb = '0x0000000000000000000000000000000000000000';
const token = '0x0000000000000000000000000000000000000001';

function pool(currency0: string, currency1: string, decimals0 = 18, decimals1 = 18) {
  return { address: `0x${'03'.padStart(64, '0')}`, poolType: 'pancakeswap_infinity_cl' as const, chain: 'bsc' as const, manager: '0x0000000000000000000000000000000000000004', poolId: `0x${'01'.padStart(64, '0')}`, currency0, currency0Symbol: null, currency0Decimals: decimals0, currency0TotalSupplyRaw: '0', currency1, currency1Symbol: null, currency1Decimals: decimals1, currency1TotalSupplyRaw: '0', hooks: bnb, fee: 3000, parameters: '0x', sqrtPriceX96: '0', liquidity: '0', tick: 0, transactionHash: '0x', blockNumber: 1, discoveredAt: new Date().toISOString() };
}

test('calculates Infinity CL price from sqrtPriceX96', () => {
  const result = calculateInfinityClPrice(pool(token, bnb), 2n ** 96n, 100n, 0, 3000, 10);
  assert.equal(result.price, 1);
  assert.equal(result.inversePrice, 1);
  assert.equal(result.baseCurrency, token);
  assert.equal(result.quoteCurrency, bnb);
});

test('inverts Infinity CL price when BNB is currency0', () => {
  const result = calculateInfinityClPrice(pool(bnb, token), 2n ** 96n, 100n, 0, 3000, 10);
  assert.equal(result.price, 1);
  assert.equal(result.inversePrice, 1);
  assert.equal(result.baseCurrency, token);
  assert.equal(result.quoteCurrency, bnb);
});

test('decodes Infinity CL Swap events', () => {
  const iface = new Interface(['event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)']);
  const encoded = iface.encodeEventLog(iface.getEvent('Swap')!, [`0x${'01'.padStart(64, '0')}`, bnb, -10n, 20n, 2n ** 96n, 123n, -4, 3000, 0]);
  assert.deepEqual(decodeInfinitySwap({ topics: encoded.topics, data: encoded.data }), { poolId: `0x${'01'.padStart(64, '0')}`, sqrtPriceX96: 2n ** 96n, liquidity: 123n, tick: -4, fee: 3000 });
});