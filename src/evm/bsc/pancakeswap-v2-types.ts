export type PancakeSwapV2PoolRecord = {
  address: string;
  poolType: 'pancakeswap_v2';
  chain: 'bsc';
  factory: string;
  token0: string;
  token0Symbol: string | null;
  token0Decimals: number;
  token1: string;
  token1Symbol: string | null;
  token1Decimals: number;
  pairIndex: string;
  transactionHash: string;
  blockNumber: number;
  discoveredAt: string;
};