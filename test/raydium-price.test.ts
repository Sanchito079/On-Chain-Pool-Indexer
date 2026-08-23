import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair } from '@solana/web3.js';
import { RaydiumPriceProcessor } from '../src/raydium-price.js';

const wsol = 'So11111111111111111111111111111111111111112';
const token = Keypair.generate().publicKey.toBase58();

function record(tokenMint0: string, tokenMint1: string) {
  const keys = Array.from({ length: 5 }, () => Keypair.generate().publicKey.toBase58());
  return {
    address: keys[0], poolType: 'raydium_clmm' as const, programId: keys[1], network: 'mainnet-beta', ammConfig: keys[2], owner: keys[3],
    tokenMint0, tokenMint0Symbol: 'TOKEN', tokenMint0Decimals: 6, tokenMint0TotalSupplyRaw: '1000000000', tokenMint0LogoUrl: null,
    tokenMint1, tokenMint1Symbol: 'SOL', tokenMint1Decimals: 9, tokenMint1TotalSupplyRaw: '0', tokenMint1LogoUrl: null,
    tokenVault0: keys[1], tokenVault1: keys[2], observationKey: keys[3], tickSpacing: 1,
    sqrtPriceX64: '18446744073709551616', tickCurrent: 0, updatedSlot: 1, discoveredAt: new Date().toISOString(),
  };
}

test('fetches Raydium CLMM price from sqrtPriceX64', () => {
  const prices: number[] = [];
  const pool = record(token, wsol);
  const processor = new RaydiumPriceProcessor((price) => prices.push(price.price ?? 0));
  processor.addPool(pool);
  const data = Buffer.alloc(273);
  data.writeBigUInt64LE(9223372036854775808n, 253);
  data.writeBigUInt64LE(0n, 261);
  processor.updatePoolAccount(pool.address, data, 2);
  assert.equal(prices.length, 1);
  assert.equal(prices[0], 0.00025);
});

test('inverts Raydium CLMM price when WSOL is token mint 0', () => {
  const prices: number[] = [];
  const pool = record(wsol, token);
  const processor = new RaydiumPriceProcessor((price) => prices.push(price.price ?? 0));
  processor.addPool(pool);
  const data = Buffer.alloc(273);
  data.writeBigUInt64LE(9223372036854775808n, 253);
  data.writeBigUInt64LE(0n, 261);
  processor.updatePoolAccount(pool.address, data, 2);
  assert.equal(prices.length, 1);
  assert.equal(prices[0], 4000);
});