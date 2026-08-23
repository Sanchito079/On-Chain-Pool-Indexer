import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { PoolRecord } from './types.js';
import { PostgresWriter } from './postgres.js';

export class PoolDatabase {
  private readonly db: Database.Database;
  private readonly postgres: PostgresWriter | undefined;

  constructor(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.postgres = process.env.DATABASE_BACKEND === 'postgres' && process.env.DATABASE_URL ? new PostgresWriter(process.env.DATABASE_URL) : undefined;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS pools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, program_id TEXT NOT NULL, network TEXT NOT NULL,
      base_mint TEXT NOT NULL, base_symbol TEXT, base_decimals INTEGER NOT NULL,
      base_logo_url TEXT, quote_mint TEXT NOT NULL, quote_symbol TEXT, quote_decimals INTEGER NOT NULL,
      quote_logo_url TEXT,
      lp_mint TEXT NOT NULL, pool_base_token_account TEXT NOT NULL,
      pool_quote_token_account TEXT NOT NULL, creator TEXT NOT NULL, coin_creator TEXT NOT NULL,
      pool_index INTEGER NOT NULL, updated_slot INTEGER NOT NULL, discovered_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS pools_base_mint_idx ON pools(base_mint);
    CREATE INDEX IF NOT EXISTS pools_quote_mint_idx ON pools(quote_mint);
    CREATE INDEX IF NOT EXISTS pools_updated_slot_idx ON pools(updated_slot);
    CREATE TABLE IF NOT EXISTS latest_prices (
      pool_address TEXT PRIMARY KEY, price REAL, inverse_price REAL,
      price_change REAL, price_change_percent REAL, price_change_direction TEXT,
      fdv_usd REAL, token_price_usd REAL, total_supply REAL, supply_basis TEXT,
      base_reserve TEXT NOT NULL, quote_reserve TEXT NOT NULL,
      updated_slot INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS price_candles (
      pool_address TEXT NOT NULL, timeframe TEXT NOT NULL, bucket_start INTEGER NOT NULL,
      open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL,
      volume REAL, updated_at TEXT NOT NULL,
      PRIMARY KEY (pool_address, timeframe, bucket_start)
    );
    CREATE INDEX IF NOT EXISTS price_candles_lookup_idx ON price_candles(pool_address, timeframe, bucket_start);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS raydium_pools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, program_id TEXT NOT NULL, network TEXT NOT NULL,
      amm_config TEXT NOT NULL, owner TEXT NOT NULL, token_mint_0 TEXT NOT NULL, token_mint_0_symbol TEXT,
      token_mint_0_decimals INTEGER NOT NULL, token_mint_0_total_supply_raw TEXT NOT NULL DEFAULT '0', token_mint_0_logo_url TEXT, token_mint_1 TEXT NOT NULL,
      token_mint_1_symbol TEXT, token_mint_1_decimals INTEGER NOT NULL, token_mint_1_total_supply_raw TEXT NOT NULL DEFAULT '0', token_mint_1_logo_url TEXT,
      token_vault_0 TEXT NOT NULL, token_vault_1 TEXT NOT NULL, observation_key TEXT NOT NULL,
      tick_spacing INTEGER NOT NULL, sqrt_price_x64 TEXT NOT NULL, tick_current INTEGER NOT NULL,
      updated_slot INTEGER NOT NULL, discovered_at TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS raydium_pools_mint_0_idx ON raydium_pools(token_mint_0);
    CREATE INDEX IF NOT EXISTS raydium_pools_mint_1_idx ON raydium_pools(token_mint_1);`);
    for (const column of ['token_mint_0_total_supply_raw', 'token_mint_1_total_supply_raw']) {
      const exists = this.db.prepare('SELECT 1 FROM pragma_table_info(\'raydium_pools\') WHERE name = ?').get(column);
      if (!exists) this.db.exec(`ALTER TABLE raydium_pools ADD COLUMN ${column} TEXT NOT NULL DEFAULT '0'`);
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS orca_whirlpools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, program_id TEXT NOT NULL, network TEXT NOT NULL,
      whirlpools_config TEXT NOT NULL, token_mint_a TEXT NOT NULL, token_mint_a_symbol TEXT,
      token_mint_a_decimals INTEGER NOT NULL, token_mint_a_total_supply_raw TEXT NOT NULL DEFAULT '0', token_mint_a_logo_url TEXT,
      token_mint_b TEXT NOT NULL, token_mint_b_symbol TEXT, token_mint_b_decimals INTEGER NOT NULL,
      token_mint_b_total_supply_raw TEXT NOT NULL DEFAULT '0', token_mint_b_logo_url TEXT,
      token_vault_a TEXT NOT NULL, token_vault_b TEXT NOT NULL, tick_spacing INTEGER NOT NULL,
      fee_rate INTEGER NOT NULL, protocol_fee_rate INTEGER NOT NULL, liquidity TEXT NOT NULL,
      sqrt_price_x64 TEXT NOT NULL, tick_current_index INTEGER NOT NULL, updated_slot INTEGER NOT NULL,
      discovered_at TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS orca_whirlpools_mint_a_idx ON orca_whirlpools(token_mint_a);
    CREATE INDEX IF NOT EXISTS orca_whirlpools_mint_b_idx ON orca_whirlpools(token_mint_b);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS meteora_damm_v2_pools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, program_id TEXT NOT NULL, network TEXT NOT NULL,
      creator TEXT NOT NULL, token_a_mint TEXT NOT NULL, token_a_symbol TEXT, token_a_decimals INTEGER NOT NULL, token_a_total_supply_raw TEXT NOT NULL DEFAULT '0',
      token_a_logo_url TEXT, token_b_mint TEXT NOT NULL, token_b_symbol TEXT, token_b_decimals INTEGER NOT NULL, token_b_total_supply_raw TEXT NOT NULL DEFAULT '0',
      token_b_logo_url TEXT, token_a_vault TEXT NOT NULL, token_b_vault TEXT NOT NULL,
      token_a_amount TEXT NOT NULL, token_b_amount TEXT NOT NULL, sqrt_price TEXT NOT NULL,
      activation_point TEXT NOT NULL, pool_mode INTEGER NOT NULL, updated_slot INTEGER NOT NULL,
      discovered_at TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS meteora_damm_v2_mint_a_idx ON meteora_damm_v2_pools(token_a_mint);
    CREATE INDEX IF NOT EXISTS meteora_damm_v2_mint_b_idx ON meteora_damm_v2_pools(token_b_mint);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS meteora_dlmm_pools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, program_id TEXT NOT NULL, network TEXT NOT NULL,
      creator TEXT NOT NULL, token_x_mint TEXT NOT NULL, token_x_symbol TEXT, token_x_decimals INTEGER NOT NULL, token_x_total_supply_raw TEXT NOT NULL DEFAULT '0',
      token_x_logo_url TEXT, token_y_mint TEXT NOT NULL, token_y_symbol TEXT, token_y_decimals INTEGER NOT NULL, token_y_total_supply_raw TEXT NOT NULL DEFAULT '0',
      token_y_logo_url TEXT, reserve_x TEXT NOT NULL, reserve_y TEXT NOT NULL, oracle TEXT NOT NULL,
      active_id INTEGER NOT NULL, bin_step INTEGER NOT NULL, activation_point TEXT NOT NULL,
      updated_slot INTEGER NOT NULL, discovered_at TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS meteora_dlmm_mint_x_idx ON meteora_dlmm_pools(token_x_mint);
    CREATE INDEX IF NOT EXISTS meteora_dlmm_mint_y_idx ON meteora_dlmm_pools(token_y_mint);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_pancakeswap_v2_pools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, chain TEXT NOT NULL, factory TEXT NOT NULL,
      token0 TEXT NOT NULL, token0_symbol TEXT, token0_decimals INTEGER NOT NULL,
      token1 TEXT NOT NULL, token1_symbol TEXT, token1_decimals INTEGER NOT NULL,
      pair_index TEXT NOT NULL, transaction_hash TEXT NOT NULL, block_number INTEGER NOT NULL,
      discovered_at TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS bsc_pancakeswap_v2_token0_idx ON bsc_pancakeswap_v2_pools(token0);
    CREATE INDEX IF NOT EXISTS bsc_pancakeswap_v2_token1_idx ON bsc_pancakeswap_v2_pools(token1);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_pancakeswap_v2_prices (
      pool_address TEXT PRIMARY KEY, reserve0 TEXT NOT NULL, reserve1 TEXT NOT NULL,
      price REAL, inverse_price REAL, base_token TEXT NOT NULL, quote_token TEXT NOT NULL,
      updated_block INTEGER NOT NULL, updated_at TEXT NOT NULL
    );`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_pancakeswap_v3_pools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, chain TEXT NOT NULL, factory TEXT NOT NULL,
      token0 TEXT NOT NULL, token0_symbol TEXT, token0_decimals INTEGER NOT NULL,
      token1 TEXT NOT NULL, token1_symbol TEXT, token1_decimals INTEGER NOT NULL,
      fee INTEGER NOT NULL, tick_spacing INTEGER NOT NULL, transaction_hash TEXT NOT NULL,
      block_number INTEGER NOT NULL, discovered_at TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS bsc_pancakeswap_v3_token0_idx ON bsc_pancakeswap_v3_pools(token0);
    CREATE INDEX IF NOT EXISTS bsc_pancakeswap_v3_token1_idx ON bsc_pancakeswap_v3_pools(token1);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_pancakeswap_v3_prices (
      pool_address TEXT PRIMARY KEY, price REAL, inverse_price REAL, base_token TEXT NOT NULL,
      quote_token TEXT NOT NULL, sqrt_price_x96 TEXT NOT NULL, liquidity TEXT NOT NULL,
      tick INTEGER NOT NULL, updated_block INTEGER NOT NULL, updated_at TEXT NOT NULL
    );`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_pancakeswap_infinity_cl_pools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, chain TEXT NOT NULL, manager TEXT NOT NULL, pool_id TEXT NOT NULL,
      currency0 TEXT NOT NULL, currency0_symbol TEXT, currency0_decimals INTEGER NOT NULL,
      currency1 TEXT NOT NULL, currency1_symbol TEXT, currency1_decimals INTEGER NOT NULL,
      hooks TEXT NOT NULL, fee INTEGER NOT NULL, parameters TEXT NOT NULL, sqrt_price_x96 TEXT NOT NULL,
      tick INTEGER NOT NULL, transaction_hash TEXT NOT NULL, block_number INTEGER NOT NULL,
      discovered_at TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS bsc_pancakeswap_infinity_cl_currency0_idx ON bsc_pancakeswap_infinity_cl_pools(currency0);
    CREATE INDEX IF NOT EXISTS bsc_pancakeswap_infinity_cl_currency1_idx ON bsc_pancakeswap_infinity_cl_pools(currency1);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_pancakeswap_infinity_cl_prices (
      pool_id TEXT PRIMARY KEY, pool_address TEXT NOT NULL, price REAL, inverse_price REAL,
      base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL, sqrt_price_x96 TEXT NOT NULL,
      liquidity TEXT NOT NULL, tick INTEGER NOT NULL, fee INTEGER NOT NULL,
      updated_block INTEGER NOT NULL, updated_at TEXT NOT NULL
    );`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_uniswap_v3_pools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, chain TEXT NOT NULL, factory TEXT NOT NULL,
      token0 TEXT NOT NULL, token0_symbol TEXT, token0_decimals INTEGER NOT NULL,
      token1 TEXT NOT NULL, token1_symbol TEXT, token1_decimals INTEGER NOT NULL,
      fee INTEGER NOT NULL, tick_spacing INTEGER NOT NULL, transaction_hash TEXT NOT NULL,
      block_number INTEGER NOT NULL, discovered_at TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS bsc_uniswap_v3_token0_idx ON bsc_uniswap_v3_pools(token0);
    CREATE INDEX IF NOT EXISTS bsc_uniswap_v3_token1_idx ON bsc_uniswap_v3_pools(token1);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_uniswap_v3_prices (
      pool_address TEXT PRIMARY KEY, price REAL, inverse_price REAL, base_token TEXT NOT NULL,
      quote_token TEXT NOT NULL, sqrt_price_x96 TEXT NOT NULL, liquidity TEXT NOT NULL,
      tick INTEGER NOT NULL, updated_block INTEGER NOT NULL, updated_at TEXT NOT NULL
    );`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_uniswap_v4_pools (
      address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, chain TEXT NOT NULL, manager TEXT NOT NULL, pool_id TEXT NOT NULL,
      currency0 TEXT NOT NULL, currency0_symbol TEXT, currency0_decimals INTEGER NOT NULL,
      currency1 TEXT NOT NULL, currency1_symbol TEXT, currency1_decimals INTEGER NOT NULL,
      fee INTEGER NOT NULL, tick_spacing INTEGER NOT NULL, hooks TEXT NOT NULL, sqrt_price_x96 TEXT NOT NULL,
      tick INTEGER NOT NULL, transaction_hash TEXT NOT NULL, block_number INTEGER NOT NULL,
      discovered_at TEXT NOT NULL, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS bsc_uniswap_v4_currency0_idx ON bsc_uniswap_v4_pools(currency0);
    CREATE INDEX IF NOT EXISTS bsc_uniswap_v4_currency1_idx ON bsc_uniswap_v4_pools(currency1);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS bsc_uniswap_v4_prices (
      pool_id TEXT PRIMARY KEY, pool_address TEXT NOT NULL, price REAL, inverse_price REAL,
      base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL, sqrt_price_x96 TEXT NOT NULL,
      liquidity TEXT NOT NULL, tick INTEGER NOT NULL, fee INTEGER NOT NULL,
      updated_block INTEGER NOT NULL, updated_at TEXT NOT NULL
    );`);
    for (const column of ['base_logo_url', 'quote_logo_url']) {
      const exists = this.db.prepare('SELECT 1 FROM pragma_table_info(\'pools\') WHERE name = ?').get(column);
      if (!exists) this.db.exec(`ALTER TABLE pools ADD COLUMN ${column} TEXT`);
    }
    const poolTypeExists = this.db.prepare('SELECT 1 FROM pragma_table_info(\'pools\') WHERE name = \'pool_type\'').get();
    if (!poolTypeExists) this.db.exec("ALTER TABLE pools ADD COLUMN pool_type TEXT NOT NULL DEFAULT 'pumpswap_amm'");
    for (const [table, column] of [['meteora_damm_v2_pools', 'token_a_total_supply_raw'], ['meteora_damm_v2_pools', 'token_b_total_supply_raw'], ['meteora_dlmm_pools', 'token_x_total_supply_raw'], ['meteora_dlmm_pools', 'token_y_total_supply_raw']]) {
      const exists = this.db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
      if (!exists) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT '0'`);
    }
    for (const column of ['price_change', 'price_change_percent', 'price_change_direction']) {
      const exists = this.db.prepare('SELECT 1 FROM pragma_table_info(\'latest_prices\') WHERE name = ?').get(column);
      if (!exists) this.db.exec(`ALTER TABLE latest_prices ADD COLUMN ${column} ${column === 'price_change_direction' ? 'TEXT' : 'REAL'}`);
    }
    for (const column of ['fdv_usd', 'token_price_usd', 'total_supply', 'supply_basis']) {
      const exists = this.db.prepare('SELECT 1 FROM pragma_table_info(\'latest_prices\') WHERE name = ?').get(column);
      if (!exists) this.db.exec(`ALTER TABLE latest_prices ADD COLUMN ${column} ${column === 'supply_basis' ? 'TEXT' : 'REAL'}`);
    }
  }

  upsert(pool: PoolRecord): void {
    this.db.prepare(`INSERT INTO pools (address, pool_type, program_id, network, base_mint, base_symbol, base_logo_url, base_decimals,
      quote_mint, quote_symbol, quote_decimals, lp_mint, pool_base_token_account, pool_quote_token_account,
      quote_logo_url, creator, coin_creator, pool_index, updated_slot, discovered_at)
      VALUES (@address, @poolType, @programId, @network, @baseMint, @baseSymbol, @baseLogoUrl, @baseDecimals, @quoteMint, @quoteSymbol,
      @quoteDecimals, @lpMint, @poolBaseTokenAccount, @poolQuoteTokenAccount, @quoteLogoUrl, @creator,
      @coinCreator, @poolIndex, @updatedSlot, @discoveredAt)
      ON CONFLICT(address) DO UPDATE SET pool_type=excluded.pool_type, program_id=excluded.program_id, network=excluded.network,
      base_mint=excluded.base_mint, base_symbol=excluded.base_symbol, base_logo_url=excluded.base_logo_url, base_decimals=excluded.base_decimals,
      quote_mint=excluded.quote_mint, quote_symbol=excluded.quote_symbol, quote_decimals=excluded.quote_decimals,
      quote_logo_url=excluded.quote_logo_url,
      lp_mint=excluded.lp_mint, pool_base_token_account=excluded.pool_base_token_account,
      pool_quote_token_account=excluded.pool_quote_token_account, creator=excluded.creator,
      coin_creator=excluded.coin_creator, pool_index=excluded.pool_index, updated_slot=excluded.updated_slot,
      discovered_at=excluded.discovered_at, indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writePool(pool);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM pools').get() as { count: number }).count;
  }

  upsertPancakeSwapV2Pool(pool: import('./evm/bsc/pancakeswap-v2-types.js').PancakeSwapV2PoolRecord): void {
    this.db.prepare(`INSERT INTO bsc_pancakeswap_v2_pools (address, pool_type, chain, factory, token0, token0_symbol, token0_decimals,
      token1, token1_symbol, token1_decimals, pair_index, transaction_hash, block_number, discovered_at)
      VALUES (@address, @poolType, @chain, @factory, @token0, @token0Symbol, @token0Decimals, @token1, @token1Symbol,
      @token1Decimals, @pairIndex, @transactionHash, @blockNumber, @discoveredAt)
      ON CONFLICT(address) DO UPDATE SET token0_symbol=excluded.token0_symbol, token0_decimals=excluded.token0_decimals,
      token1_symbol=excluded.token1_symbol, token1_decimals=excluded.token1_decimals, indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writePancakeSwapV2(pool);
  }

  pancakeSwapV2Pools(): Array<import('./evm/bsc/pancakeswap-v2-types.js').PancakeSwapV2PoolRecord> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, chain, factory, token0, token0_symbol AS token0Symbol,
      token0_decimals AS token0Decimals, token1, token1_symbol AS token1Symbol, token1_decimals AS token1Decimals,
      pair_index AS pairIndex, transaction_hash AS transactionHash, block_number AS blockNumber, discovered_at AS discoveredAt
      FROM bsc_pancakeswap_v2_pools ORDER BY indexed_at DESC`).all() as Array<import('./evm/bsc/pancakeswap-v2-types.js').PancakeSwapV2PoolRecord>;
  }

  upsertPancakeSwapV3Pool(pool: import('./evm/bsc/pancakeswap-v3-types.js').PancakeSwapV3PoolRecord): void {
    this.db.prepare(`INSERT INTO bsc_pancakeswap_v3_pools (address, pool_type, chain, factory, token0, token0_symbol, token0_decimals,
      token1, token1_symbol, token1_decimals, fee, tick_spacing, transaction_hash, block_number, discovered_at)
      VALUES (@address, @poolType, @chain, @factory, @token0, @token0Symbol, @token0Decimals, @token1, @token1Symbol,
      @token1Decimals, @fee, @tickSpacing, @transactionHash, @blockNumber, @discoveredAt)
      ON CONFLICT(address) DO UPDATE SET token0_symbol=excluded.token0_symbol, token0_decimals=excluded.token0_decimals,
      token1_symbol=excluded.token1_symbol, token1_decimals=excluded.token1_decimals, fee=excluded.fee,
      tick_spacing=excluded.tick_spacing, indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writePancakeSwapV3(pool);
  }

  pancakeSwapV3Pools(): Array<import('./evm/bsc/pancakeswap-v3-types.js').PancakeSwapV3PoolRecord> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, chain, factory, token0, token0_symbol AS token0Symbol,
      token0_decimals AS token0Decimals, token1, token1_symbol AS token1Symbol, token1_decimals AS token1Decimals,
      fee, tick_spacing AS tickSpacing, transaction_hash AS transactionHash, block_number AS blockNumber, discovered_at AS discoveredAt
      FROM bsc_pancakeswap_v3_pools ORDER BY indexed_at DESC`).all() as Array<import('./evm/bsc/pancakeswap-v3-types.js').PancakeSwapV3PoolRecord>;
  }

  upsertPancakeSwapInfinityPool(pool: import('./evm/bsc/pancakeswap-infinity-types.js').PancakeSwapInfinityClPoolRecord): void {
    this.db.prepare(`INSERT INTO bsc_pancakeswap_infinity_cl_pools (address, pool_type, chain, manager, pool_id, currency0, currency0_symbol,
      currency0_decimals, currency1, currency1_symbol, currency1_decimals, hooks, fee, parameters, sqrt_price_x96, tick, transaction_hash, block_number, discovered_at)
      VALUES (@address, @poolType, @chain, @manager, @poolId, @currency0, @currency0Symbol, @currency0Decimals, @currency1, @currency1Symbol,
      @currency1Decimals, @hooks, @fee, @parameters, @sqrtPriceX96, @tick, @transactionHash, @blockNumber, @discoveredAt)
      ON CONFLICT(address) DO UPDATE SET sqrt_price_x96=excluded.sqrt_price_x96, tick=excluded.tick, fee=excluded.fee, indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writePancakeSwapInfinity(pool);
  }

  pancakeSwapInfinityPools(): Array<import('./evm/bsc/pancakeswap-infinity-types.js').PancakeSwapInfinityClPoolRecord> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, chain, manager, pool_id AS poolId, currency0, currency0_symbol AS currency0Symbol,
      currency0_decimals AS currency0Decimals, currency1, currency1_symbol AS currency1Symbol, currency1_decimals AS currency1Decimals,
      hooks, fee, parameters, sqrt_price_x96 AS sqrtPriceX96, tick, transaction_hash AS transactionHash, block_number AS blockNumber,
      discovered_at AS discoveredAt FROM bsc_pancakeswap_infinity_cl_pools ORDER BY indexed_at DESC`).all() as Array<import('./evm/bsc/pancakeswap-infinity-types.js').PancakeSwapInfinityClPoolRecord>;
  }

  upsertUniswapV3Pool(pool: import('./evm/bsc/uniswap-v3-types.js').UniswapV3PoolRecord): void {
    this.db.prepare(`INSERT INTO bsc_uniswap_v3_pools (address, pool_type, chain, factory, token0, token0_symbol, token0_decimals,
      token1, token1_symbol, token1_decimals, fee, tick_spacing, transaction_hash, block_number, discovered_at)
      VALUES (@address, @poolType, @chain, @factory, @token0, @token0Symbol, @token0Decimals, @token1, @token1Symbol,
      @token1Decimals, @fee, @tickSpacing, @transactionHash, @blockNumber, @discoveredAt)
      ON CONFLICT(address) DO UPDATE SET token0_symbol=excluded.token0_symbol, token1_symbol=excluded.token1_symbol,
      fee=excluded.fee, tick_spacing=excluded.tick_spacing, indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writeUniswapV3(pool);
  }

  uniswapV3Pools(): Array<import('./evm/bsc/uniswap-v3-types.js').UniswapV3PoolRecord> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, chain, factory, token0, token0_symbol AS token0Symbol,
      token0_decimals AS token0Decimals, token1, token1_symbol AS token1Symbol, token1_decimals AS token1Decimals,
      fee, tick_spacing AS tickSpacing, transaction_hash AS transactionHash, block_number AS blockNumber, discovered_at AS discoveredAt
      FROM bsc_uniswap_v3_pools ORDER BY indexed_at DESC`).all() as Array<import('./evm/bsc/uniswap-v3-types.js').UniswapV3PoolRecord>;
  }

  upsertUniswapV4Pool(pool: import('./evm/bsc/uniswap-v4-types.js').UniswapV4PoolRecord): void {
    this.db.prepare(`INSERT INTO bsc_uniswap_v4_pools (address, pool_type, chain, manager, pool_id, currency0, currency0_symbol, currency0_decimals, currency1, currency1_symbol, currency1_decimals, fee, tick_spacing, hooks, sqrt_price_x96, tick, transaction_hash, block_number, discovered_at)
      VALUES (@address, @poolType, @chain, @manager, @poolId, @currency0, @currency0Symbol, @currency0Decimals, @currency1, @currency1Symbol, @currency1Decimals, @fee, @tickSpacing, @hooks, @sqrtPriceX96, @tick, @transactionHash, @blockNumber, @discoveredAt)
      ON CONFLICT(address) DO UPDATE SET sqrt_price_x96=excluded.sqrt_price_x96, tick=excluded.tick, fee=excluded.fee, indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writeUniswapV4(pool);
  }

  uniswapV4Pools(): Array<import('./evm/bsc/uniswap-v4-types.js').UniswapV4PoolRecord> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, chain, manager, pool_id AS poolId, currency0, currency0_symbol AS currency0Symbol, currency0_decimals AS currency0Decimals, currency1, currency1_symbol AS currency1Symbol, currency1_decimals AS currency1Decimals, fee, tick_spacing AS tickSpacing, hooks, sqrt_price_x96 AS sqrtPriceX96, tick, transaction_hash AS transactionHash, block_number AS blockNumber, discovered_at AS discoveredAt FROM bsc_uniswap_v4_pools ORDER BY indexed_at DESC`).all() as Array<import('./evm/bsc/uniswap-v4-types.js').UniswapV4PoolRecord>;
  }

  upsertUniswapV4Price(price: import('./evm/bsc/uniswap-v4-price.js').UniswapV4Price): void {
    this.db.prepare(`INSERT INTO bsc_uniswap_v4_prices (pool_id, pool_address, price, inverse_price, base_currency, quote_currency, sqrt_price_x96, liquidity, tick, fee, updated_block, updated_at) VALUES (@poolId, @poolAddress, @price, @inversePrice, @baseCurrency, @quoteCurrency, @sqrtPriceX96, @liquidity, @tick, @fee, @updatedBlock, @updatedAt) ON CONFLICT(pool_id) DO UPDATE SET price=excluded.price, inverse_price=excluded.inverse_price, sqrt_price_x96=excluded.sqrt_price_x96, liquidity=excluded.liquidity, tick=excluded.tick, fee=excluded.fee, updated_block=excluded.updated_block, updated_at=excluded.updated_at`).run({ ...price, sqrtPriceX96: price.sqrtPriceX96.toString(), liquidity: price.liquidity.toString() });
    this.postgres?.writeUniswapV4Price(price);
  }

  upsertUniswapV3Price(price: import('./evm/bsc/uniswap-v3-price.js').UniswapV3Price): void {
    this.db.prepare(`INSERT INTO bsc_uniswap_v3_prices (pool_address, price, inverse_price, base_token, quote_token, sqrt_price_x96, liquidity, tick, updated_block, updated_at)
      VALUES (@poolAddress, @price, @inversePrice, @baseToken, @quoteToken, @sqrtPriceX96, @liquidity, @tick, @updatedBlock, @updatedAt)
      ON CONFLICT(pool_address) DO UPDATE SET price=excluded.price, inverse_price=excluded.inverse_price, base_token=excluded.base_token,
      quote_token=excluded.quote_token, sqrt_price_x96=excluded.sqrt_price_x96, liquidity=excluded.liquidity, tick=excluded.tick,
      updated_block=excluded.updated_block, updated_at=excluded.updated_at`).run({ ...price, sqrtPriceX96: price.sqrtPriceX96.toString(), liquidity: price.liquidity.toString() });
    this.postgres?.writeUniswapV3Price(price);
  }

  upsertPancakeSwapInfinityPrice(price: import('./evm/bsc/pancakeswap-infinity-price.js').PancakeSwapInfinityClPrice): void {
    this.db.prepare(`INSERT INTO bsc_pancakeswap_infinity_cl_prices (pool_id, pool_address, price, inverse_price, base_currency, quote_currency, sqrt_price_x96, liquidity, tick, fee, updated_block, updated_at)
      VALUES (@poolId, @poolAddress, @price, @inversePrice, @baseCurrency, @quoteCurrency, @sqrtPriceX96, @liquidity, @tick, @fee, @updatedBlock, @updatedAt)
      ON CONFLICT(pool_id) DO UPDATE SET pool_address=excluded.pool_address, price=excluded.price, inverse_price=excluded.inverse_price,
      base_currency=excluded.base_currency, quote_currency=excluded.quote_currency, sqrt_price_x96=excluded.sqrt_price_x96,
      liquidity=excluded.liquidity, tick=excluded.tick, fee=excluded.fee, updated_block=excluded.updated_block, updated_at=excluded.updated_at`).run({ ...price, sqrtPriceX96: price.sqrtPriceX96.toString(), liquidity: price.liquidity.toString() });
    this.postgres?.writePancakeSwapInfinityPrice(price);
  }

  upsertPancakeSwapV3Price(price: import('./evm/bsc/pancakeswap-v3-price.js').PancakeSwapV3Price): void {
    this.db.prepare(`INSERT INTO bsc_pancakeswap_v3_prices (pool_address, price, inverse_price, base_token, quote_token, sqrt_price_x96, liquidity, tick, updated_block, updated_at)
      VALUES (@poolAddress, @price, @inversePrice, @baseToken, @quoteToken, @sqrtPriceX96, @liquidity, @tick, @updatedBlock, @updatedAt)
      ON CONFLICT(pool_address) DO UPDATE SET price=excluded.price, inverse_price=excluded.inverse_price,
      base_token=excluded.base_token, quote_token=excluded.quote_token, sqrt_price_x96=excluded.sqrt_price_x96,
      liquidity=excluded.liquidity, tick=excluded.tick, updated_block=excluded.updated_block, updated_at=excluded.updated_at`).run({ ...price, sqrtPriceX96: price.sqrtPriceX96.toString(), liquidity: price.liquidity.toString() });
    this.postgres?.writePancakeSwapV3Price(price);
  }

  upsertPancakeSwapV2Price(price: import('./evm/bsc/pancakeswap-v2-price.js').PancakeSwapV2Price): void {
    this.postgres?.writePancakeSwapV2Price(price);
    this.db.prepare(`INSERT INTO bsc_pancakeswap_v2_prices (pool_address, reserve0, reserve1, price, inverse_price, base_token, quote_token, updated_block, updated_at)
      VALUES (@poolAddress, @reserve0, @reserve1, @price, @inversePrice, @baseToken, @quoteToken, @updatedBlock, @updatedAt)
      ON CONFLICT(pool_address) DO UPDATE SET reserve0=excluded.reserve0, reserve1=excluded.reserve1, price=excluded.price,
      inverse_price=excluded.inverse_price, base_token=excluded.base_token, quote_token=excluded.quote_token,
      updated_block=excluded.updated_block, updated_at=excluded.updated_at`).run({ ...price, reserve0: price.reserve0.toString(), reserve1: price.reserve1.toString() });
  }

  upsertRaydiumPool(pool: import('./raydium-types.js').RaydiumClmmPoolRecord): void {
    this.db.prepare(`INSERT INTO raydium_pools (address, pool_type, program_id, network, amm_config, owner,
      token_mint_0, token_mint_0_symbol, token_mint_0_decimals, token_mint_0_total_supply_raw, token_mint_0_logo_url, token_mint_1,
      token_mint_1_symbol, token_mint_1_decimals, token_mint_1_total_supply_raw, token_mint_1_logo_url, token_vault_0, token_vault_1,
      observation_key, tick_spacing, sqrt_price_x64, tick_current, updated_slot, discovered_at)
      VALUES (@address, @poolType, @programId, @network, @ammConfig, @owner, @tokenMint0, @tokenMint0Symbol,
      @tokenMint0Decimals, @tokenMint0TotalSupplyRaw, @tokenMint0LogoUrl, @tokenMint1, @tokenMint1Symbol, @tokenMint1Decimals,
      @tokenMint1TotalSupplyRaw, @tokenMint1LogoUrl, @tokenVault0, @tokenVault1, @observationKey, @tickSpacing, @sqrtPriceX64,
      @tickCurrent, @updatedSlot, @discoveredAt)
      ON CONFLICT(address) DO UPDATE SET updated_slot=excluded.updated_slot, indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writeRaydium(pool);
  }

  raydiumCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM raydium_pools').get() as { count: number }).count;
  }

  upsertOrcaWhirlpool(pool: import('./orca-types.js').OrcaWhirlpoolRecord): void {
    this.db.prepare(`INSERT INTO orca_whirlpools (address, pool_type, program_id, network, whirlpools_config,
      token_mint_a, token_mint_a_symbol, token_mint_a_decimals, token_mint_a_total_supply_raw, token_mint_a_logo_url,
      token_mint_b, token_mint_b_symbol, token_mint_b_decimals, token_mint_b_total_supply_raw, token_mint_b_logo_url,
      token_vault_a, token_vault_b, tick_spacing, fee_rate, protocol_fee_rate, liquidity, sqrt_price_x64,
      tick_current_index, updated_slot, discovered_at) VALUES (@address, @poolType, @programId, @network, @whirlpoolsConfig,
      @tokenMintA, @tokenMintASymbol, @tokenMintADecimals, @tokenMintATotalSupplyRaw, @tokenMintALogoUrl, @tokenMintB,
      @tokenMintBSymbol, @tokenMintBDecimals, @tokenMintBTotalSupplyRaw, @tokenMintBLogoUrl, @tokenVaultA, @tokenVaultB,
      @tickSpacing, @feeRate, @protocolFeeRate, @liquidity, @sqrtPriceX64, @tickCurrentIndex, @updatedSlot, @discoveredAt)
      ON CONFLICT(address) DO UPDATE SET updated_slot=excluded.updated_slot, indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writeOrca(pool);
  }

  orcaWhirlpoolCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM orca_whirlpools').get() as { count: number }).count;
  }

  hasOrcaWhirlpool(address: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM orca_whirlpools WHERE address = ?').get(address));
  }

  orcaWhirlpools(): Array<import('./orca-types.js').OrcaWhirlpoolRecord> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, program_id AS programId, network, whirlpools_config AS whirlpoolsConfig,
      token_mint_a AS tokenMintA, token_mint_a_symbol AS tokenMintASymbol, token_mint_a_decimals AS tokenMintADecimals,
      token_mint_a_total_supply_raw AS tokenMintATotalSupplyRaw, token_mint_a_logo_url AS tokenMintALogoUrl, token_mint_b AS tokenMintB,
      token_mint_b_symbol AS tokenMintBSymbol, token_mint_b_decimals AS tokenMintBDecimals, token_mint_b_total_supply_raw AS tokenMintBTotalSupplyRaw,
      token_mint_b_logo_url AS tokenMintBLogoUrl, token_vault_a AS tokenVaultA, token_vault_b AS tokenVaultB, tick_spacing AS tickSpacing,
      fee_rate AS feeRate, protocol_fee_rate AS protocolFeeRate, liquidity, sqrt_price_x64 AS sqrtPriceX64, tick_current_index AS tickCurrentIndex,
      updated_slot AS updatedSlot, discovered_at AS discoveredAt FROM orca_whirlpools ORDER BY indexed_at DESC`).all() as Array<import('./orca-types.js').OrcaWhirlpoolRecord>;
  }

  hasRaydiumPool(address: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM raydium_pools WHERE address = ?').get(address));
  }

  raydiumPools(): Array<import('./raydium-types.js').RaydiumClmmPoolRecord> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, program_id AS programId, network, amm_config AS ammConfig, owner,
      token_mint_0 AS tokenMint0, token_mint_0_symbol AS tokenMint0Symbol, token_mint_0_decimals AS tokenMint0Decimals, token_mint_0_total_supply_raw AS tokenMint0TotalSupplyRaw,
      token_mint_0_logo_url AS tokenMint0LogoUrl, token_mint_1 AS tokenMint1, token_mint_1_symbol AS tokenMint1Symbol,
      token_mint_1_decimals AS tokenMint1Decimals, token_mint_1_total_supply_raw AS tokenMint1TotalSupplyRaw, token_mint_1_logo_url AS tokenMint1LogoUrl, token_vault_0 AS tokenVault0,
      token_vault_1 AS tokenVault1, observation_key AS observationKey, tick_spacing AS tickSpacing, sqrt_price_x64 AS sqrtPriceX64,
      tick_current AS tickCurrent, updated_slot AS updatedSlot, discovered_at AS discoveredAt FROM raydium_pools ORDER BY indexed_at DESC`).all() as Array<import('./raydium-types.js').RaydiumClmmPoolRecord>;
  }

  upsertMeteoraPool(pool: import('./meteora-types.js').MeteoraDammV2PoolRecord): void {
    this.db.prepare(`INSERT INTO meteora_damm_v2_pools (address, pool_type, program_id, network, creator,
      token_a_mint, token_a_symbol, token_a_decimals, token_a_total_supply_raw, token_a_logo_url, token_b_mint, token_b_symbol,
      token_b_decimals, token_b_total_supply_raw, token_b_logo_url, token_a_vault, token_b_vault, token_a_amount, token_b_amount,
      sqrt_price, activation_point, pool_mode, updated_slot, discovered_at)
      VALUES (@address, @poolType, @programId, @network, @creator, @tokenAMint, @tokenASymbol, @tokenADecimals, @tokenATotalSupplyRaw,
      @tokenALogoUrl, @tokenBMint, @tokenBSymbol, @tokenBDecimals, @tokenBTotalSupplyRaw, @tokenBLogoUrl, @tokenAVault, @tokenBVault,
      @tokenAAmount, @tokenBAmount, @sqrtPrice, @activationPoint, @poolMode, @updatedSlot, @discoveredAt)
      ON CONFLICT(address) DO UPDATE SET token_a_amount=excluded.token_a_amount, token_b_amount=excluded.token_b_amount,
      sqrt_price=excluded.sqrt_price, activation_point=excluded.activation_point, updated_slot=excluded.updated_slot,
      indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writeMeteora(pool);
  }

  meteoraCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM meteora_damm_v2_pools').get() as { count: number }).count;
  }

  upsertDlmmPool(pool: import('./dlmm-types.js').MeteoraDlmmPoolRecord): void {
    this.db.prepare(`INSERT INTO meteora_dlmm_pools (address, pool_type, program_id, network, creator,
      token_x_mint, token_x_symbol, token_x_decimals, token_x_logo_url, token_y_mint, token_y_symbol,
      token_y_decimals, token_y_logo_url, reserve_x, reserve_y, oracle, active_id, bin_step, activation_point,
      updated_slot, discovered_at) VALUES (@address, @poolType, @programId, @network, @creator, @tokenXMint,
      @tokenXSymbol, @tokenXDecimals, @tokenXLogoUrl, @tokenYMint, @tokenYSymbol, @tokenYDecimals,
      @tokenYLogoUrl, @reserveX, @reserveY, @oracle, @activeId, @binStep, @activationPoint, @updatedSlot,
      @discoveredAt) ON CONFLICT(address) DO UPDATE SET active_id=excluded.active_id, bin_step=excluded.bin_step,
      activation_point=excluded.activation_point, updated_slot=excluded.updated_slot, indexed_at=CURRENT_TIMESTAMP`).run(pool);
    this.postgres?.writeDlmm(pool);
  }

  dlmmCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM meteora_dlmm_pools').get() as { count: number }).count;
  }

  dlmmPools(): Array<import('./dlmm-types.js').MeteoraDlmmPoolRecord> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, program_id AS programId, network, creator,
      token_x_mint AS tokenXMint, token_x_symbol AS tokenXSymbol, token_x_decimals AS tokenXDecimals, token_x_total_supply_raw AS tokenXTotalSupplyRaw,
      token_x_logo_url AS tokenXLogoUrl, token_y_mint AS tokenYMint, token_y_symbol AS tokenYSymbol,
      token_y_decimals AS tokenYDecimals, token_y_total_supply_raw AS tokenYTotalSupplyRaw, token_y_logo_url AS tokenYLogoUrl, reserve_x AS reserveX,
      reserve_y AS reserveY, oracle, active_id AS activeId, bin_step AS binStep, activation_point AS activationPoint,
      updated_slot AS updatedSlot, discovered_at AS discoveredAt FROM meteora_dlmm_pools ORDER BY indexed_at DESC`).all() as Array<import('./dlmm-types.js').MeteoraDlmmPoolRecord>;
  }

  hasDlmmPool(address: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM meteora_dlmm_pools WHERE address = ?').get(address));
  }

  hasMeteoraPool(address: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM meteora_damm_v2_pools WHERE address = ?').get(address));
  }

  updateMeteoraSupply(address: string, tokenAMint: string, tokenATotalSupplyRaw: string, tokenBMint: string, tokenBTotalSupplyRaw: string): void {
    this.db.prepare(`UPDATE meteora_damm_v2_pools SET token_a_total_supply_raw = CASE WHEN token_a_mint = @tokenAMint THEN @tokenATotalSupplyRaw ELSE token_a_total_supply_raw END,
      token_b_total_supply_raw = CASE WHEN token_b_mint = @tokenBMint THEN @tokenBTotalSupplyRaw ELSE token_b_total_supply_raw END WHERE address = @address`).run({ address, tokenAMint, tokenATotalSupplyRaw, tokenBMint, tokenBTotalSupplyRaw });
  }

  updateDlmmSupply(address: string, tokenXTotalSupplyRaw: string, tokenYTotalSupplyRaw: string): void {
    this.db.prepare('UPDATE meteora_dlmm_pools SET token_x_total_supply_raw = ?, token_y_total_supply_raw = ? WHERE address = ?').run(tokenXTotalSupplyRaw, tokenYTotalSupplyRaw, address);
  }

  meteoraPools(): Array<import('./meteora-types.js').MeteoraDammV2PoolRecord> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, program_id AS programId, network, creator,
      token_a_mint AS tokenAMint, token_a_symbol AS tokenASymbol, token_a_decimals AS tokenADecimals, token_a_total_supply_raw AS tokenATotalSupplyRaw,
      token_a_logo_url AS tokenALogoUrl, token_b_mint AS tokenBMint, token_b_symbol AS tokenBSymbol,
      token_b_decimals AS tokenBDecimals, token_b_total_supply_raw AS tokenBTotalSupplyRaw, token_b_logo_url AS tokenBLogoUrl, token_a_vault AS tokenAVault,
      token_b_vault AS tokenBVault, token_a_amount AS tokenAAmount, token_b_amount AS tokenBAmount,
      sqrt_price AS sqrtPrice, activation_point AS activationPoint, pool_mode AS poolMode,
      updated_slot AS updatedSlot, discovered_at AS discoveredAt FROM meteora_damm_v2_pools
      ORDER BY indexed_at DESC`).all() as Array<import('./meteora-types.js').MeteoraDammV2PoolRecord>;
  }

  recordPrice(price: import('./price-fetcher/types.js').PoolPrice, timestamp = Date.now()): void {
    if (price.price === null) return;
    this.postgres?.writePrice(price, timestamp);
    const now = new Date(timestamp).toISOString();
    this.db.prepare(`INSERT INTO latest_prices (pool_address, price, inverse_price, price_change, price_change_percent, price_change_direction, fdv_usd, token_price_usd, total_supply, supply_basis, base_reserve, quote_reserve, updated_slot, updated_at)
      VALUES (@poolAddress, @price, @inversePrice, @priceChange, @priceChangePercent, @priceChangeDirection, @fdvUsd, @tokenPriceUsd, @totalSupply, @supplyBasis, @baseReserve, @quoteReserve, @updatedSlot, @updatedAt)
      ON CONFLICT(pool_address) DO UPDATE SET price=excluded.price, inverse_price=excluded.inverse_price,
      price_change=excluded.price_change, price_change_percent=excluded.price_change_percent, price_change_direction=excluded.price_change_direction,
      fdv_usd=excluded.fdv_usd, token_price_usd=excluded.token_price_usd, total_supply=excluded.total_supply, supply_basis=excluded.supply_basis,
      base_reserve=excluded.base_reserve, quote_reserve=excluded.quote_reserve, updated_slot=excluded.updated_slot, updated_at=excluded.updated_at`).run({
      poolAddress: price.poolAddress, price: price.price, inversePrice: price.inversePrice,
      priceChange: price.priceChange, priceChangePercent: price.priceChangePercent, priceChangeDirection: price.priceChangeDirection,
      fdvUsd: price.fdvUsd, tokenPriceUsd: price.tokenPriceUsd, totalSupply: price.totalSupply, supplyBasis: price.supplyBasis,
      baseReserve: price.baseReserve.toString(), quoteReserve: price.quoteReserve.toString(),
      updatedSlot: price.updatedSlot, updatedAt: now,
    });
    const bucketStart = Math.floor(timestamp / 60_000) * 60_000;
    this.db.prepare(`INSERT INTO price_candles (pool_address, timeframe, bucket_start, open, high, low, close, updated_at)
      VALUES (@poolAddress, '1m', @bucketStart, @price, @price, @price, @price, @updatedAt)
      ON CONFLICT(pool_address, timeframe, bucket_start) DO UPDATE SET
      high=MAX(high, excluded.high), low=MIN(low, excluded.low), close=excluded.close, updated_at=excluded.updated_at`).run({
      poolAddress: price.poolAddress, bucketStart, price: price.price, updatedAt: now,
    });
  }

  twentyFourHourStats(poolAddress: string, timestamp = Date.now()): { high: number | null; low: number | null } {
    const row = this.db.prepare(`SELECT MAX(high) AS high, MIN(low) AS low FROM price_candles
      WHERE pool_address = ? AND timeframe = '1m' AND bucket_start >= ?`).get(poolAddress, timestamp - 24 * 60 * 60 * 1000) as { high?: number; low?: number };
    return { high: row.high ?? null, low: row.low ?? null };
  }

  latestPrices(): Array<{ pool_address: string; price: number; inverse_price: number | null; fdv_usd: number | null; price_change_percent: number | null; price_change_direction: string | null; updated_at: string }> {
    return this.db.prepare('SELECT pool_address, price, inverse_price, fdv_usd, price_change_percent, price_change_direction, updated_at FROM latest_prices ORDER BY updated_at DESC').all() as Array<{ pool_address: string; price: number; inverse_price: number | null; fdv_usd: number | null; price_change_percent: number | null; price_change_direction: string | null; updated_at: string }>;
  }

  latestPriceRecords(): Array<{ poolAddress: string; baseReserve: bigint; quoteReserve: bigint; updatedSlot: number }> {
    return (this.db.prepare('SELECT pool_address AS poolAddress, base_reserve AS baseReserve, quote_reserve AS quoteReserve, updated_slot AS updatedSlot FROM latest_prices').all() as Array<{ poolAddress: string; baseReserve: string; quoteReserve: string; updatedSlot: number }>).map((row) => ({
      poolAddress: row.poolAddress, baseReserve: BigInt(row.baseReserve), quoteReserve: BigInt(row.quoteReserve), updatedSlot: row.updatedSlot,
    }));
  }

  updateMetadata(address: string, baseSymbol: string | null, quoteSymbol: string | null, baseLogoUrl: string | null, quoteLogoUrl: string | null): void {
    this.db.prepare('UPDATE pools SET base_symbol = @baseSymbol, quote_symbol = @quoteSymbol, base_logo_url = @baseLogoUrl, quote_logo_url = @quoteLogoUrl WHERE address = @address')
      .run({ address, baseSymbol, quoteSymbol, baseLogoUrl, quoteLogoUrl });
  }

  pools(): Array<import('./price-fetcher/types.js').PoolForPricing> {
    return this.db.prepare(`SELECT address, pool_type AS poolType, base_mint AS baseMint, base_symbol AS baseSymbol, base_decimals AS baseDecimals,
      pool_base_token_account AS poolBaseTokenAccount, quote_mint AS quoteMint, quote_symbol AS quoteSymbol,
      quote_decimals AS quoteDecimals, pool_quote_token_account AS poolQuoteTokenAccount FROM pools`).all() as Array<import('./price-fetcher/types.js').PoolForPricing>;
  }

  async ready(): Promise<void> { await this.postgres?.ready(); }

  close(): void { this.postgres?.close(); this.db.close(); }
}