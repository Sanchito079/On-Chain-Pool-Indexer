import { PublicKey } from '@solana/web3.js';

export function asPublicKey(value: unknown): PublicKey | null {
  if (value instanceof PublicKey) return value;
  if (typeof value === 'string') {
    try { return new PublicKey(value); } catch { return null; }
  }
  if (value && typeof value === 'object' && 'pubkey' in value) return asPublicKey((value as { pubkey: unknown }).pubkey);
  return null;
}