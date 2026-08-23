import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { METEORA_DAMM_V2_PROGRAM_ID } from './meteora-constants.js';
import { MeteoraDammV2PoolRecord } from './meteora-types.js';

const readPublicKey = (data: Buffer, offset: number) => new PublicKey(data.subarray(offset, offset + 32)).toBase58();
const readU128 = (data: Buffer, offset: number): string => {
  let value = 0n;
  for (let index = 15; index >= 0; index -= 1) value = (value << 8n) | BigInt(data[offset + index]);
  return value.toString();
};

export function meteoraPoolDiscriminator(): Buffer {
  return createHash('sha256').update('account:Pool').digest().subarray(0, 8);
}

export function decodeMeteoraPool(address: string, data: Buffer, slot: number, metadata: Map<string, { symbol: string | null; decimals: number; logoUrl: string | null; totalSupplyRaw: string }>): MeteoraDammV2PoolRecord {
  if (data.length < 1112 || !data.subarray(0, 8).equals(meteoraPoolDiscriminator())) throw new Error('Invalid Meteora DAMM v2 Pool account');
  const tokenAMint = readPublicKey(data, 168);
  const tokenBMint = readPublicKey(data, 200);
    const tokenA = metadata.get(tokenAMint) ?? { symbol: null, decimals: 0, logoUrl: null, totalSupplyRaw: '0' };
    const tokenB = metadata.get(tokenBMint) ?? { symbol: null, decimals: 0, logoUrl: null, totalSupplyRaw: '0' };
  return {
    address, poolType: 'meteora_damm_v2', programId: METEORA_DAMM_V2_PROGRAM_ID.toBase58(), network: 'mainnet-beta',
    creator: readPublicKey(data, 648),
    tokenAMint, tokenASymbol: tokenA.symbol, tokenADecimals: tokenA.decimals, tokenATotalSupplyRaw: tokenA.totalSupplyRaw, tokenALogoUrl: tokenA.logoUrl,
    tokenBMint, tokenBSymbol: tokenB.symbol, tokenBDecimals: tokenB.decimals, tokenBTotalSupplyRaw: tokenB.totalSupplyRaw, tokenBLogoUrl: tokenB.logoUrl,
    tokenAVault: readPublicKey(data, 232), tokenBVault: readPublicKey(data, 264),
    tokenAAmount: data.readBigUInt64LE(680).toString(), tokenBAmount: data.readBigUInt64LE(688).toString(),
    sqrtPrice: readU128(data, 456), activationPoint: data.readBigUInt64LE(472).toString(), poolMode: data[484],
    updatedSlot: slot, discoveredAt: new Date().toISOString(),
  };
}