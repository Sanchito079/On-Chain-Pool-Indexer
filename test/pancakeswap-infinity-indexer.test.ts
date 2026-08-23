import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface } from 'ethers';
import { decodeInfinityInitialize } from '../src/evm/bsc/pancakeswap-infinity-indexer.js';

test('decodes PancakeSwap Infinity CL Initialize events', () => {
  const iface = new Interface(['event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)']);
  const poolId = `0x${'01'.padStart(64, '0')}`;
  const currency0 = '0x0000000000000000000000000000000000000001';
  const currency1 = '0x0000000000000000000000000000000000000002';
  const hooks = '0x0000000000000000000000000000000000000003';
  const parameters = `0x${'02'.padStart(64, '0')}`;
  const encoded = iface.encodeEventLog(iface.getEvent('Initialize')!, [poolId, currency0, currency1, hooks, 3000, parameters, 2n ** 96n, -12]);
  assert.deepEqual(decodeInfinityInitialize({ topics: encoded.topics, data: encoded.data }), { poolId, currency0, currency1, hooks, fee: 3000, parameters, sqrtPriceX96: 2n ** 96n, tick: -12 });
});