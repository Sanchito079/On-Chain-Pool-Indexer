import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface, zeroPadValue } from 'ethers';
import { decodePairCreatedLog } from '../src/evm/bsc/pancakeswap-v2-indexer.js';

test('decodes PancakeSwap V2 PairCreated events', () => {
  const iface = new Interface(['event PairCreated(address indexed token0, address indexed token1, address pair, uint256)']);
  const token0 = '0x0000000000000000000000000000000000000001';
  const token1 = '0x0000000000000000000000000000000000000002';
  const pair = '0x0000000000000000000000000000000000000003';
  const encoded = iface.encodeEventLog(iface.getEvent('PairCreated')!, [token0, token1, pair, 42n]);
  const result = decodePairCreatedLog({ topics: encoded.topics, data: encoded.data });
  assert.deepEqual(result, { token0, token1, pair, pairIndex: '42' });
});

test('ignores non-PairCreated logs', () => {
  const result = decodePairCreatedLog({ topics: [zeroPadValue('0x01', 32)], data: '0x' });
  assert.equal(result, null);
});