import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { METADATA_PROGRAM_ID, NETWORK, PUMPSWAP_PROGRAM_ID } from './constants.js';
import { PoolRecord } from './types.js';

const readPublicKey = (data: Buffer, offset: number) => new PublicKey(data.subarray(offset, offset + 32)).toBase58();

export function poolDiscriminator(): Buffer {
  return createHash('sha256').update('account:Pool').digest().subarray(0, 8);
}

export function decodeMintDecimals(data: Buffer): number {
  if (data.length < 45) throw new Error('Invalid SPL mint account: missing decimals');
  return data[44];
}

export function metadataAddress(mint: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), new PublicKey(mint).toBuffer()],
    METADATA_PROGRAM_ID,
  )[0];
}

export function decodeMetadataSymbol(data: Buffer): string | null {
  return decodeMetadata(data).symbol;
}

export function decodeMetadata(data: Buffer): { symbol: string | null; uri: string | null } {
  let offset = 65;
  const readString = () => {
    if (offset + 4 > data.length) return null;
    const length = data.readUInt32LE(offset);
    offset += 4;
    if (length > 256 || offset + length > data.length) return null;
    const value = data.subarray(offset, offset + length).toString('utf8').replace(/\0/g, '').trim();
    offset += length;
    return value || null;
  };
  readString();
  const symbol = readString();
  const uri = readString();
  return { symbol, uri };
}

export function decodePool(
  address: string,
  data: Buffer,
  slot: number,
  decimals: Map<string, number>,
  symbols: Map<string, string | null>,
  logos: Map<string, string | null>,
): PoolRecord {
  if (data.length < 261 || !data.subarray(0, 8).equals(poolDiscriminator())) throw new Error('Invalid PumpSwap Pool account');
  const poolIndex = data.readUInt16LE(9);
  const creator = readPublicKey(data, 11);
  const baseMint = readPublicKey(data, 43);
  const quoteMint = readPublicKey(data, 75);
  const lpMint = readPublicKey(data, 107);
  const poolBaseTokenAccount = readPublicKey(data, 139);
  const poolQuoteTokenAccount = readPublicKey(data, 171);
  const coinCreator = readPublicKey(data, 211);
  return {
    address, poolType: 'pumpswap_amm', programId: PUMPSWAP_PROGRAM_ID.toBase58(), network: NETWORK,
    baseMint, baseSymbol: symbols.get(baseMint) ?? null, baseLogoUrl: logos.get(baseMint) ?? null, baseDecimals: decimals.get(baseMint) ?? 0,
    quoteMint, quoteSymbol: symbols.get(quoteMint) ?? null, quoteLogoUrl: logos.get(quoteMint) ?? null, quoteDecimals: decimals.get(quoteMint) ?? 0,
    lpMint, poolBaseTokenAccount, poolQuoteTokenAccount, creator, coinCreator,
    poolIndex, updatedSlot: slot, discoveredAt: new Date().toISOString(),
  };
}

export function decodeTokenMetadataSymbol(data: Buffer): string | null {
  return decodeTokenMetadata(data).symbol;
}

export function decodeTokenMetadata(data: Buffer): { symbol: string | null; uri: string | null } {
  let offset = 82;
  while (offset + 4 <= data.length) {
    const type = data.readUInt16LE(offset);
    const length = data.readUInt16LE(offset + 2);
    offset += 4;
    if (type === 0 || length === 0) continue;
    if (offset + length > data.length) break;
    if (type === 19 && length >= 68) {
      let fieldOffset = offset + 64;
      const readString = () => {
        if (fieldOffset + 4 > offset + length) return null;
        const fieldLength = data.readUInt32LE(fieldOffset);
        fieldOffset += 4;
        if (fieldLength > 256 || fieldOffset + fieldLength > offset + length) return null;
        const value = data.subarray(fieldOffset, fieldOffset + fieldLength).toString('utf8').replace(/\0/g, '').trim();
        fieldOffset += fieldLength;
        return value || null;
      };
      readString();
      const symbol = readString();
      return { symbol, uri: readString() };
    }
    offset += length;
  }
  return { symbol: null, uri: null };
}