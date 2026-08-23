import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface } from 'ethers';
import { decodePancakeSwapV3PoolCreated } from '../src/evm/bsc/pancakeswap-v3-indexer.js';

test('decodes PancakeSwap V3 PoolCreated events', () => {
  const iface = new Interface(['event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)']);
  const token0 = '0x0000000000000000000000000000000000000001';
  const token1 = '0x0000000000000000000000000000000000000002';
  const pool = '0x0000000000000000000000000000000000000003';
  const encoded = iface.encodeEventLog(iface.getEvent('PoolCreated')!, [token0, token1, 2500, 60, pool]);
  assert.deepEqual(decodePancakeSwapV3PoolCreated({ topics: encoded.topics, data: encoded.data }), { token0, token1, fee: 2500, tickSpacing: 60, pool });
});

test('rejects malformed PancakeSwap V3 logs', () => {
  assert.equal(decodePancakeSwapV3PoolCreated({ topics: [], data: '0x' }), null);
});