import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Keypair, PublicKey } from '@solana/web3.js';
import { decodeMintDecimals, decodePool, decodeTokenMetadataSymbol, poolDiscriminator } from '../src/decoder.js';
import { PoolDatabase } from '../src/db.js';

test('decodes and persists PumpSwap base/quote ordering and decimals', () => {
  const keys = Array.from({ length: 7 }, () => Keypair.generate().publicKey);
  const data = Buffer.alloc(261);
  poolDiscriminator().copy(data, 0);
  data.writeUInt16LE(7, 9);
  for (const [index, key] of keys.slice(0, 6).entries()) key.toBuffer().copy(data, 11 + index * 32);
  keys[6].toBuffer().copy(data, 211);
  const baseMint = keys[1].toBase58();
  const quoteMint = keys[2].toBase58();
  const pool = decodePool('11111111111111111111111111111111', data, 123, new Map([[baseMint, 9], [quoteMint, 6]]), new Map([[baseMint, 'BASE'], [quoteMint, 'USDC']]), new Map([[baseMint, 'https://example.com/base.png'], [quoteMint, null]]));
  assert.equal(pool.baseMint, baseMint);
  assert.equal(pool.quoteMint, quoteMint);
  assert.equal(pool.baseDecimals, 9);
  assert.equal(pool.quoteDecimals, 6);
  assert.equal(pool.baseSymbol, 'BASE');
  assert.equal(pool.quoteSymbol, 'USDC');
  assert.equal(pool.baseLogoUrl, 'https://example.com/base.png');
  assert.equal(pool.coinCreator, keys[6].toBase58());
  const directory = mkdtempSync(path.join(tmpdir(), 'pumpswap-'));
  const database = new PoolDatabase(path.join(directory, 'pools.db'));
  database.upsert(pool);
  assert.equal(database.count(), 1);
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

test('reads SPL mint decimals from the canonical byte offset', () => {
  const data = Buffer.alloc(82);
  data[44] = 9;
  assert.equal(decodeMintDecimals(data), 9);
});

test('rejects accounts that are not PumpSwap pools', () => {
  assert.throws(() => decodePool(PublicKey.default.toBase58(), Buffer.alloc(261), 1, new Map(), new Map(), new Map()), /Invalid PumpSwap Pool account/);
});

test('reads symbols from Token-2022 metadata extensions', () => {
  const data = Buffer.alloc(82 + 4 + 64 + 4 + 4 + 4 + 7);
  data.writeUInt16LE(19, 82);
  data.writeUInt16LE(data.length - 86, 84);
  const extension = 86;
  data.writeUInt32LE(4, extension + 64);
  data.write('Name', extension + 68);
  data.writeUInt32LE(4, extension + 72);
  data.write('TEST', extension + 76);
  assert.equal(decodeTokenMetadataSymbol(data), 'TEST');
});