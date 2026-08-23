import { PoolType } from '../types.js';

export type MarketQuote = 'WSOL' | 'USDC';

export type PoolForPricing = {
  address: string;
  poolType: PoolType;
  baseMint: string;
  baseSymbol: string | null;
  baseDecimals: number;
  poolBaseTokenAccount: string;
  quoteMint: string;
  quoteSymbol: string | null;
  quoteDecimals: number;
  poolQuoteTokenAccount: string;
};

export type MarketOrientation = {
  baseMint: string;
  baseSymbol: string | null;
  baseDecimals: number;
  baseVault: string;
  quoteMint: string;
  quoteSymbol: string | null;
  quoteDecimals: number;
  quoteVault: string;
  quoteAsset: MarketQuote;
  protocolIsMarketOriented: boolean;
};

export type PoolPrice = MarketOrientation & {
  poolAddress: string;
  baseReserve: bigint;
  quoteReserve: bigint;
  price: number | null;
  inversePrice: number | null;
  priceChange: number | null;
  priceChangePercent: number | null;
  priceChangeDirection: 'up' | 'down' | 'unchanged' | null;
  tokenPriceUsd: number | null;
  totalSupply: number | null;
  circulatingSupply: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  supplyBasis: 'total_supply' | 'circulating_supply' | 'unavailable';
  updatedSlot: number;
};