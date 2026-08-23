import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface } from 'ethers';
import { decodeBaseUniswapV4Initialize } from '../src/evm/base/uniswap-v4-indexer.js';

test('decodes Base Uniswap v4 Initialize events', () => {
  const iface = new Interface(['event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)']);
  const poolId = `0x${'01'.padStart(64, '0')}`;
  const encoded = iface.encodeEventLog(iface.getEvent('Initialize')!, [poolId, '0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000000', '3000', '60', '0x0000000000000000000000000000000000000000', 2n ** 96n, -1]);
  assert.equal(decodeBaseUniswapV4Initialize({ topics: encoded.topics, data: encoded.data })?.poolId, poolId);
});