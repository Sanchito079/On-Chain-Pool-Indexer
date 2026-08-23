import { PublicKey } from '@solana/web3.js';
import { ORCA_WHIRLPOOL_ACCOUNT_SIZE, ORCA_WHIRLPOOL_DISCRIMINATOR, ORCA_WHIRLPOOL_PROGRAM_ID } from './orca-constants.js';
import { OrcaWhirlpoolRecord } from './orca-types.js';

const readPublicKey = (data: Buffer, offset: number): string => new PublicKey(data.subarray(offset, offset + 32)).toBase58();
const readU128 = (data: Buffer, offset: number): string => {
  let value = 0n;
  for (let index = 15; index >= 0; index -= 1) value = (value << 8n) | BigInt(data[offset + index]);
  return value.toString();
};

export function orcaWhirlpoolDiscriminator(): Buffer { return ORCA_WHIRLPOOL_DISCRIMINATOR; }

export function decodeOrcaWhirlpool(address: string, data: Buffer, slot: number, metadata: Map<string, { symbol: string | null; decimals: number; logoUrl: string | null; totalSupplyRaw: string }>): OrcaWhirlpoolRecord {
  if (data.length < ORCA_WHIRLPOOL_ACCOUNT_SIZE || !data.subarray(0, 8).equals(ORCA_WHIRLPOOL_DISCRIMINATOR)) throw new Error('Invalid Orca Whirlpool account');
  const tokenMintA = readPublicKey(data, 101);
  const tokenMintB = readPublicKey(data, 181);
  const mintA = metadata.get(tokenMintA) ?? { symbol: null, decimals: 0, logoUrl: null, totalSupplyRaw: '0' };
  const mintB = metadata.get(tokenMintB) ?? { symbol: null, decimals: 0, logoUrl: null, totalSupplyRaw: '0' };
  return {
    address, poolType: 'orca_whirlpool', programId: ORCA_WHIRLPOOL_PROGRAM_ID.toBase58(), network: 'mainnet-beta',
    whirlpoolsConfig: readPublicKey(data, 8),
    tokenMintA, tokenMintASymbol: mintA.symbol, tokenMintADecimals: mintA.decimals, tokenMintATotalSupplyRaw: mintA.totalSupplyRaw, tokenMintALogoUrl: mintA.logoUrl,
    tokenMintB, tokenMintBSymbol: mintB.symbol, tokenMintBDecimals: mintB.decimals, tokenMintBTotalSupplyRaw: mintB.totalSupplyRaw, tokenMintBLogoUrl: mintB.logoUrl,
    tokenVaultA: readPublicKey(data, 133), tokenVaultB: readPublicKey(data, 213), tickSpacing: data.readUInt16LE(41),
    feeRate: data.readUInt16LE(45), protocolFeeRate: data.readUInt16LE(47), liquidity: readU128(data, 49), sqrtPriceX64: readU128(data, 65),
    tickCurrentIndex: data.readInt32LE(81), updatedSlot: slot, discoveredAt: new Date().toISOString(),
  };
}