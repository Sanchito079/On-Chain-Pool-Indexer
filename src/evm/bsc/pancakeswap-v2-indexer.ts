import { Contract, Interface, JsonRpcProvider, WebSocketProvider, id, type Log, type WebSocketLike } from 'ethers';
import { PoolDatabase } from '../../db.js';
import { PANCAKESWAP_V2_FACTORY, PANCAKESWAP_V2_FACTORY_ABI, ERC20_METADATA_ABI } from './pancakeswap-v2-constants.js';
import { PancakeSwapV2PoolRecord } from './pancakeswap-v2-types.js';
import { calculatePancakeSwapV2Price, decodeSyncLog, syncTopic, type PancakeSwapV2Price } from './pancakeswap-v2-price.js';

const pairCreatedTopic = id('PairCreated(address,address,address,uint256)');
const factoryInterface = new Interface(PANCAKESWAP_V2_FACTORY_ABI);

export function decodePairCreatedLog(log: Pick<Log, 'topics' | 'data'>): { token0: string; token1: string; pair: string; pairIndex: string } | null {
  const parsed = factoryInterface.parseLog({ topics: [...log.topics], data: log.data });
  if (!parsed || parsed.name !== 'PairCreated') return null;
  return { token0: String(parsed.args[0]), token1: String(parsed.args[1]), pair: String(parsed.args[2]), pairIndex: String(parsed.args[3]) };
}

export class PancakeSwapV2Indexer {
  private socket: WebSocketProvider | undefined;
  private readonly provider: JsonRpcProvider;
  private readonly seen = new Set<string>();

  constructor(private readonly database: PoolDatabase, httpUrl: string, private readonly wsUrl: string, private readonly factory = PANCAKESWAP_V2_FACTORY, private readonly onPrice?: (price: PancakeSwapV2Price) => void) {
    this.provider = new JsonRpcProvider(httpUrl, 56, { staticNetwork: true });
  }

  async start(): Promise<void> {
    this.socket = new WebSocketProvider(this.wsUrl) as WebSocketProvider;
    for (const pool of this.database.pancakeSwapV2Pools()) { this.seen.add(pool.address.toLowerCase()); this.subscribePair(pool); }
    this.socket.on({ address: this.factory, topics: [pairCreatedTopic] }, (log) => {
      void this.handleLog(log).catch((error: unknown) => console.error('PancakeSwap V2 pool failed:', error));
    });
    console.log(`BSC PancakeSwap V2 WebSocket active for factory ${this.factory}.`);
    await new Promise<void>((resolve, reject) => {
      const websocket = (this.socket as unknown as { websocket?: WebSocketLike & { on?: (event: string, listener: (...args: never[]) => void) => void } }).websocket;
      websocket?.on?.('close', resolve);
      websocket?.on?.('error', reject);
    });
  }

  private async handleLog(log: Log): Promise<void> {
    const parsed = decodePairCreatedLog(log);
    if (!parsed) return;
    const pair = parsed.pair.toLowerCase();
    if (this.seen.has(pair)) return;
    this.seen.add(pair);
    const token0 = parsed.token0;
    const token1 = parsed.token1;
    const [token0Metadata, token1Metadata] = await Promise.all([this.metadata(token0), this.metadata(token1)]);
    const record: PancakeSwapV2PoolRecord = {
      address: pair, poolType: 'pancakeswap_v2', chain: 'bsc', factory: this.factory,
      token0, token0Symbol: token0Metadata.symbol, token0Decimals: token0Metadata.decimals,
      token1, token1Symbol: token1Metadata.symbol, token1Decimals: token1Metadata.decimals,
      pairIndex: parsed.pairIndex, transactionHash: log.transactionHash, blockNumber: log.blockNumber,
      discoveredAt: new Date().toISOString(),
    };
    this.database.upsertPancakeSwapV2Pool(record);
    this.subscribePair(record);
    console.log(`Indexed new PancakeSwap V2 BSC pool ${pair} (${record.token0Symbol ?? token0}/${record.token1Symbol ?? token1}).`);
  }

  private subscribePair(pool: PancakeSwapV2PoolRecord): void {
    if (!this.socket) return;
    this.socket.on({ address: pool.address, topics: [syncTopic] }, (log) => {
      const reserves = decodeSyncLog(log);
      if (!reserves) return;
      this.onPrice?.(calculatePancakeSwapV2Price(pool, reserves.reserve0, reserves.reserve1, log.blockNumber));
    });
  }

  private async metadata(address: string): Promise<{ symbol: string | null; decimals: number }> {
    const token = new Contract(address, ERC20_METADATA_ABI, this.provider);
    const [symbol, decimals] = await Promise.all([
      token.symbol().catch(() => null) as Promise<string | null>,
      token.decimals().catch(() => 18) as Promise<number>,
    ]);
    return { symbol, decimals: Number(decimals) };
  }
}