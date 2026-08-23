const SOL_USD_FEED = '0x4ffC43a60e009B551865A93d232E33Fce9f01507';
const USDC_USD_FEED = '0xB97Ad0E74fa7d920791E90258A6E2085088b4320';
const LATEST_ROUND_DATA_SELECTOR = '0xfeaf968c';
const DECIMALS_SELECTOR = '0x313ce567';

export type ReferencePrices = { solPriceUsd: number | null; usdcPriceUsd: number };

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`EVM RPC returned HTTP ${response.status}`);
  const result = await response.json() as { result?: string; error?: { message?: string } };
  if (!result.result) throw new Error(result.error?.message ?? 'EVM RPC returned no result');
  return result.result;
}

async function readFeed(rpcUrl: string, feedAddress: string): Promise<number> {
  const [roundData, decimalsData] = await Promise.all([
    ethCall(rpcUrl, feedAddress, LATEST_ROUND_DATA_SELECTOR),
    ethCall(rpcUrl, feedAddress, DECIMALS_SELECTOR),
  ]);
  const decimals = Number(BigInt(decimalsData));
  const answer = BigInt(`0x${roundData.slice(2 + 64, 2 + 128)}`);
  if (answer <= 0n || decimals > 18) throw new Error(`Invalid Chainlink answer from ${feedAddress}`);
  return Number(answer) / 10 ** decimals;
}

export async function loadChainlinkPrices(): Promise<ReferencePrices> {
  const fallbackSol = process.env.SOL_PRICE_USD ? Number(process.env.SOL_PRICE_USD) : null;
  const fallbackUsdc = process.env.USDC_PRICE_USD ? Number(process.env.USDC_PRICE_USD) : 1;
  const ethereumRpc = process.env.CHAINLINK_ETHEREUM_RPC_URL;
  const bscRpc = process.env.CHAINLINK_BSC_RPC_URL;
  const solPriceUsd = ethereumRpc ? await readFeed(ethereumRpc, process.env.CHAINLINK_SOL_USD_FEED ?? SOL_USD_FEED).catch((error: unknown) => {
    console.warn('Chainlink SOL/USD unavailable; using fallback:', error instanceof Error ? error.message : error);
    return fallbackSol;
  }) : fallbackSol;
  const usdcPriceUsd = bscRpc ? await readFeed(bscRpc, process.env.CHAINLINK_USDC_USD_FEED ?? USDC_USD_FEED).catch((error: unknown) => {
    console.warn('Chainlink BSC USDC/USD unavailable; using fallback:', error instanceof Error ? error.message : error);
    return fallbackUsdc;
  }) : fallbackUsdc;
  return { solPriceUsd, usdcPriceUsd };
}