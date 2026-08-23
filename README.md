# PumpSwap Pool Indexer

The first slice of the Gecko Terminal-style data platform: discover PumpSwap pools on Solana mainnet and persist authoritative pool metadata in SQLite.

## Indexed metadata

- PumpSwap pool address and program ID
- Base and quote mint addresses, preserving PumpSwap ordering
- Base and quote symbols from Metaplex metadata when available
- Base and quote decimals from SPL Mint accounts
- LP mint, pool vaults, creator, coin creator, pool index, and last observed slot
- Orca Whirlpool pool address, token mints/vaults, fee settings, liquidity, and current Whirlpool state

## Run

For live-only indexing, use the Chainstack WebSocket endpoint. This subscribes to PumpSwap logs and does not request historical pools:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Set `INDEXER_TRANSPORT=bsc-pancakeswap-v2` to run only the BSC PancakeSwap V2 indexer; this mode does not initialize or connect to any Solana stream. Set `INDEXER_TRANSPORT=websocket` for the Solana WebSocket path or `INDEXER_TRANSPORT=grpc` for Yellowstone. WebSocket mode subscribes to PumpSwap, Raydium, Meteora DAMM v2, and Meteora DLMM state where pools are already indexed. Configure `SOLANA_WS_RPC_URLS` as a comma-separated rotation list; the public Solana endpoint is appended automatically. On provider failure, the account stream reconnects on the next endpoint. PumpSwap pricing subscribes directly to vault accounts, so normal price updates do not require an HTTP transaction lookup.

The database is created at `data/pumpswap.db` by default. The listener only follows `CreatePool` logs, then fetches and enriches the new pool account. A successful start prints a subscription ID and `Waiting for new pools...`; it stays running quietly until a pool is created. Run `npm test` for deterministic decoder and persistence checks, or `npm run build` for a strict TypeScript build.

Market valuation uses the following distinction: `fdvUsd` is calculated from token price in USD multiplied by on-chain total supply. `marketCapUsd` stays `null` until a trusted circulating-supply value is available; this prevents presenting FDV as circulating market cap. USDC is valued at 1 USD, while WSOL requires a trusted SOL/USD price source.

USD valuation is derived from each Solana pool price and its trusted quote: `tokenPriceUsd = tokenPriceInQuote * quotePriceUsd`. This gives every token with a WSOL or USDC quote a USD price; arbitrary Solana tokens do not have individual Chainlink feeds unless Chainlink explicitly supports them.

For live quote conversion, configure `CHAINLINK_ETHEREUM_RPC_URL` for the Chainlink SOL/USD feed and optionally `CHAINLINK_BSC_RPC_URL` for the supplied BSC USDC/USD feed. The configured feed addresses default to `CHAINLINK_SOL_USD_FEED=0x4ffC43a60e009B551865A93d232E33Fce9f01507` and `CHAINLINK_USDC_USD_FEED=0xB97Ad0E74fa7d920791E90258A6E2085088b4320`. These are EVM contracts and must be queried through EVM RPC, not Solana RPC. If the feed RPC is unavailable, the indexer falls back to `SOL_PRICE_USD` and `$1` for USDC.

WebSocket subscriptions and HTTP hydration are separate. `SOLANA_HTTP_RPC_URLS` rotates on rate limits and transient failures. Price fetching needs HTTP RPC because Solana WebSocket supports subscriptions, while transaction and account data are fetched with JSON-RPC methods. Add an Infura Solana HTTPS endpoint to this comma-separated list if it supports the required methods.

Set `TATUM_STREAMS=raydium`, `pumpswap`, `meteora`, `dlmm`, or `both` to run only the desired gRPC stream. Orca Whirlpool discovery and pricing run through the WebSocket transport and are stored separately in `orca_whirlpools`.

PancakeSwap V2 BSC pool discovery uses the factory `PairCreated` event and pair pricing uses `Sync` reserve events. Configure `BSC_WS_RPC_URL`, `BSC_HTTP_RPC_URL`, and set `BSC_PANCAKESWAP_V2=false` to disable it. Discovered pairs are stored in `bsc_pancakeswap_v2_pools` and prices in `bsc_pancakeswap_v2_prices`.

Set `INDEXER_TRANSPORT=bsc-pancakeswap-v3` to run only PancakeSwap V3 BSC indexing and pricing. It uses the official V3 factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`, listens for `Swap` events, and stores pools in `bsc_pancakeswap_v3_pools` and prices in `bsc_pancakeswap_v3_prices`.

Set `INDEXER_TRANSPORT=bsc-pancakeswap-infinity-cl` to run PancakeSwap Infinity concentrated-liquidity indexing and pricing. Configure `PANCAKESWAP_INFINITY_CL_MANAGER` with the verified BSC CLPoolManager address. Infinity is a singleton manager and emits `Initialize` and `Swap` events keyed by `poolId`; it does not use the V3 factory address. The manager address is intentionally required because it is deployment-specific and must not be guessed.

Set `INDEXER_TRANSPORT=bsc-uniswap-v3` to run only Uniswap V3 BSC indexing and pricing. It uses the BSC factory `0x36696169C63E42Cd08Ce11f5deeBbCeBae652050`, listens for `PoolCreated` and `Swap`, and stores data in `bsc_uniswap_v3_pools` and `bsc_uniswap_v3_prices`.

## Deploy to Fly.io

The included `fly.toml` deploys one always-on machine with a persistent volume mounted at `/app/data`. This is the correct shape for a short live monitoring trial with SQLite. Create the app and volume once, using a globally unique app name if `on-chain-pool-indexer` is already taken:

```powershell
fly apps create on-chain-pool-indexer
fly volumes create indexer_data --region ams --size 1 --app on-chain-pool-indexer
```

Set provider credentials as Fly secrets rather than committing `.env`:

```powershell
fly secrets set `
	SOLANA_WS_RPC_URL="wss://your-primary-endpoint" `
	SOLANA_WS_RPC_URLS="wss://your-primary-endpoint,wss://your-backup-endpoint" `
	SOLANA_HTTP_RPC_URLS="https://your-infura-solana-endpoint-1,https://your-infura-solana-endpoint-2" `
	CHAINLINK_ETHEREUM_RPC_URL="https://your-ethereum-rpc" `
	CHAINLINK_BSC_RPC_URL="https://your-bsc-rpc"
fly deploy --app on-chain-pool-indexer
```

Monitor the machine with `fly status --app on-chain-pool-indexer`, `fly logs --app on-chain-pool-indexer`, and `fly checks list --app on-chain-pool-indexer`. The health endpoint is `https://on-chain-pool-indexer.fly.dev/healthz` after deployment. Inspect the persistent SQLite data with `fly ssh console --app on-chain-pool-indexer -C "node -e \"import Database from 'better-sqlite3'; const db = new Database('/app/data/pumpswap.db', {readonly:true}); console.log(db.prepare('select count(*) as pools from pools').get()); db.close();\""`.

The complete SQLite DDL is in `schema.sql`. The application also creates and migrates these tables automatically on startup. Do not use multiple Fly machines with this SQLite volume; move to Postgres before scaling horizontally.

### PostgreSQL schema

The PostgreSQL DDL is in `schema.postgres.sql`. Run it with `psql` using the direct Fly Postgres connection string when available:

```powershell
$env:DATABASE_URL = "paste-the-rotated-postgres-url-here"
npm run db:migrate-postgres
Remove-Item Env:DATABASE_URL
```

The same migration runs on the production image after setting `DATABASE_URL` as a Fly secret: `fly ssh console -C "node dist/src/migrate-postgres.js"`.

The `pgbouncer` URL can be suitable for application traffic, but a direct connection URL is preferable for DDL and migrations. Do not commit the URL or put it in a command saved to shell history. Set `DATABASE_BACKEND=postgres` and `DATABASE_URL` to enable PostgreSQL runtime writes. SQLite remains active as the local synchronous cache and development database, so existing indexer APIs continue to work while writes are mirrored to PostgreSQL. Leave `DATABASE_BACKEND=sqlite` for SQLite-only development.

Inspect stored pools from another PowerShell terminal with:

```powershell
npm run db:inspect
```

After updating metadata logic, backfill symbols on existing rows with:

```powershell
$env:SOLANA_HTTP_RPC_URL = "https://your-chainstack-endpoint"
npm run db:refresh-metadata
```

For a single pool, query by address with the SQLite driver:

```powershell
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database('data/pumpswap.db', {readonly:true}); console.dir(db.prepare('SELECT * FROM pools WHERE address = ?').get('POOL_ADDRESS'), {depth:null}); db.close();"
```