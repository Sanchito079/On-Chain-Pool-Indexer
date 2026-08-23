import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair } from '@solana/web3.js';
import { decodeOrcaWhirlpool, orcaWhirlpoolDiscriminator } from '../src/orca-decoder.js';

test('decodes Orca Whirlpool pool metadata and state', () => {
  const keys = Array.from({ length: 7 }, () => Keypair.generate().publicKey);
  const data = Buffer.alloc(653);
  orcaWhirlpoolDiscriminator().copy(data, 0);
  keys[0].toBuffer().copy(data, 8);
  keys[1].toBuffer().copy(data, 101);
  keys[2].toBuffer().copy(data, 133);
  keys[3].toBuffer().copy(data, 181);
  keys[4].toBuffer().copy(data, 213);
  data.writeUInt16LE(64, 41);
  data.writeUInt16LE(300, 45);
  data.writeUInt16LE(40, 47);
  data.writeBigUInt64LE(123n, 49);
  data.writeBigUInt64LE(456n, 65);
  data.writeInt32LE(-12, 81);
  const pool = decodeOrcaWhirlpool(keys[5].toBase58(), data, 99, new Map([
    [keys[1].toBase58(), { symbol: 'A', decimals: 6, logoUrl: null, totalSupplyRaw: '1000' }],
    [keys[3].toBase58(), { symbol: 'B', decimals: 9, logoUrl: null, totalSupplyRaw: '2000' }],
  ]));
  assert.equal(pool.poolType, 'orca_whirlpool');
  assert.equal(pool.whirlpoolsConfig, keys[0].toBase58());
  assert.equal(pool.tokenMintA, keys[1].toBase58());
  assert.equal(pool.tokenVaultA, keys[2].toBase58());
  assert.equal(pool.tokenMintB, keys[3].toBase58());
  assert.equal(pool.tokenVaultB, keys[4].toBase58());
  assert.equal(pool.tickSpacing, 64);
  assert.equal(pool.feeRate, 300);
  assert.equal(pool.protocolFeeRate, 40);
  assert.equal(pool.liquidity, '123');
  assert.equal(pool.sqrtPriceX64, '456');
  assert.equal(pool.tickCurrentIndex, -12);
});