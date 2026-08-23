export type PoolType = 'pumpswap_amm' | 'raydium_clmm' | 'meteora_damm_v2' | 'meteora_dlmm' | 'orca_whirlpool' | 'pancakeswap_v2' | 'pancakeswap_v3';

export type PoolRecord = {
  address: string;
  poolType: PoolType;
  programId: string;
  network: string;
  baseMint: string;
  baseSymbol: string | null;
  baseLogoUrl: string | null;
  baseDecimals: number;
  quoteMint: string;
  quoteSymbol: string | null;
  quoteLogoUrl: string | null;
  quoteDecimals: number;
  lpMint: string;
  poolBaseTokenAccount: string;
  poolQuoteTokenAccount: string;
  creator: string;
  coinCreator: string;
  poolIndex: number;
  updatedSlot: number;
  discoveredAt: string;
};