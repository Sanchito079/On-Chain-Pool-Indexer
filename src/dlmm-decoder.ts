import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { METEORA_DLMM_PROGRAM_ID } from './dlmm-constants.js';
import { MeteoraDlmmPoolRecord } from './dlmm-types.js';

const readPublicKey = (data: Buffer, offset: number) => new PublicKey(data.subarray(offset, offset + 32)).toBase58();

export function dlmmPairDiscriminator(): Buffer {
  return Buffer.from([33, 11, 49, 98, 181, 101, 177, 13]);
}

export function dlmmInstructionDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

export function decodeDlmmPool(address: string, data: Buffer, slot: number, metadata: Map<string, { symbol: string | null; decimals: number; logoUrl: string | null; totalSupplyRaw: string }>): MeteoraDlmmPoolRecord {
  if (data.length < 904 || !data.subarray(0, 8).equals(dlmmPairDiscriminator())) throw new Error('Invalid Meteora DLMM LbPair account');
  const tokenXMint = readPublicKey(data, 88);
  const tokenYMint = readPublicKey(data, 120);
    const tokenX = metadata.get(tokenXMint) ?? { symbol: null, decimals: 0, logoUrl: null, totalSupplyRaw: '0' };
    const tokenY = metadata.get(tokenYMint) ?? { symbol: null, decimals: 0, logoUrl: null, totalSupplyRaw: '0' };
  return {
    address, poolType: 'meteora_dlmm', programId: METEORA_DLMM_PROGRAM_ID.toBase58(), network: 'mainnet-beta',
    creator: readPublicKey(data, 848), tokenXMint, tokenXSymbol: tokenX.symbol, tokenXDecimals: tokenX.decimals, tokenXTotalSupplyRaw: tokenX.totalSupplyRaw, tokenXLogoUrl: tokenX.logoUrl,
    tokenYMint, tokenYSymbol: tokenY.symbol, tokenYDecimals: tokenY.decimals, tokenYTotalSupplyRaw: tokenY.totalSupplyRaw, tokenYLogoUrl: tokenY.logoUrl,
    reserveX: readPublicKey(data, 152), reserveY: readPublicKey(data, 184), oracle: readPublicKey(data, 552),
    activeId: data.readInt32LE(76), binStep: data.readUInt16LE(80), activationPoint: data.readBigUInt64LE(816).toString(),
    updatedSlot: slot, discoveredAt: new Date().toISOString(),
  };
}