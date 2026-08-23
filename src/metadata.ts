import { PublicKey } from '@solana/web3.js';
import { decodeMetadata, decodeTokenMetadata, metadataAddress } from './decoder.js';

export type TokenMetadata = { symbol: string | null; logoUrl: string | null; totalSupplyRaw: string };

const ipfs = (value: string): string => value.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${value.slice(7)}` : value;

const validUrl = (value: unknown): value is string => typeof value === 'string' && /^https?:\/\//i.test(value);

async function fetchLogo(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  const response = await fetch(ipfs(uri), { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return null;
  const json = await response.json() as { image?: unknown };
  return validUrl(json.image) ? ipfs(json.image) : null;
}

export async function loadTokenMetadata(
  mint: PublicKey,
  mintAccount: Buffer | null,
  metadataAccount: Buffer | null,
): Promise<TokenMetadata> {
  const tokenData = mintAccount ? decodeTokenMetadata(mintAccount) : { symbol: null, uri: null };
  const metaplexData = metadataAccount ? decodeMetadata(metadataAccount) : { symbol: null, uri: null };
  const symbol = metaplexData.symbol ?? tokenData.symbol;
  const uri = metaplexData.uri ?? tokenData.uri;
  let logoUrl: string | null = null;
  try { logoUrl = await fetchLogo(uri); } catch { logoUrl = null; }
  const totalSupplyRaw = mintAccount && mintAccount.length >= 44 ? mintAccount.readBigUInt64LE(36).toString() : '0';
  return { symbol, logoUrl, totalSupplyRaw };
}

export function metadataAddresses(mints: PublicKey[]): PublicKey[] {
  return mints.map((mint) => metadataAddress(mint.toBase58()));
}