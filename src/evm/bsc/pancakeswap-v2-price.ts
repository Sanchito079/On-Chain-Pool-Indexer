import { id, Interface, type Log } from 'ethers';
import { PancakeSwapV2PoolRecord } from './pancakeswap-v2-types.js';

export const PANCAKESWAP_V2_PAIR_ABI = ['event Sync(uint112 reserve0, uint112 reserve1)'];
const pairInterface = new Interface(PANCAKESWAP_V2_PAIR_ABI);
export const syncTopic = id('Sync(uint112,uint112)');

export type PancakeSwapV2Price = {
  poolAddress: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  token0PerToken1: number | null;
  token1PerToken0: number | null;
  baseToken: string;
  quoteToken: string;
  price: number | null;
  inversePrice: number | null;
  updatedBlock: number;
  updatedAt: string;
};

export function calculatePancakeSwapV2Price(pool: PancakeSwapV2PoolRecord, reserve0: bigint, reserve1: bigint, blockNumber: number, updatedAt = new Date().toISOString()): PancakeSwapV2Price {
  const amount0 = Number(reserve0) / 10 ** pool.token0Decimals;
  const amount1 = Number(reserve1) / 10 ** pool.token1Decimals;
  const token0PerToken1 = amount0 > 0 && amount1 > 0 ? amount1 / amount0 : null;
  const token1PerToken0 = token0PerToken1 && token0PerToken1 > 0 ? 1 / token0PerToken1 : null;
  const token0IsQuote = ['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', '0x55d398326f99059ff775485246999027b3197955', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', '0xe9e7cea3dedca5984780bafc599bd69add087d56'].includes(pool.token0.toLowerCase());
  const token1IsQuote = ['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', '0x55d398326f99059ff775485246999027b3197955', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', '0xe9e7cea3dedca5984780bafc599bd69add087d56'].includes(pool.token1.toLowerCase());
  const quoteToken = token0IsQuote ? pool.token0 : pool.token1;
  const baseToken = token0IsQuote ? pool.token1 : pool.token0;
  const price = token0IsQuote ? token1PerToken0 : token0PerToken1;
  return { poolAddress: pool.address, token0: pool.token0, token1: pool.token1, reserve0, reserve1, token0PerToken1, token1PerToken0, baseToken, quoteToken, price, inversePrice: price && price > 0 ? 1 / price : null, updatedBlock: blockNumber, updatedAt };
}

export function decodeSyncLog(log: Pick<Log, 'topics' | 'data'>): { reserve0: bigint; reserve1: bigint } | null {
  try {
    const parsed = pairInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed || parsed.name !== 'Sync') return null;
    return { reserve0: BigInt(parsed.args[0]), reserve1: BigInt(parsed.args[1]) };
  } catch { return null; }
}