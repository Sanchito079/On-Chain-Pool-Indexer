PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS pools (
  address TEXT PRIMARY KEY,
  pool_type TEXT NOT NULL,
  program_id TEXT NOT NULL,
  network TEXT NOT NULL,
  base_mint TEXT NOT NULL,
  base_symbol TEXT,
  base_decimals INTEGER NOT NULL,
  base_logo_url TEXT,
  quote_mint TEXT NOT NULL,
  quote_symbol TEXT,
  quote_decimals INTEGER NOT NULL,
  quote_logo_url TEXT,
  lp_mint TEXT NOT NULL,
  pool_base_token_account TEXT NOT NULL,
  pool_quote_token_account TEXT NOT NULL,
  creator TEXT NOT NULL,
  coin_creator TEXT NOT NULL,
  pool_index INTEGER NOT NULL,
  updated_slot INTEGER NOT NULL,
  discovered_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pools_base_mint_idx ON pools(base_mint);
CREATE INDEX IF NOT EXISTS pools_quote_mint_idx ON pools(quote_mint);
CREATE INDEX IF NOT EXISTS pools_updated_slot_idx ON pools(updated_slot);

CREATE TABLE IF NOT EXISTS latest_prices (
  pool_address TEXT PRIMARY KEY,
  price REAL,
  inverse_price REAL,
  price_change REAL,
  price_change_percent REAL,
  price_change_direction TEXT,
  fdv_usd REAL,
  token_price_usd REAL,
  total_supply REAL,
  supply_basis TEXT,
  base_reserve TEXT NOT NULL,
  quote_reserve TEXT NOT NULL,
  updated_slot INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_candles (
  pool_address TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (pool_address, timeframe, bucket_start)
);
CREATE INDEX IF NOT EXISTS price_candles_lookup_idx ON price_candles(pool_address, timeframe, bucket_start);

CREATE TABLE IF NOT EXISTS raydium_pools (
  address TEXT PRIMARY KEY,
  pool_type TEXT NOT NULL,
  program_id TEXT NOT NULL,
  network TEXT NOT NULL,
  amm_config TEXT NOT NULL,
  owner TEXT NOT NULL,
  token_mint_0 TEXT NOT NULL,
  token_mint_0_symbol TEXT,
  token_mint_0_decimals INTEGER NOT NULL,
  token_mint_0_total_supply_raw TEXT NOT NULL DEFAULT '0',
  token_mint_0_logo_url TEXT,
  token_mint_1 TEXT NOT NULL,
  token_mint_1_symbol TEXT,
  token_mint_1_decimals INTEGER NOT NULL,
  token_mint_1_total_supply_raw TEXT NOT NULL DEFAULT '0',
  token_mint_1_logo_url TEXT,
  token_vault_0 TEXT NOT NULL,
  token_vault_1 TEXT NOT NULL,
  observation_key TEXT NOT NULL,
  tick_spacing INTEGER NOT NULL,
  sqrt_price_x64 TEXT NOT NULL,
  tick_current INTEGER NOT NULL,
  updated_slot INTEGER NOT NULL,
  discovered_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS raydium_pools_mint_0_idx ON raydium_pools(token_mint_0);
CREATE INDEX IF NOT EXISTS raydium_pools_mint_1_idx ON raydium_pools(token_mint_1);

CREATE TABLE IF NOT EXISTS orca_whirlpools (
  address TEXT PRIMARY KEY,
  pool_type TEXT NOT NULL,
  program_id TEXT NOT NULL,
  network TEXT NOT NULL,
  whirlpools_config TEXT NOT NULL,
  token_mint_a TEXT NOT NULL,
  token_mint_a_symbol TEXT,
  token_mint_a_decimals INTEGER NOT NULL,
  token_mint_a_total_supply_raw TEXT NOT NULL DEFAULT '0',
  token_mint_a_logo_url TEXT,
  token_mint_b TEXT NOT NULL,
  token_mint_b_symbol TEXT,
  token_mint_b_decimals INTEGER NOT NULL,
  token_mint_b_total_supply_raw TEXT NOT NULL DEFAULT '0',
  token_mint_b_logo_url TEXT,
  token_vault_a TEXT NOT NULL,
  token_vault_b TEXT NOT NULL,
  tick_spacing INTEGER NOT NULL,
  fee_rate INTEGER NOT NULL,
  protocol_fee_rate INTEGER NOT NULL,
  liquidity TEXT NOT NULL,
  sqrt_price_x64 TEXT NOT NULL,
  tick_current_index INTEGER NOT NULL,
  updated_slot INTEGER NOT NULL,
  discovered_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS orca_whirlpools_mint_a_idx ON orca_whirlpools(token_mint_a);
CREATE INDEX IF NOT EXISTS orca_whirlpools_mint_b_idx ON orca_whirlpools(token_mint_b);

CREATE TABLE IF NOT EXISTS meteora_damm_v2_pools (
  address TEXT PRIMARY KEY,
  pool_type TEXT NOT NULL,
  program_id TEXT NOT NULL,
  network TEXT NOT NULL,
  creator TEXT NOT NULL,
  token_a_mint TEXT NOT NULL,
  token_a_symbol TEXT,
  token_a_decimals INTEGER NOT NULL,
  token_a_total_supply_raw TEXT NOT NULL DEFAULT '0',
  token_a_logo_url TEXT,
  token_b_mint TEXT NOT NULL,
  token_b_symbol TEXT,
  token_b_decimals INTEGER NOT NULL,
  token_b_total_supply_raw TEXT NOT NULL DEFAULT '0',
  token_b_logo_url TEXT,
  token_a_vault TEXT NOT NULL,
  token_b_vault TEXT NOT NULL,
  token_a_amount TEXT NOT NULL,
  token_b_amount TEXT NOT NULL,
  sqrt_price TEXT NOT NULL,
  activation_point TEXT NOT NULL,
  pool_mode INTEGER NOT NULL,
  updated_slot INTEGER NOT NULL,
  discovered_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS meteora_damm_v2_mint_a_idx ON meteora_damm_v2_pools(token_a_mint);
CREATE INDEX IF NOT EXISTS meteora_damm_v2_mint_b_idx ON meteora_damm_v2_pools(token_b_mint);

CREATE TABLE IF NOT EXISTS meteora_dlmm_pools (
  address TEXT PRIMARY KEY,
  pool_type TEXT NOT NULL,
  program_id TEXT NOT NULL,
  network TEXT NOT NULL,
  creator TEXT NOT NULL,
  token_x_mint TEXT NOT NULL,
  token_x_symbol TEXT,
  token_x_decimals INTEGER NOT NULL,
  token_x_total_supply_raw TEXT NOT NULL DEFAULT '0',
  token_x_logo_url TEXT,
  token_y_mint TEXT NOT NULL,
  token_y_symbol TEXT,
  token_y_decimals INTEGER NOT NULL,
  token_y_total_supply_raw TEXT NOT NULL DEFAULT '0',
  token_y_logo_url TEXT,
  reserve_x TEXT NOT NULL,
  reserve_y TEXT NOT NULL,
  oracle TEXT NOT NULL,
  active_id INTEGER NOT NULL,
  bin_step INTEGER NOT NULL,
  activation_point TEXT NOT NULL,
  updated_slot INTEGER NOT NULL,
  discovered_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS meteora_dlmm_mint_x_idx ON meteora_dlmm_pools(token_x_mint);
CREATE INDEX IF NOT EXISTS meteora_dlmm_mint_y_idx ON meteora_dlmm_pools(token_y_mint);
