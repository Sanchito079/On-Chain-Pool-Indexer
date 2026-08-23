import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair } from '@solana/web3.js';
import { OrcaPriceProcessor } from '../src/orca-price.js';

const wsol = 'So11111111111111111111111111111111111111112';
const token = Keypair.generate().publicKey.toBase58();

function record(tokenMintA: string, tokenMintB: string) {
  const keys = Array.from({ length: 6 }, () => Keypair.generate().publicKey.toBase58());
  return {
    address: keys[0], poolType: 'orca_whirlpool' as const, programId: keys[1], network: 'mainnet-beta', whirlpoolsConfig: keys[2],
    tokenMintA, tokenMintASymbol: 'TOKEN', tokenMintADecimals: 6, tokenMintATotalSupplyRaw: '1000000000', tokenMintALogoUrl: null,
    tokenMintB, tokenMintBSymbol: 'SOL', tokenMintBDecimals: 9, tokenMintBTotalSupplyRaw: '0', tokenMintBLogoUrl: null,
    tokenVaultA: keys[3], tokenVaultB: keys[4], tickSpacing: 64, feeRate: 300, protocolFeeRate: 40,
    liquidity: '0', sqrtPriceX64: '0', tickCurrentIndex: 0, updatedSlot: 1, discoveredAt: new Date().toISOString(),
  };
}

test('calculates Orca Whirlpool price from sqrt_price', () => {
  const prices: number[] = [];
  const pool = record(token, wsol);
  const processor = new OrcaPriceProcessor((price) => prices.push(price.price ?? 0));
  processor.addPool(pool);
  const data = Buffer.alloc(653);
  data.writeBigUInt64LE(9223372036854775808n, 65);
  data.writeBigUInt64LE(0n, 73);
  processor.updatePoolAccount(pool.address, data, 2);
  assert.equal(prices.length, 1);
  assert.equal(prices[0], 0.00025);
});

test('inverts Orca Whirlpool price when WSOL is token A', () => {
  const prices: number[] = [];
  const pool = record(wsol, token);
  const processor = new OrcaPriceProcessor((price) => prices.push(price.price ?? 0));
  processor.addPool(pool);
  const data = Buffer.alloc(653);
  data.writeBigUInt64LE(9223372036854775808n, 65);
  data.writeBigUInt64LE(0n, 73);
  processor.updatePoolAccount(pool.address, data, 2);
  assert.equal(prices.length, 1);
  assert.equal(prices[0], 4000);
});