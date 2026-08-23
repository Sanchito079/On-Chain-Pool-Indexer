BEGIN;

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
  updated_slot BIGINT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pools_base_mint_idx ON pools(base_mint);
CREATE INDEX IF NOT EXISTS pools_quote_mint_idx ON pools(quote_mint);
CREATE INDEX IF NOT EXISTS pools_updated_slot_idx ON pools(updated_slot);

CREATE TABLE IF NOT EXISTS latest_prices (
  pool_address TEXT PRIMARY KEY,
  price DOUBLE PRECISION,
  inverse_price DOUBLE PRECISION,
  price_change DOUBLE PRECISION,
  price_change_percent DOUBLE PRECISION,
  price_change_direction TEXT,
  fdv_usd DOUBLE PRECISION,
  token_price_usd DOUBLE PRECISION,
  total_supply DOUBLE PRECISION,
  supply_basis TEXT,
  base_reserve NUMERIC NOT NULL,
  quote_reserve NUMERIC NOT NULL,
  updated_slot BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS price_candles (
  pool_address TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  bucket_start BIGINT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL,
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
  token_mint_0_total_supply_raw NUMERIC NOT NULL DEFAULT 0,
  token_mint_0_logo_url TEXT,
  token_mint_1 TEXT NOT NULL,
  token_mint_1_symbol TEXT,
  token_mint_1_decimals INTEGER NOT NULL,
  token_mint_1_total_supply_raw NUMERIC NOT NULL DEFAULT 0,
  token_mint_1_logo_url TEXT,
  token_vault_0 TEXT NOT NULL,
  token_vault_1 TEXT NOT NULL,
  observation_key TEXT NOT NULL,
  tick_spacing INTEGER NOT NULL,
  sqrt_price_x64 NUMERIC NOT NULL,
  tick_current INTEGER NOT NULL,
  updated_slot BIGINT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  token_mint_a_total_supply_raw NUMERIC NOT NULL DEFAULT 0,
  token_mint_a_logo_url TEXT,
  token_mint_b TEXT NOT NULL,
  token_mint_b_symbol TEXT,
  token_mint_b_decimals INTEGER NOT NULL,
  token_mint_b_total_supply_raw NUMERIC NOT NULL DEFAULT 0,
  token_mint_b_logo_url TEXT,
  token_vault_a TEXT NOT NULL,
  token_vault_b TEXT NOT NULL,
  tick_spacing INTEGER NOT NULL,
  fee_rate INTEGER NOT NULL,
  protocol_fee_rate INTEGER NOT NULL,
  liquidity NUMERIC NOT NULL,
  sqrt_price_x64 NUMERIC NOT NULL,
  tick_current_index INTEGER NOT NULL,
  updated_slot BIGINT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  token_a_total_supply_raw NUMERIC NOT NULL DEFAULT 0,
  token_a_logo_url TEXT,
  token_b_mint TEXT NOT NULL,
  token_b_symbol TEXT,
  token_b_decimals INTEGER NOT NULL,
  token_b_total_supply_raw NUMERIC NOT NULL DEFAULT 0,
  token_b_logo_url TEXT,
  token_a_vault TEXT NOT NULL,
  token_b_vault TEXT NOT NULL,
  token_a_amount NUMERIC NOT NULL,
  token_b_amount NUMERIC NOT NULL,
  sqrt_price NUMERIC NOT NULL,
  activation_point NUMERIC NOT NULL,
  pool_mode INTEGER NOT NULL,
  updated_slot BIGINT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  token_x_total_supply_raw NUMERIC NOT NULL DEFAULT 0,
  token_x_logo_url TEXT,
  token_y_mint TEXT NOT NULL,
  token_y_symbol TEXT,
  token_y_decimals INTEGER NOT NULL,
  token_y_total_supply_raw NUMERIC NOT NULL DEFAULT 0,
  token_y_logo_url TEXT,
  reserve_x TEXT NOT NULL,
  reserve_y TEXT NOT NULL,
  oracle TEXT NOT NULL,
  active_id INTEGER NOT NULL,
  bin_step INTEGER NOT NULL,
  activation_point NUMERIC NOT NULL,
  updated_slot BIGINT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS meteora_dlmm_mint_x_idx ON meteora_dlmm_pools(token_x_mint);
CREATE INDEX IF NOT EXISTS meteora_dlmm_mint_y_idx ON meteora_dlmm_pools(token_y_mint);

CREATE TABLE IF NOT EXISTS bsc_pancakeswap_v2_pools (
  address TEXT PRIMARY KEY,
  pool_type TEXT NOT NULL,
  chain TEXT NOT NULL,
  factory TEXT NOT NULL,
  token0 TEXT NOT NULL,
  token0_symbol TEXT,
  token0_decimals INTEGER NOT NULL,
  token1 TEXT NOT NULL,
  token1_symbol TEXT,
  token1_decimals INTEGER NOT NULL,
  pair_index NUMERIC NOT NULL,
  transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS bsc_pancakeswap_v2_token0_idx ON bsc_pancakeswap_v2_pools(token0);
CREATE INDEX IF NOT EXISTS bsc_pancakeswap_v2_token1_idx ON bsc_pancakeswap_v2_pools(token1);

CREATE TABLE IF NOT EXISTS bsc_pancakeswap_v3_pools (
  address TEXT PRIMARY KEY, pool_type TEXT NOT NULL, chain TEXT NOT NULL, factory TEXT NOT NULL,
  token0 TEXT NOT NULL, token0_symbol TEXT, token0_decimals INTEGER NOT NULL,
  token1 TEXT NOT NULL, token1_symbol TEXT, token1_decimals INTEGER NOT NULL,
  fee INTEGER NOT NULL, tick_spacing INTEGER NOT NULL, transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL, discovered_at TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS bsc_pancakeswap_v3_token0_idx ON bsc_pancakeswap_v3_pools(token0);
CREATE INDEX IF NOT EXISTS bsc_pancakeswap_v3_token1_idx ON bsc_pancakeswap_v3_pools(token1);

CREATE TABLE IF NOT EXISTS bsc_pancakeswap_v3_prices (
  pool_address TEXT PRIMARY KEY,
  price DOUBLE PRECISION,
  inverse_price DOUBLE PRECISION,
  base_token TEXT NOT NULL,
  quote_token TEXT NOT NULL,
  sqrt_price_x96 NUMERIC NOT NULL,
  liquidity NUMERIC NOT NULL,
  tick INTEGER NOT NULL,
  updated_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS bsc_pancakeswap_v2_prices (
  pool_address TEXT PRIMARY KEY,
  reserve0 NUMERIC NOT NULL,
  reserve1 NUMERIC NOT NULL,
  price DOUBLE PRECISION,
  inverse_price DOUBLE PRECISION,
  base_token TEXT NOT NULL,
  quote_token TEXT NOT NULL,
  updated_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

COMMIT;
