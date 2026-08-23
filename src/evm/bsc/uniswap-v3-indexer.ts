import { Contract, Interface, JsonRpcProvider, WebSocketProvider, id, type Log, type WebSocketLike } from 'ethers';
import { PoolDatabase } from '../../db.js';
import { ERC20_METADATA_ABI, UNISWAP_V3_BSC_FACTORY, UNISWAP_V3_FACTORY_ABI } from './uniswap-v3-constants.js';
import { UniswapV3PoolRecord } from './uniswap-v3-types.js';
import { calculateUniswapV3Price, decodeUniswapV3Swap, uniswapV3SwapTopic, type UniswapV3Price } from './uniswap-v3-price.js';

const poolCreatedTopic = id('PoolCreated(address,address,uint24,int24,address)');
const factoryInterface = new Interface(UNISWAP_V3_FACTORY_ABI);

export function decodeUniswapV3PoolCreated(log: Pick<Log, 'topics' | 'data'>): { token0: string; token1: string; fee: number; tickSpacing: number; pool: string } | null {
  try { const parsed = factoryInterface.parseLog({ topics: [...log.topics], data: log.data }); return parsed?.name === 'PoolCreated' ? { token0: String(parsed.args[0]), token1: String(parsed.args[1]), fee: Number(parsed.args[2]), tickSpacing: Number(parsed.args[3]), pool: String(parsed.args[4]) } : null; } catch { return null; }
}

export class UniswapV3Indexer {
  private socket: WebSocketProvider | undefined;
  private readonly provider: JsonRpcProvider;
  private readonly seen = new Set<string>();

  constructor(private readonly database: PoolDatabase, httpUrl: string, private readonly wsUrl: string, private readonly factory = UNISWAP_V3_BSC_FACTORY, private readonly onPrice?: (price: UniswapV3Price) => void) { this.provider = new JsonRpcProvider(httpUrl, 56, { staticNetwork: true }); }

  async start(): Promise<void> {
    for (const pool of this.database.uniswapV3Pools()) this.seen.add(pool.address.toLowerCase());
    while (true) { try { await this.connect(); } catch (error) { console.error('Uniswap V3 WebSocket disconnected:', error instanceof Error ? error.message : error); } await new Promise<void>((resolve) => setTimeout(resolve, 1_000)); }
  }

  private async connect(): Promise<void> {
    this.socket = new WebSocketProvider(this.wsUrl);
    for (const pool of this.database.uniswapV3Pools()) this.subscribePool(pool);
    this.socket.on({ address: this.factory, topics: [poolCreatedTopic] }, (log) => void this.handleLog(log).catch((error: unknown) => console.error('Uniswap V3 pool failed:', error)));
    console.log(`BSC Uniswap V3 WebSocket active for factory ${this.factory}.`);
    await new Promise<void>((resolve, reject) => { const websocket = (this.socket as unknown as { websocket?: WebSocketLike & { on?: (event: string, listener: (...args: never[]) => void) => void } }).websocket; websocket?.on?.('close', resolve); websocket?.on?.('error', reject); });
    await this.socket.destroy(); this.socket = undefined;
  }

  private async handleLog(log: Log): Promise<void> {
    const parsed = decodeUniswapV3PoolCreated(log); if (!parsed) return;
    const address = parsed.pool.toLowerCase(); if (this.seen.has(address)) return; this.seen.add(address);
    const [token0, token1] = await Promise.all([this.metadata(parsed.token0), this.metadata(parsed.token1)]);
    const pool: UniswapV3PoolRecord = { address, poolType: 'uniswap_v3', chain: 'bsc', factory: this.factory, token0: parsed.token0, token0Symbol: token0.symbol, token0Decimals: token0.decimals, token1: parsed.token1, token1Symbol: token1.symbol, token1Decimals: token1.decimals, fee: parsed.fee, tickSpacing: parsed.tickSpacing, transactionHash: log.transactionHash, blockNumber: log.blockNumber, discoveredAt: new Date().toISOString() };
    this.database.upsertUniswapV3Pool(pool); this.subscribePool(pool);
    console.log(`Indexed new Uniswap V3 BSC pool ${address} (${pool.token0Symbol ?? pool.token0}/${pool.token1Symbol ?? pool.token1}, fee ${pool.fee}).`);
  }

  private subscribePool(pool: UniswapV3PoolRecord): void { if (!this.socket) return; this.socket.on({ address: pool.address, topics: [uniswapV3SwapTopic] }, (log) => { const swap = decodeUniswapV3Swap(log); if (swap) this.onPrice?.(calculateUniswapV3Price(pool, swap.sqrtPriceX96, swap.liquidity, swap.tick, log.blockNumber)); }); }
  private async metadata(address: string): Promise<{ symbol: string | null; decimals: number }> { const token = new Contract(address, ERC20_METADATA_ABI, this.provider); const [symbol, decimals] = await Promise.all([token.symbol().catch(() => null) as Promise<string | null>, token.decimals().catch(() => 18) as Promise<number>]); return { symbol, decimals: Number(decimals) }; }
}