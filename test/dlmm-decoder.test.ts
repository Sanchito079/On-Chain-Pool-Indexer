import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair } from '@solana/web3.js';
import { decodeDlmmPool, dlmmPairDiscriminator } from '../src/dlmm-decoder.js';

test('decodes Meteora DLMM LbPair fields', () => {
  const keys = Array.from({ length: 5 }, () => Keypair.generate().publicKey);
  const data = Buffer.alloc(904);
  dlmmPairDiscriminator().copy(data, 0);
  data.writeInt32LE(-42, 76);
  data.writeUInt16LE(25, 80);
  keys[0].toBuffer().copy(data, 88);
  keys[1].toBuffer().copy(data, 120);
  keys[2].toBuffer().copy(data, 152);
  keys[3].toBuffer().copy(data, 184);
  keys[4].toBuffer().copy(data, 848);
  data.writeBigUInt64LE(1234n, 816);
  const pool = decodeDlmmPool('pool', data, 99, new Map([
    [keys[0].toBase58(), { symbol: 'X', decimals: 6, logoUrl: null, totalSupplyRaw: '1000' }],
    [keys[1].toBase58(), { symbol: 'Y', decimals: 9, logoUrl: null, totalSupplyRaw: '2000' }],
  ]));
  assert.equal(pool.poolType, 'meteora_dlmm');
  assert.equal(pool.tokenXMint, keys[0].toBase58());
  assert.equal(pool.tokenYMint, keys[1].toBase58());
  assert.equal(pool.reserveX, keys[2].toBase58());
  assert.equal(pool.reserveY, keys[3].toBase58());
  assert.equal(pool.creator, keys[4].toBase58());
  assert.equal(pool.activeId, -42);
  assert.equal(pool.binStep, 25);
  assert.equal(pool.activationPoint, '1234');
});