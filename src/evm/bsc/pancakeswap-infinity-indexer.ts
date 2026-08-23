import { Contract, Interface, JsonRpcProvider, WebSocketProvider, id, type Log, type WebSocketLike } from 'ethers';
import { PoolDatabase } from '../../db.js';
import { ERC20_METADATA_ABI, PANCAKESWAP_INFINITY_CL_MANAGER, PANCAKESWAP_INFINITY_CL_MANAGER_ABI } from './pancakeswap-infinity-constants.js';
import { PancakeSwapInfinityClPoolRecord } from './pancakeswap-infinity-types.js';
import { calculateInfinityClPrice, decodeInfinitySwap, infinitySwapTopic, type PancakeSwapInfinityClPrice } from './pancakeswap-infinity-price.js';

const initializeTopic = id('Initialize(bytes32,address,address,address,uint24,bytes32,uint160,int24)');
const managerInterface = new Interface(PANCAKESWAP_INFINITY_CL_MANAGER_ABI);

export function decodeInfinityInitialize(log: Pick<Log, 'topics' | 'data'>): { poolId: string; currency0: string; currency1: string; hooks: string; fee: number; parameters: string; sqrtPriceX96: bigint; tick: number } | null {
  try {
    const parsed = managerInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed || parsed.name !== 'Initialize') return null;
    return { poolId: String(parsed.args[0]), currency0: String(parsed.args[1]), currency1: String(parsed.args[2]), hooks: String(parsed.args[3]), fee: Number(parsed.args[4]), parameters: String(parsed.args[5]), sqrtPriceX96: BigInt(parsed.args[6]), tick: Number(parsed.args[7]) };
  } catch { return null; }
}

export class PancakeSwapInfinityIndexer {
  private readonly provider: JsonRpcProvider;
  private readonly manager: string;
  private socket: WebSocketProvider | undefined;
  private readonly seen = new Set<string>();

  constructor(private readonly database: PoolDatabase, httpUrl: string, private readonly wsUrl: string, manager = PANCAKESWAP_INFINITY_CL_MANAGER, private readonly onPrice?: (price: PancakeSwapInfinityClPrice) => void) {
    if (!manager) throw new Error('PANCAKESWAP_INFINITY_CL_MANAGER is required for Infinity CL indexing');
    this.manager = manager;
    this.provider = new JsonRpcProvider(httpUrl, 56, { staticNetwork: true });
  }

  async start(): Promise<void> {
    this.socket = new WebSocketProvider(this.wsUrl);
    for (const pool of this.database.pancakeSwapInfinityPools()) { this.seen.add(pool.poolId.toLowerCase()); this.subscribePool(pool); }
    this.socket.on({ address: this.manager, topics: [initializeTopic] }, (log) => void this.handleLog(log).catch((error: unknown) => console.error('PancakeSwap Infinity pool failed:', error)));
    console.log(`BSC PancakeSwap Infinity CL WebSocket active for manager ${this.manager}.`);
    await new Promise<void>((resolve, reject) => {
      const websocket = (this.socket as unknown as { websocket?: WebSocketLike & { on?: (event: string, listener: (...args: never[]) => void) => void } }).websocket;
      websocket?.on?.('close', resolve);
      websocket?.on?.('error', reject);
    });
    await this.socket.destroy();
    this.socket = undefined;
  }

  private async handleLog(log: Log): Promise<void> {
    const parsed = decodeInfinityInitialize(log);
    if (!parsed || this.seen.has(parsed.poolId.toLowerCase())) return;
    this.seen.add(parsed.poolId.toLowerCase());
    const [currency0, currency1] = await Promise.all([this.metadata(parsed.currency0), this.metadata(parsed.currency1)]);
    const pool: PancakeSwapInfinityClPoolRecord = {
      address: parsed.poolId, poolType: 'pancakeswap_infinity_cl', chain: 'bsc', manager: this.manager, poolId: parsed.poolId,
      currency0: parsed.currency0, currency0Symbol: currency0.symbol, currency0Decimals: currency0.decimals,
      currency1: parsed.currency1, currency1Symbol: currency1.symbol, currency1Decimals: currency1.decimals,
      hooks: parsed.hooks, fee: parsed.fee, parameters: parsed.parameters, sqrtPriceX96: parsed.sqrtPriceX96.toString(), tick: parsed.tick,
      transactionHash: log.transactionHash, blockNumber: log.blockNumber, discoveredAt: new Date().toISOString(),
    };
    this.database.upsertPancakeSwapInfinityPool(pool);
    this.subscribePool(pool);
    console.log(`Indexed new PancakeSwap Infinity CL BSC pool ${parsed.poolId} (${pool.currency0Symbol ?? pool.currency0}/${pool.currency1Symbol ?? pool.currency1}).`);
  }

  private subscribePool(pool: PancakeSwapInfinityClPoolRecord): void {
    if (!this.socket) return;
    this.socket.on({ address: this.manager, topics: [infinitySwapTopic, pool.poolId] }, (log) => {
      const swap = decodeInfinitySwap(log);
      if (swap) this.onPrice?.(calculateInfinityClPrice(pool, swap.sqrtPriceX96, swap.liquidity, swap.tick, swap.fee, log.blockNumber));
    });
  }

  private async metadata(address: string): Promise<{ symbol: string | null; decimals: number }> {
    if (/^0x0{40}$/i.test(address)) return { symbol: 'BNB', decimals: 18 };
    const token = new Contract(address, ERC20_METADATA_ABI, this.provider);
    const [symbol, decimals] = await Promise.all([token.symbol().catch(() => null) as Promise<string | null>, token.decimals().catch(() => 18) as Promise<number>]);
    return { symbol, decimals: Number(decimals) };
  }
}