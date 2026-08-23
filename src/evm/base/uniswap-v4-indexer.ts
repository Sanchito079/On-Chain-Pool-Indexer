import { Contract, Interface, JsonRpcProvider, WebSocketProvider, id, type Log, type WebSocketLike } from 'ethers';
import { PoolDatabase } from '../../db.js';
import { UNISWAP_V4_POOL_MANAGER_ABI, UNISWAP_V4_STATE_VIEW_ABI, UNISWAP_V4_ERC20_ABI } from '../../evm/bsc/uniswap-v4-constants.js';
import { calculateUniswapV4Price, decodeUniswapV4Swap, uniswapV4SwapTopic, type UniswapV4Price } from '../../evm/bsc/uniswap-v4-price.js';
import { UNISWAP_V4_BASE_POOL_MANAGER, UNISWAP_V4_BASE_STATE_VIEW } from './uniswap-v4-constants.js';
import { UniswapV4PoolRecord } from '../../evm/bsc/uniswap-v4-types.js';

const initializeTopic = id('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
const managerInterface = new Interface(UNISWAP_V4_POOL_MANAGER_ABI);

export function decodeBaseUniswapV4Initialize(log: Pick<Log, 'topics' | 'data'>) {
  try {
    const parsed = managerInterface.parseLog({ topics: [...log.topics], data: log.data });
    return parsed?.name === 'Initialize' ? { poolId: String(parsed.args[0]), currency0: String(parsed.args[1]), currency1: String(parsed.args[2]), fee: Number(parsed.args[3]), tickSpacing: Number(parsed.args[4]), hooks: String(parsed.args[5]), sqrtPriceX96: BigInt(parsed.args[6]), tick: Number(parsed.args[7]) } : null;
  } catch { return null; }
}

export class BaseUniswapV4Indexer {
  private readonly provider: JsonRpcProvider;
  private readonly stateView: Contract;
  private socket: WebSocketProvider | undefined;
  private readonly poolsById = new Map<string, UniswapV4PoolRecord>();
  private readonly seen = new Set<string>();

  constructor(private readonly database: PoolDatabase, httpUrl: string, private readonly wsUrl: string, private readonly manager = UNISWAP_V4_BASE_POOL_MANAGER, private readonly stateViewAddress = UNISWAP_V4_BASE_STATE_VIEW, private readonly onPrice?: (price: UniswapV4Price) => void) {
    this.provider = new JsonRpcProvider(httpUrl, 8453, { staticNetwork: true });
    this.stateView = new Contract(stateViewAddress, UNISWAP_V4_STATE_VIEW_ABI, this.provider);
  }

  async start(): Promise<void> {
    for (const pool of this.database.baseUniswapV4Pools()) { this.seen.add(pool.poolId.toLowerCase()); this.poolsById.set(pool.poolId.toLowerCase(), pool); }
    while (true) { try { await this.connect(); } catch (error) { console.error('Base Uniswap V4 WebSocket disconnected:', error instanceof Error ? error.message : error); } await new Promise<void>((resolve) => setTimeout(resolve, 1_000)); }
  }

  private async connect(): Promise<void> {
    this.socket = new WebSocketProvider(this.wsUrl);
    const pools = this.database.baseUniswapV4Pools();
    for (const pool of pools) this.poolsById.set(pool.poolId.toLowerCase(), pool);
    this.socket.on({ address: this.manager, topics: [initializeTopic] }, (log) => void this.handleInitialize(log).catch((error: unknown) => console.error('Base Uniswap V4 pool failed:', error)));
    this.socket.on({ address: this.manager, topics: [uniswapV4SwapTopic] }, (log) => { const swap = decodeUniswapV4Swap(log); const pool = swap ? this.poolsById.get(swap.poolId.toLowerCase()) : undefined; if (swap && pool) this.onPrice?.(calculateUniswapV4Price(pool, swap.sqrtPriceX96, swap.liquidity, swap.tick, swap.fee, log.blockNumber)); });
    console.log(`Base Uniswap V4 WebSocket active for manager ${this.manager}.`);
    await Promise.all(pools.map((pool) => this.bootstrapPool(pool).catch((error: unknown) => console.error(`Base StateView failed for ${pool.poolId}:`, error instanceof Error ? error.message : error))));
    await new Promise<void>((resolve, reject) => { const websocket = (this.socket as unknown as { websocket?: WebSocketLike & { on?: (event: string, listener: (...args: never[]) => void) => void } }).websocket; websocket?.on?.('close', resolve); websocket?.on?.('error', reject); });
    await this.socket.destroy(); this.socket = undefined;
  }

  private async handleInitialize(log: Log): Promise<void> {
    const parsed = decodeBaseUniswapV4Initialize(log); if (!parsed || this.seen.has(parsed.poolId.toLowerCase())) return;
    this.seen.add(parsed.poolId.toLowerCase());
    const [currency0, currency1] = await Promise.all([this.metadata(parsed.currency0), this.metadata(parsed.currency1)]);
    const pool: UniswapV4PoolRecord = { address: parsed.poolId, poolType: 'uniswap_v4', chain: 'base', manager: this.manager, poolId: parsed.poolId, currency0: parsed.currency0, currency0Symbol: currency0.symbol, currency0Decimals: currency0.decimals, currency1: parsed.currency1, currency1Symbol: currency1.symbol, currency1Decimals: currency1.decimals, fee: parsed.fee, tickSpacing: parsed.tickSpacing, hooks: parsed.hooks, sqrtPriceX96: parsed.sqrtPriceX96.toString(), tick: parsed.tick, transactionHash: log.transactionHash, blockNumber: log.blockNumber, discoveredAt: new Date().toISOString() };
    this.database.upsertBaseUniswapV4Pool(pool); this.poolsById.set(pool.poolId.toLowerCase(), pool);
  }

  private async bootstrapPool(pool: UniswapV4PoolRecord): Promise<void> {
    const state = await this.stateView.getSlot0(pool.poolId) as [bigint, number, number, number];
    const [sqrtPriceX96, tick, , lpFee] = state; if (sqrtPriceX96 === 0n) return;
    const liquidity = await this.stateView.getLiquidity(pool.poolId).catch(() => 0n) as bigint;
    this.onPrice?.(calculateUniswapV4Price(pool, sqrtPriceX96, liquidity, Number(tick), Number(lpFee), await this.provider.getBlockNumber()));
  }

  private async metadata(address: string): Promise<{ symbol: string | null; decimals: number }> {
    if (/^0x0{40}$/i.test(address)) return { symbol: 'ETH', decimals: 18 };
    const token = new Contract(address, UNISWAP_V4_ERC20_ABI, this.provider);
    const [symbol, decimals] = await Promise.all([token.symbol().catch(() => null) as Promise<string | null>, token.decimals().catch(() => 18) as Promise<number>]);
    return { symbol, decimals: Number(decimals) };
  }
}