import { MarketOrientation, PoolForPricing } from './types.js';

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export function orientPool(pool: PoolForPricing): MarketOrientation | null {
  if (pool.quoteMint === WSOL_MINT || pool.quoteMint === USDC_MINT) {
    return {
      baseMint: pool.baseMint, baseSymbol: pool.baseSymbol, baseDecimals: pool.baseDecimals,
      baseVault: pool.poolBaseTokenAccount, quoteMint: pool.quoteMint, quoteSymbol: pool.quoteSymbol,
      quoteDecimals: pool.quoteDecimals, quoteVault: pool.poolQuoteTokenAccount,
      quoteAsset: pool.quoteMint === WSOL_MINT ? 'WSOL' : 'USDC', protocolIsMarketOriented: true,
    };
  }
  if (pool.baseMint === WSOL_MINT || pool.baseMint === USDC_MINT) {
    return {
      baseMint: pool.quoteMint, baseSymbol: pool.quoteSymbol, baseDecimals: pool.quoteDecimals,
      baseVault: pool.poolQuoteTokenAccount, quoteMint: pool.baseMint, quoteSymbol: pool.baseSymbol,
      quoteDecimals: pool.baseDecimals, quoteVault: pool.poolBaseTokenAccount,
      quoteAsset: pool.baseMint === WSOL_MINT ? 'WSOL' : 'USDC', protocolIsMarketOriented: false,
    };
  }
  return null;
}