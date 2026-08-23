import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair } from '@solana/web3.js';
import { decodeRaydiumPool, raydiumPoolDiscriminator } from '../src/raydium-decoder.js';

test('decodes Raydium CLMM PoolState metadata and layout', () => {
  const keys = Array.from({ length: 7 }, () => Keypair.generate().publicKey);
  const data = Buffer.alloc(273);
  raydiumPoolDiscriminator().copy(data, 0);
  for (const [index, key] of keys.entries()) key.toBuffer().copy(data, 9 + index * 32);
  data[233] = 6;
  data[234] = 9;
  data.writeUInt16LE(64, 235);
  data[253] = 1;
  data[269] = 255;
  const pool = decodeRaydiumPool(keys[0].toBase58(), data, 123, new Map([
    [keys[2].toBase58(), { symbol: 'TOKEN0', decimals: 6, logoUrl: null, totalSupplyRaw: '0' }],
    [keys[3].toBase58(), { symbol: 'TOKEN1', decimals: 9, logoUrl: null, totalSupplyRaw: '0' }],
  ]));
  assert.equal(pool.poolType, 'raydium_clmm');
  assert.equal(pool.tokenMint0, keys[2].toBase58());
  assert.equal(pool.tokenMint1, keys[3].toBase58());
  assert.equal(pool.tokenVault0, keys[4].toBase58());
  assert.equal(pool.tokenVault1, keys[5].toBase58());
  assert.equal(pool.tickSpacing, 64);
  assert.equal(pool.tickCurrent, 255);
});