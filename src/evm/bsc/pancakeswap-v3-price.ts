import { id, Interface, type Log } from 'ethers';
import { PancakeSwapV3PoolRecord } from './pancakeswap-v3-types.js';

export const PANCAKESWAP_V3_POOL_ABI = ['event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'];
const poolInterface = new Interface(PANCAKESWAP_V3_POOL_ABI);
export const swapTopic = id('Swap(address,address,int256,int256,uint160,uint128,int24)');

const quoteMints = new Set(['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', '0x55d398326f99059ff775485246999027b3197955', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', '0xe9e7cea3dedca5984780bafc599bd69add087d56']);

export type PancakeSwapV3Price = {
  poolAddress: string;
  token0: string;
  token1: string;
  baseToken: string;
  quoteToken: string;
  price: number | null;
  inversePrice: number | null;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  updatedBlock: number;
  updatedAt: string;
};

export function decodeSwapLog(log: Pick<Log, 'topics' | 'data'>): { sqrtPriceX96: bigint; liquidity: bigint; tick: number } | null {
  try {
    const parsed = poolInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed || parsed.name !== 'Swap') return null;
    return { sqrtPriceX96: BigInt(parsed.args[4]), liquidity: BigInt(parsed.args[5]), tick: Number(parsed.args[6]) };
  } catch { return null; }
}

export function calculatePancakeSwapV3Price(pool: PancakeSwapV3PoolRecord, sqrtPriceX96: bigint, liquidity: bigint, tick: number, blockNumber: number, updatedAt = new Date().toISOString()): PancakeSwapV3Price {
  const sqrt = Number(sqrtPriceX96) / 2 ** 96;
  const token1PerToken0 = sqrt > 0 ? sqrt * sqrt * 10 ** (pool.token0Decimals - pool.token1Decimals) : null;
  const token0IsQuote = quoteMints.has(pool.token0.toLowerCase());
  const token1IsQuote = quoteMints.has(pool.token1.toLowerCase());
  const quoteToken = token0IsQuote ? pool.token0 : pool.token1;
  const baseToken = token0IsQuote ? pool.token1 : pool.token0;
  const price = token0IsQuote ? (token1PerToken0 && token1PerToken0 > 0 ? 1 / token1PerToken0 : null) : token1IsQuote ? token1PerToken0 : null;
  return { poolAddress: pool.address, token0: pool.token0, token1: pool.token1, baseToken, quoteToken, price, inversePrice: price && price > 0 ? 1 / price : null, sqrtPriceX96, liquidity, tick, updatedBlock: blockNumber, updatedAt };
}