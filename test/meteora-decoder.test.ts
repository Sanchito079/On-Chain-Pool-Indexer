import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair } from '@solana/web3.js';
import { decodeMeteoraPool, meteoraPoolDiscriminator } from '../src/meteora-decoder.js';

test('decodes Meteora DAMM v2 Pool account fields', () => {
  const keys = Array.from({ length: 6 }, () => Keypair.generate().publicKey);
  const data = Buffer.alloc(1112);
  meteoraPoolDiscriminator().copy(data, 0);
  keys[0].toBuffer().copy(data, 168);
  keys[1].toBuffer().copy(data, 200);
  keys[2].toBuffer().copy(data, 232);
  keys[3].toBuffer().copy(data, 264);
  keys[4].toBuffer().copy(data, 648);
  data.writeBigUInt64LE(123n, 680);
  data.writeBigUInt64LE(456n, 688);
  data.writeBigUInt64LE(789n, 472);
  data.writeUInt8(1, 484);
  const pool = decodeMeteoraPool('pool', data, 99, new Map([
    [keys[0].toBase58(), { symbol: 'A', decimals: 6, logoUrl: null, totalSupplyRaw: '1000' }],
    [keys[1].toBase58(), { symbol: 'B', decimals: 9, logoUrl: null, totalSupplyRaw: '2000' }],
  ]));
  assert.equal(pool.poolType, 'meteora_damm_v2');
  assert.equal(pool.tokenAMint, keys[0].toBase58());
  assert.equal(pool.tokenBMint, keys[1].toBase58());
  assert.equal(pool.tokenAVault, keys[2].toBase58());
  assert.equal(pool.tokenBVault, keys[3].toBase58());
  assert.equal(pool.creator, keys[4].toBase58());
  assert.equal(pool.tokenAAmount, '123');
  assert.equal(pool.tokenBAmount, '456');
  assert.equal(pool.activationPoint, '789');
});