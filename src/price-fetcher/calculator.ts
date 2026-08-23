import { MarketOrientation, PoolPrice } from './types.js';

export function calculatePrice(
  orientation: MarketOrientation,
  baseReserve: bigint,
  quoteReserve: bigint,
  updatedSlot: number,
  poolAddress: string,
  previousPrice: number | null = null,
): PoolPrice {
  const base = Number(baseReserve) / 10 ** orientation.baseDecimals;
  const quote = Number(quoteReserve) / 10 ** orientation.quoteDecimals;
  const price = base > 0 && Number.isFinite(base) && Number.isFinite(quote) ? quote / base : null;
  const priceChange = price !== null && previousPrice !== null ? price - previousPrice : null;
  const priceChangePercent = priceChange !== null && previousPrice !== null && previousPrice !== 0 ? (priceChange / previousPrice) * 100 : null;
  return {
    ...orientation, poolAddress, baseReserve, quoteReserve, price,
    inversePrice: price && price > 0 ? 1 / price : null, updatedSlot,
    priceChange, priceChangePercent,
    priceChangeDirection: priceChange === null ? null : priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'unchanged',
    tokenPriceUsd: null, totalSupply: null, circulatingSupply: null, fdvUsd: null, marketCapUsd: null, supplyBasis: 'unavailable',
  };
}

export function calculateSqrtPrice(
  orientation: MarketOrientation,
  sqrtPriceX64: bigint,
  baseReserve: bigint,
  quoteReserve: bigint,
  updatedSlot: number,
  poolAddress: string,
  previousPrice: number | null = null,
): PoolPrice {
  const sqrt = Number(sqrtPriceX64) / 2 ** 64;
  const protocolPrice = sqrt * sqrt * 10 ** (
    orientation.protocolIsMarketOriented
      ? orientation.baseDecimals - orientation.quoteDecimals
      : orientation.quoteDecimals - orientation.baseDecimals
  );
  const price = orientation.protocolIsMarketOriented ? protocolPrice : protocolPrice > 0 ? 1 / protocolPrice : null;
  const priceChange = price !== null && previousPrice !== null ? price - previousPrice : null;
  const priceChangePercent = priceChange !== null && previousPrice !== null && previousPrice !== 0 ? (priceChange / previousPrice) * 100 : null;
  return {
    ...orientation, poolAddress, baseReserve, quoteReserve, price,
    inversePrice: price && price > 0 ? 1 / price : null, updatedSlot,
    priceChange, priceChangePercent,
    priceChangeDirection: priceChange === null ? null : priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'unchanged',
    tokenPriceUsd: null, totalSupply: null, circulatingSupply: null, fdvUsd: null, marketCapUsd: null, supplyBasis: 'unavailable',
  };
}

export function calculateDlmmPrice(
  orientation: MarketOrientation,
  activeId: number,
  binStep: number,
  updatedSlot: number,
  poolAddress: string,
  previousPrice: number | null = null,
): PoolPrice {
  const rawTokenYPerX = Math.pow(1 + binStep / 10_000, activeId);
  const tokenYPerX = rawTokenYPerX * 10 ** (orientation.protocolIsMarketOriented ? orientation.baseDecimals - orientation.quoteDecimals : orientation.quoteDecimals - orientation.baseDecimals);
  const price = orientation.protocolIsMarketOriented ? tokenYPerX : tokenYPerX > 0 ? 1 / tokenYPerX : null;
  const priceChange = price !== null && previousPrice !== null ? price - previousPrice : null;
  const priceChangePercent = priceChange !== null && previousPrice !== null && previousPrice !== 0 ? (priceChange / previousPrice) * 100 : null;
  return {
    ...orientation, poolAddress, baseReserve: 0n, quoteReserve: 0n, price,
    inversePrice: price && price > 0 ? 1 / price : null, updatedSlot,
    priceChange, priceChangePercent,
    priceChangeDirection: priceChange === null ? null : priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'unchanged',
    tokenPriceUsd: null, totalSupply: null, circulatingSupply: null, fdvUsd: null, marketCapUsd: null, supplyBasis: 'unavailable',
  };
}