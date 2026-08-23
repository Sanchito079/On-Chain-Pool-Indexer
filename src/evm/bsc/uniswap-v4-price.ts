import { id, Interface, type Log } from 'ethers';
import { UniswapV4PoolRecord } from './uniswap-v4-types.js';

const swapInterface = new Interface(['event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)']);
export const uniswapV4SwapTopic = id('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');
const quoteCurrencies = new Set(['0x0000000000000000000000000000000000000000', '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', '0x55d398326f99059ff775485246999027b3197955', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', '0xe9e7cea3dedca5984780bafc599bd69add087d56', '0x4200000000000000000000000000000000000006', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913']);

export type UniswapV4Price = { poolAddress: string; poolId: string; currency0: string; currency1: string; baseCurrency: string; quoteCurrency: string; price: number | null; inversePrice: number | null; sqrtPriceX96: bigint; liquidity: bigint; tick: number; fee: number; updatedBlock: number; updatedAt: string };

export function decodeUniswapV4Swap(log: Pick<Log, 'topics' | 'data'>): { poolId: string; sqrtPriceX96: bigint; liquidity: bigint; tick: number; fee: number } | null {
  try { const parsed = swapInterface.parseLog({ topics: [...log.topics], data: log.data }); return parsed?.name === 'Swap' ? { poolId: String(parsed.args[0]), sqrtPriceX96: BigInt(parsed.args[4]), liquidity: BigInt(parsed.args[5]), tick: Number(parsed.args[6]), fee: Number(parsed.args[7]) } : null; } catch { return null; }
}

export function calculateUniswapV4Price(pool: UniswapV4PoolRecord, sqrtPriceX96: bigint, liquidity: bigint, tick: number, fee: number, blockNumber: number, updatedAt = new Date().toISOString()): UniswapV4Price {
  const sqrt = Number(sqrtPriceX96) / 2 ** 96;
  const currency1PerCurrency0 = sqrt > 0 ? sqrt * sqrt * 10 ** (pool.currency0Decimals - pool.currency1Decimals) : null;
  const currency0IsQuote = quoteCurrencies.has(pool.currency0.toLowerCase());
  const currency1IsQuote = quoteCurrencies.has(pool.currency1.toLowerCase());
  const quoteCurrency = currency0IsQuote ? pool.currency0 : pool.currency1;
  const baseCurrency = currency0IsQuote ? pool.currency1 : pool.currency0;
  const price = currency0IsQuote ? (currency1PerCurrency0 && currency1PerCurrency0 > 0 ? 1 / currency1PerCurrency0 : null) : currency1IsQuote ? currency1PerCurrency0 : null;
  return { poolAddress: pool.address, poolId: pool.poolId, currency0: pool.currency0, currency1: pool.currency1, baseCurrency, quoteCurrency, price, inversePrice: price && price > 0 ? 1 / price : null, sqrtPriceX96, liquidity, tick, fee, updatedBlock: blockNumber, updatedAt };
}