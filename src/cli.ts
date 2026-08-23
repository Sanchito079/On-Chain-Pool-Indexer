import 'dotenv/config';
import { createServer } from 'node:http';
import { Connection } from '@solana/web3.js';
import { NETWORK } from './constants.js';
import { PoolDatabase } from './db.js';
import { PumpSwapIndexer } from './indexer.js';
import { PriceWebSocket } from './price-fetcher/websocket.js';
import { PumpSwapWebSocketIndexer } from './websocket-indexer.js';
import { httpRpcUrls } from './rpc.js';
import { PumpSwapGrpcIndexer } from './grpc-indexer.js';
import { RaydiumGrpcIndexer } from './raydium-grpc-indexer.js';
import { MeteoraGrpcIndexer } from './meteora-grpc-indexer.js';
import { MeteoraPriceProcessor } from './meteora-price.js';
import { DlmmGrpcIndexer } from './dlmm-grpc-indexer.js';
import { DlmmPriceProcessor } from './dlmm-price.js';
import { RaydiumPriceProcessor } from './raydium-price.js';
import { loadChainlinkPrices } from './chainlink.js';
import { SolanaAccountWebSocket, solanaWsUrls } from './solana-account-websocket.js';
import { SolanaLogWebSocket } from './solana-log-websocket.js';
import { RAYDIUM_CLMM_PROGRAM_ID } from './raydium-constants.js';
import { METEORA_DAMM_V2_PROGRAM_ID } from './meteora-constants.js';
import { METEORA_DLMM_PROGRAM_ID } from './dlmm-constants.js';
import { isDammPoolCreation, isDlmmPoolCreation, isRaydiumPoolCreation } from './pool-discovery.js';
import { isOrcaWhirlpoolCreation } from './pool-discovery.js';
import { ORCA_WHIRLPOOL_PROGRAM_ID } from './orca-constants.js';
import { OrcaIndexer } from './orca-indexer.js';
import { OrcaPriceProcessor } from './orca-price.js';
import { PancakeSwapV2Indexer } from './evm/bsc/pancakeswap-v2-indexer.js';
import { PancakeSwapV3Indexer } from './evm/bsc/pancakeswap-v3-indexer.js';
import { PancakeSwapV3Price } from './evm/bsc/pancakeswap-v3-price.js';
import { PancakeSwapInfinityClPrice } from './evm/bsc/pancakeswap-infinity-price.js';
import { PancakeSwapInfinityIndexer } from './evm/bsc/pancakeswap-infinity-indexer.js';
import { UniswapV3Indexer } from './evm/bsc/uniswap-v3-indexer.js';
import { UniswapV3Price } from './evm/bsc/uniswap-v3-price.js';

const rpcUrl = process.env.SOLANA_WS_RPC_URL ?? process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const transport = (process.env.INDEXER_TRANSPORT ?? 'grpc').toLowerCase();
const httpUrls = httpRpcUrls();
const databasePath = process.env.DATABASE_PATH ?? 'data/pumpswap.db';
const database = new PoolDatabase(databasePath);
const lastOutput = new Map<string, number>();
const pendingOutput = new Map<string, { price: import('./price-fetcher/types.js').PoolPrice; timer: NodeJS.Timeout }>();
const healthServer = createServer((request, response) => {
  if (request.url !== '/healthz') { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status: 'ok', transport, uptime: process.uptime() }));
});
healthServer.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');

function handlePrice(price: import('./price-fetcher/types.js').PoolPrice): void {
  database.recordPrice(price);
  const now = Date.now();
  const previous = lastOutput.get(price.poolAddress) ?? 0;
  const emit = (latest: import('./price-fetcher/types.js').PoolPrice) => {
    lastOutput.set(latest.poolAddress, Date.now());
    pendingOutput.delete(latest.poolAddress);
    const color = latest.priceChangeDirection === 'up' ? '\x1b[32m' : latest.priceChangeDirection === 'down' ? '\x1b[31m' : '\x1b[0m';
    const change = latest.priceChangePercent === null ? 'n/a' : `${latest.priceChangePercent >= 0 ? '+' : ''}${latest.priceChangePercent.toFixed(4)}%`;
    const fdv = latest.fdvUsd === null ? 'n/a' : `$${latest.fdvUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    console.log(`${color}[${latest.poolAddress}] ${latest.baseSymbol ?? latest.baseMint}/${latest.quoteAsset}: ${latest.price ?? 'n/a'} (${change}) (inverse ${latest.inversePrice ?? 'n/a'}) FDV ${fdv}\x1b[0m`);
  };
  if (now - previous >= 1_000) {
    emit(price);
    return;
  }
  const existing = pendingOutput.get(price.poolAddress);
  if (existing) {
    clearTimeout(existing.timer);
    existing.price = price;
  }
  const timer = setTimeout(() => emit(pendingOutput.get(price.poolAddress)?.price ?? price), Math.max(1, 1_000 - (now - previous)));
  pendingOutput.set(price.poolAddress, { price, timer });
}

try {
  await database.ready();
  const grpcEndpoint = process.env.SOLANA_GRPC_ENDPOINT;
  const grpcApiKey = process.env.TATUM_API_KEY;
  if (transport === 'bsc-uniswap-v3' || transport === 'uniswap-v3') {
    const bscHttpUrl = process.env.BSC_HTTP_RPC_URL ?? 'https://bsc.blockrazor.xyz';
    const bscWsUrl = process.env.BSC_WS_RPC_URL ?? 'wss://bsc-rpc.publicnode.com';
    console.log('Indexer transport: BSC Uniswap V3 only. Solana streams are disabled.');
    await new UniswapV3Indexer(database, bscHttpUrl, bscWsUrl, undefined, (price: UniswapV3Price) => {
      database.upsertUniswapV3Price(price);
      console.log(`[BSC Uniswap V3] ${price.baseToken}/${price.quoteToken}: ${price.price ?? 'n/a'} (inverse ${price.inversePrice ?? 'n/a'})`);
    }).start();
  } else if (transport === 'bsc-pancakeswap-v3' || transport === 'pancakeswap-v3') {
    const bscHttpUrl = process.env.BSC_HTTP_RPC_URL ?? 'https://bsc.blockrazor.xyz';
    const bscWsUrl = process.env.BSC_WS_RPC_URL ?? 'wss://bsc-rpc.publicnode.com';
    console.log('Indexer transport: BSC PancakeSwap V3 only. Solana streams are disabled.');
    await new PancakeSwapV3Indexer(database, bscHttpUrl, bscWsUrl, undefined, (price: PancakeSwapV3Price) => {
      database.upsertPancakeSwapV3Price(price);
      console.log(`[BSC PancakeSwap V3] ${price.baseToken}/${price.quoteToken}: ${price.price ?? 'n/a'} (inverse ${price.inversePrice ?? 'n/a'})`);
    }).start();
  } else if (transport === 'bsc-pancakeswap-infinity-cl' || transport === 'pancakeswap-infinity-cl') {
    const bscHttpUrl = process.env.BSC_HTTP_RPC_URL ?? 'https://bsc.blockrazor.xyz';
    const bscWsUrl = process.env.BSC_WS_RPC_URL ?? 'wss://bsc-rpc.publicnode.com';
    console.log('Indexer transport: BSC PancakeSwap Infinity CL only. Solana streams are disabled.');
    await new PancakeSwapInfinityIndexer(database, bscHttpUrl, bscWsUrl, undefined, (price: PancakeSwapInfinityClPrice) => {
      database.upsertPancakeSwapInfinityPrice(price);
      console.log(`[BSC PancakeSwap Infinity CL] ${price.baseCurrency}/${price.quoteCurrency}: ${price.price ?? 'n/a'} (inverse ${price.inversePrice ?? 'n/a'})`);
    }).start();
  } else if (transport === 'bsc-pancakeswap-v2' || transport === 'pancakeswap-v2') {
    const bscHttpUrl = process.env.BSC_HTTP_RPC_URL ?? 'https://bsc.blockrazor.xyz';
    const bscWsUrl = process.env.BSC_WS_RPC_URL ?? 'wss://bsc-rpc.publicnode.com';
    console.log('Indexer transport: BSC PancakeSwap V2 only. Solana streams are disabled.');
    await new PancakeSwapV2Indexer(database, bscHttpUrl, bscWsUrl, undefined, (price) => {
      database.upsertPancakeSwapV2Price(price);
      const change = price.price === null ? 'n/a' : price.price.toString();
      console.log(`[BSC PancakeSwap V2] ${price.baseToken}/${price.quoteToken}: ${change} (inverse ${price.inversePrice ?? 'n/a'})`);
    }).start();
  } else if (transport === 'grpc' && grpcEndpoint && grpcApiKey) {
    const streams = new Set((process.env.TATUM_STREAMS ?? 'both').split(',').map((stream) => stream.trim().toLowerCase()));
    const prices = new PriceWebSocket(grpcEndpoint, handlePrice, httpUrls);
    const poolIndexer = new PumpSwapWebSocketIndexer(grpcEndpoint, database, (pool) => prices.addPool(pool), httpUrls);
    prices.addPools(database.pools());
    const tasks: Promise<void>[] = [];
    if (streams.has('both') || streams.has('pumpswap')) tasks.push(new PumpSwapGrpcIndexer(grpcEndpoint, grpcApiKey, (signature, slot) => poolIndexer.processTransaction(signature, slot), (update) => prices.processGrpcTransaction(update)).start()
      .catch((error: unknown) => console.error('PumpSwap gRPC stream failed:', error)));
    const chainlinkPrices = await loadChainlinkPrices();
    console.log(`Reference prices: SOL/USD ${chainlinkPrices.solPriceUsd ?? 'n/a'}, USDC/USD ${chainlinkPrices.usdcPriceUsd}`);
    const raydiumApiKey = process.env.RAYDIUM_TATUM_API_KEY ?? grpcApiKey;
    const raydiumPrices = new RaydiumPriceProcessor(handlePrice, chainlinkPrices.solPriceUsd, chainlinkPrices.usdcPriceUsd);
    raydiumPrices.addPools(database.raydiumPools());
    if (streams.has('both') || streams.has('raydium')) tasks.push(new RaydiumGrpcIndexer(grpcEndpoint, raydiumApiKey, database, httpUrls, (address, data, slot) => raydiumPrices.updatePoolAccount(address, data, slot), (pool) => raydiumPrices.addPool(pool)).start()
      .catch((error: unknown) => console.error('Raydium gRPC stream failed:', error)));
    const meteoraApiKey = process.env.METEORA_TATUM_API_KEY ?? grpcApiKey;
    const meteoraPrices = new MeteoraPriceProcessor(handlePrice, chainlinkPrices.solPriceUsd, chainlinkPrices.usdcPriceUsd);
    meteoraPrices.addPools(database.meteoraPools());
    if (streams.has('both') || streams.has('meteora')) tasks.push(new MeteoraGrpcIndexer(grpcEndpoint, meteoraApiKey, database, httpUrls, (update) => meteoraPrices.processTransaction(update), (pool) => meteoraPrices.addPool(pool), (address, data, slot) => meteoraPrices.updatePoolAccount(address, data, slot)).start()
      .catch((error: unknown) => console.error('Meteora gRPC stream failed:', error)));
    const dlmmApiKey = process.env.DLMM_TATUM_API_KEY ?? meteoraApiKey;
    const dlmmPrices = new DlmmPriceProcessor(handlePrice, chainlinkPrices.solPriceUsd, chainlinkPrices.usdcPriceUsd);
    dlmmPrices.addPools(database.dlmmPools());
    const refreshReferencePrices = async (): Promise<void> => {
      const prices = await loadChainlinkPrices();
      raydiumPrices.setReferencePrices(prices.solPriceUsd, prices.usdcPriceUsd);
      meteoraPrices.setReferencePrices(prices.solPriceUsd, prices.usdcPriceUsd);
      dlmmPrices.setReferencePrices(prices.solPriceUsd, prices.usdcPriceUsd);
      console.log(`Reference prices refreshed: SOL/USD ${prices.solPriceUsd ?? 'n/a'}, USDC/USD ${prices.usdcPriceUsd}`);
    };
    const referencePriceTimer = setInterval(() => void refreshReferencePrices().catch((error: unknown) => console.error('Reference price refresh failed:', error)), 60_000);
    if (streams.has('both') || streams.has('dlmm')) tasks.push(new DlmmGrpcIndexer(grpcEndpoint, dlmmApiKey, database, httpUrls, (pool) => dlmmPrices.addPool(pool), (address, data, slot) => dlmmPrices.updatePoolAccount(address, data, slot)).start()
      .catch((error: unknown) => console.error('Meteora DLMM gRPC stream failed:', error)));
    if (!tasks.length) throw new Error('TATUM_STREAMS must include pumpswap, raydium, meteora, dlmm, or both');
    await Promise.all(tasks);
    clearInterval(referencePriceTimer);
  } else if (transport === 'websocket' || rpcUrl.startsWith('ws')) {
    if (!rpcUrl.startsWith('ws')) throw new Error('INDEXER_TRANSPORT=websocket requires SOLANA_WS_RPC_URL');
    console.log('Indexer transport: Solana WebSocket (all protocol live paths).');
    const prices = new PriceWebSocket(rpcUrl, handlePrice, httpUrls);
    void prices.start(database.pools()).catch((error: unknown) => console.error('Price WebSocket failed:', error));
    const protocolSocket = new SolanaAccountWebSocket(solanaWsUrls());
    const chainlinkPrices = await loadChainlinkPrices();
    const raydiumPrices = new RaydiumPriceProcessor(handlePrice, chainlinkPrices.solPriceUsd, chainlinkPrices.usdcPriceUsd);
    const meteoraPrices = new MeteoraPriceProcessor(handlePrice, chainlinkPrices.solPriceUsd, chainlinkPrices.usdcPriceUsd);
    const dlmmPrices = new DlmmPriceProcessor(handlePrice, chainlinkPrices.solPriceUsd, chainlinkPrices.usdcPriceUsd);
    const orcaPrices = new OrcaPriceProcessor(handlePrice, chainlinkPrices.solPriceUsd, chainlinkPrices.usdcPriceUsd);
    for (const pool of database.raydiumPools()) { raydiumPrices.addPool(pool); protocolSocket.addAccount(pool.address, (data, slot) => raydiumPrices.updatePoolAccount(pool.address, data, slot)); }
    for (const pool of database.meteoraPools()) { meteoraPrices.addPool(pool); protocolSocket.addAccount(pool.address, (data, slot) => meteoraPrices.updatePoolAccount(pool.address, data, slot)); }
    for (const pool of database.dlmmPools()) { dlmmPrices.addPool(pool); protocolSocket.addAccount(pool.address, (data, slot) => dlmmPrices.updatePoolAccount(pool.address, data, slot)); }
    for (const pool of database.orcaWhirlpools()) { orcaPrices.addPool(pool); protocolSocket.addAccount(pool.address, (data, slot) => orcaPrices.updatePoolAccount(pool.address, data, slot)); }
    void protocolSocket.start().catch((error: unknown) => console.error('Protocol account WebSocket failed:', error));
    const discoveryEndpoint = process.env.SOLANA_GRPC_ENDPOINT ?? 'https://unused.invalid';
    const raydiumDiscovery = new RaydiumGrpcIndexer(discoveryEndpoint, '', database, httpUrls,
      (address, data, slot) => raydiumPrices.updatePoolAccount(address, data, slot),
      (pool) => { raydiumPrices.addPool(pool); protocolSocket.addAccount(pool.address, (data, slot) => raydiumPrices.updatePoolAccount(pool.address, data, slot)); });
    const meteoraDiscovery = new MeteoraGrpcIndexer(discoveryEndpoint, '', database, httpUrls, undefined,
      (pool) => { meteoraPrices.addPool(pool); protocolSocket.addAccount(pool.address, (data, slot) => meteoraPrices.updatePoolAccount(pool.address, data, slot)); });
    const dlmmDiscovery = new DlmmGrpcIndexer(discoveryEndpoint, '', database, httpUrls,
      (pool) => { dlmmPrices.addPool(pool); protocolSocket.addAccount(pool.address, (data, slot) => dlmmPrices.updatePoolAccount(pool.address, data, slot)); });
    const orcaDiscovery = new OrcaIndexer(database, httpUrls, (pool) => { orcaPrices.addPool(pool); protocolSocket.addAccount(pool.address, (data, slot) => orcaPrices.updatePoolAccount(pool.address, data, slot)); });
    const discoverySocket = new SolanaLogWebSocket(solanaWsUrls());
    discoverySocket.addProgram(RAYDIUM_CLMM_PROGRAM_ID.toBase58(), (signature, slot, logs) => { if (isRaydiumPoolCreation(logs)) void raydiumDiscovery.processSignature(signature, slot).catch((error: unknown) => console.error('Raydium WebSocket discovery failed:', error)); });
    discoverySocket.addProgram(METEORA_DAMM_V2_PROGRAM_ID.toBase58(), (signature, slot, logs) => { if (isDammPoolCreation(logs)) void meteoraDiscovery.processSignature(signature, slot).catch((error: unknown) => console.error('Meteora WebSocket discovery failed:', error)); });
    discoverySocket.addProgram(METEORA_DLMM_PROGRAM_ID.toBase58(), (signature, slot, logs) => { if (isDlmmPoolCreation(logs)) void dlmmDiscovery.processSignature(signature, slot).catch((error: unknown) => console.error('DLMM WebSocket discovery failed:', error)); });
    discoverySocket.addProgram(ORCA_WHIRLPOOL_PROGRAM_ID.toBase58(), (signature, slot, logs) => { if (isOrcaWhirlpoolCreation(logs)) void orcaDiscovery.processSignature(signature, slot).catch((error: unknown) => console.error('Orca WebSocket discovery failed:', error)); });
    void discoverySocket.start().catch((error: unknown) => console.error('Protocol discovery WebSocket failed:', error));
    await new PumpSwapWebSocketIndexer(rpcUrl, database, (pool) => prices.addPool(pool), httpUrls).start();
  } else {
    const count = await new PumpSwapIndexer(new Connection(rpcUrl, 'confirmed'), database).sync();
    console.log(`Indexed ${count} PumpSwap pools on ${NETWORK}. Database total: ${database.count()}.`);
  }
} finally {
  healthServer.close();
  database.close();
}