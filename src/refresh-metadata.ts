import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { PoolDatabase } from './db.js';
import { loadTokenMetadata, metadataAddresses } from './metadata.js';

const rpcUrl = process.env.SOLANA_HTTP_RPC_URL ?? process.env.SOLANA_RPC_URL?.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:') ?? 'https://api.mainnet-beta.solana.com';
const database = new PoolDatabase(process.env.DATABASE_PATH ?? 'data/pumpswap.db');

try {
  const pools = database.pools();
  const mintAddresses = [...new Set(pools.flatMap((pool) => [pool.baseMint, pool.quoteMint]))];
  const connection = new Connection(rpcUrl, 'confirmed');
  const mints = mintAddresses.map((address) => new PublicKey(address));
  const mintAccounts = await connection.getMultipleAccountsInfo(mints, 'confirmed');
  const metadataAccounts = await connection.getMultipleAccountsInfo(metadataAddresses(mints), 'confirmed');
  const metadata = new Map<string, { symbol: string | null; logoUrl: string | null }>();
  for (const [index, mint] of mints.entries()) metadata.set(mintAddresses[index], await loadTokenMetadata(mint, mintAccounts[index]?.data ?? null, metadataAccounts[index]?.data ?? null));
  for (const pool of pools) {
    const base = metadata.get(pool.baseMint);
    const quote = metadata.get(pool.quoteMint);
    database.updateMetadata(pool.address, base?.symbol ?? null, quote?.symbol ?? null, base?.logoUrl ?? null, quote?.logoUrl ?? null);
  }
  console.log(`Refreshed symbols for ${pools.length} stored pools.`);
} finally {
  database.close();
}