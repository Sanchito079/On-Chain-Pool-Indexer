export type SupplySnapshot = {
  totalSupplyRaw: bigint;
  decimals: number;
  circulatingSupplyRaw?: bigint;
};

export type MarketCapResult = {
  tokenPriceUsd: number | null;
  totalSupply: number | null;
  circulatingSupply: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  supplyBasis: 'total_supply' | 'circulating_supply' | 'unavailable';
};

export function calculateMarketCap(
  tokenPriceInQuote: number | null,
  quotePriceUsd: number | null,
  supply: SupplySnapshot | null,
): MarketCapResult {
  const tokenPriceUsd = tokenPriceInQuote !== null && quotePriceUsd !== null
    ? tokenPriceInQuote * quotePriceUsd
    : null;
  if (!supply) return { tokenPriceUsd, totalSupply: null, circulatingSupply: null, fdvUsd: null, marketCapUsd: null, supplyBasis: 'unavailable' };
  const scale = 10 ** supply.decimals;
  const totalSupply = Number(supply.totalSupplyRaw) / scale;
  const circulatingSupply = supply.circulatingSupplyRaw === undefined ? null : Number(supply.circulatingSupplyRaw) / scale;
  const fdvUsd = tokenPriceUsd !== null && totalSupply > 0 && Number.isFinite(totalSupply) ? tokenPriceUsd * totalSupply : null;
  const marketCapUsd = tokenPriceUsd !== null && circulatingSupply !== null && Number.isFinite(circulatingSupply)
    ? tokenPriceUsd * circulatingSupply
    : null;
  return { tokenPriceUsd, totalSupply, circulatingSupply, fdvUsd, marketCapUsd, supplyBasis: circulatingSupply !== null ? 'circulating_supply' : 'total_supply' };
}

export function quotePriceUsd(quoteMint: string, solPriceUsd: number | null, usdcPriceUsd = 1): number | null {
  if (quoteMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') return usdcPriceUsd;
  if (quoteMint === 'So11111111111111111111111111111111111111112') return solPriceUsd;
  return null;
}

export function applyFdv(price: import('./price-fetcher/types.js').PoolPrice, totalSupplyRaw: bigint, tokenDecimals: number, solPriceUsd: number | null, usdcPriceUsd = 1): import('./price-fetcher/types.js').PoolPrice {
  const valuation = calculateMarketCap(price.price, quotePriceUsd(price.quoteMint, solPriceUsd, usdcPriceUsd), { totalSupplyRaw, decimals: tokenDecimals });
  return { ...price, ...valuation };
}