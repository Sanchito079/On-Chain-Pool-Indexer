import { Contract, Interface, JsonRpcProvider, WebSocketProvider, id, type Log, type WebSocketLike } from 'ethers';
import { PoolDatabase } from '../../db.js';
import { ERC20_METADATA_ABI } from './pancakeswap-v2-constants.js';
import { PANCAKESWAP_V3_FACTORY, PANCAKESWAP_V3_FACTORY_ABI } from './pancakeswap-v3-constants.js';
import { PancakeSwapV3PoolRecord } from './pancakeswap-v3-types.js';

const poolCreatedTopic = id('PoolCreated(address,address,uint24,int24,address)');
const factoryInterface = new Interface(PANCAKESWAP_V3_FACTORY_ABI);

export function decodePancakeSwapV3PoolCreated(log: Pick<Log, 'topics' | 'data'>): { token0: string; token1: string; fee: number; tickSpacing: number; pool: string } | null {
  try {
    const parsed = factoryInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed || parsed.name !== 'PoolCreated') return null;
    return { token0: String(parsed.args[0]), token1: String(parsed.args[1]), fee: Number(parsed.args[2]), tickSpacing: Number(parsed.args[3]), pool: String(parsed.args[4]) };
  } catch { return null; }
}

export class PancakeSwapV3Indexer {
  private socket: WebSocketProvider | undefined;
  private readonly provider: JsonRpcProvider;
  private readonly seen = new Set<string>();

  constructor(private readonly database: PoolDatabase, httpUrl: string, private readonly wsUrl: string, private readonly factory = PANCAKESWAP_V3_FACTORY) {
    this.provider = new JsonRpcProvider(httpUrl, 56, { staticNetwork: true });
  }

  async start(): Promise<void> {
    this.socket = new WebSocketProvider(this.wsUrl);
    for (const pool of this.database.pancakeSwapV3Pools()) this.seen.add(pool.address.toLowerCase());
    this.socket.on({ address: this.factory, topics: [poolCreatedTopic] }, (log) => void this.handleLog(log).catch((error: unknown) => console.error('PancakeSwap V3 pool failed:', error)));
    console.log(`BSC PancakeSwap V3 WebSocket active for factory ${this.factory}.`);
    await new Promise<void>((resolve, reject) => {
      const websocket = (this.socket as unknown as { websocket?: WebSocketLike & { on?: (event: string, listener: (...args: never[]) => void) => void } }).websocket;
      websocket?.on?.('close', resolve);
      websocket?.on?.('error', reject);
    });
  }

  private async handleLog(log: Log): Promise<void> {
    const parsed = decodePancakeSwapV3PoolCreated(log);
    if (!parsed) return;
    const address = parsed.pool.toLowerCase();
    if (this.seen.has(address)) return;
    this.seen.add(address);
    const [token0, token1] = await Promise.all([this.metadata(parsed.token0), this.metadata(parsed.token1)]);
    const pool: PancakeSwapV3PoolRecord = {
      address, poolType: 'pancakeswap_v3', chain: 'bsc', factory: this.factory,
      token0: parsed.token0, token0Symbol: token0.symbol, token0Decimals: token0.decimals,
      token1: parsed.token1, token1Symbol: token1.symbol, token1Decimals: token1.decimals,
      fee: parsed.fee, tickSpacing: parsed.tickSpacing, transactionHash: log.transactionHash, blockNumber: log.blockNumber,
      discoveredAt: new Date().toISOString(),
    };
    this.database.upsertPancakeSwapV3Pool(pool);
    console.log(`Indexed new PancakeSwap V3 BSC pool ${address} (${pool.token0Symbol ?? pool.token0}/${pool.token1Symbol ?? pool.token1}, fee ${pool.fee}).`);
  }

  private async metadata(address: string): Promise<{ symbol: string | null; decimals: number }> {
    const token = new Contract(address, ERC20_METADATA_ABI, this.provider);
    const [symbol, decimals] = await Promise.all([token.symbol().catch(() => null) as Promise<string | null>, token.decimals().catch(() => 18) as Promise<number>]);
    return { symbol, decimals: Number(decimals) };
  }
}