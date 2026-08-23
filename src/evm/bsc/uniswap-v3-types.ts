export type UniswapV3PoolRecord = {
  address: string;
  poolType: 'uniswap_v3';
  chain: 'bsc';
  factory: string;
  token0: string;
  token0Symbol: string | null;
  token0Decimals: number;
  token1: string;
  token1Symbol: string | null;
  token1Decimals: number;
  fee: number;
  tickSpacing: number;
  transactionHash: string;
  blockNumber: number;
  discoveredAt: string;
};