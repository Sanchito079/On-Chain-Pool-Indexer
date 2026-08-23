import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { RAYDIUM_CLMM_PROGRAM_ID } from './raydium-constants.js';
import { RaydiumClmmPoolRecord } from './raydium-types.js';

const readPublicKey = (data: Buffer, offset: number) => new PublicKey(data.subarray(offset, offset + 32)).toBase58();
const readU128 = (data: Buffer, offset: number) => {
  let value = 0n;
  for (let index = 15; index >= 0; index -= 1) value = (value << 8n) | BigInt(data[offset + index]);
  return value.toString();
};

export function raydiumPoolDiscriminator(): Buffer {
  return createHash('sha256').update('account:PoolState').digest().subarray(0, 8);
}

export function decodeRaydiumPool(
  address: string,
  data: Buffer,
  slot: number,
  metadata: Map<string, { symbol: string | null; decimals: number; logoUrl: string | null; totalSupplyRaw: string }>,
): RaydiumClmmPoolRecord {
  if (data.length < 273 || !data.subarray(0, 8).equals(raydiumPoolDiscriminator())) throw new Error('Invalid Raydium CLMM PoolState account');
  const tokenMint0 = readPublicKey(data, 73);
  const tokenMint1 = readPublicKey(data, 105);
  const mint0 = metadata.get(tokenMint0) ?? { symbol: null, decimals: data[233], logoUrl: null, totalSupplyRaw: '0' };
  const mint1 = metadata.get(tokenMint1) ?? { symbol: null, decimals: data[234], logoUrl: null, totalSupplyRaw: '0' };
  return {
    address, poolType: 'raydium_clmm', programId: RAYDIUM_CLMM_PROGRAM_ID.toBase58(), network: 'mainnet-beta',
    ammConfig: readPublicKey(data, 9), owner: readPublicKey(data, 41),
    tokenMint0, tokenMint0Symbol: mint0.symbol, tokenMint0Decimals: mint0.decimals, tokenMint0TotalSupplyRaw: mint0.totalSupplyRaw, tokenMint0LogoUrl: mint0.logoUrl,
    tokenMint1, tokenMint1Symbol: mint1.symbol, tokenMint1Decimals: mint1.decimals, tokenMint1TotalSupplyRaw: mint1.totalSupplyRaw, tokenMint1LogoUrl: mint1.logoUrl,
    tokenVault0: readPublicKey(data, 137), tokenVault1: readPublicKey(data, 169), observationKey: readPublicKey(data, 201),
    tickSpacing: data.readUInt16LE(235), sqrtPriceX64: readU128(data, 253), tickCurrent: data.readInt32LE(269),
    updatedSlot: slot, discoveredAt: new Date().toISOString(),
  };
}