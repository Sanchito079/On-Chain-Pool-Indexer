import 'dotenv/config';
import { PoolDatabase } from './db.js';

const databasePath = process.env.DATABASE_PATH ?? 'data/pumpswap.db';
const database = new PoolDatabase(databasePath);

try {
  const pools = database.pools();
  console.table(pools.map(({ address, poolType, baseMint, baseSymbol, baseDecimals, quoteMint, quoteSymbol, quoteDecimals, poolBaseTokenAccount, poolQuoteTokenAccount }) => ({ address, poolType, baseMint, baseSymbol, baseDecimals, quoteMint, quoteSymbol, quoteDecimals, poolBaseTokenAccount, poolQuoteTokenAccount })));
  console.log(`Total pools: ${pools.length}`);
  console.log(`Raydium CLMM pools: ${database.raydiumCount()}`);
  console.log(`Meteora DAMM v2 pools: ${database.meteoraCount()}`);
  console.log(`Meteora DLMM pools: ${database.dlmmCount()}`);
  console.log(`Orca Whirlpool pools: ${database.orcaWhirlpoolCount()}`);
  console.table(database.meteoraPools().map(({ address, poolType, tokenAMint, tokenASymbol, tokenADecimals, tokenBMint, tokenBSymbol, tokenBDecimals, tokenAVault, tokenBVault, tokenAAmount, tokenBAmount, poolMode, updatedSlot }) => ({ address, poolType, tokenAMint, tokenASymbol, tokenADecimals, tokenBMint, tokenBSymbol, tokenBDecimals, tokenAVault, tokenBVault, tokenAAmount, tokenBAmount, poolMode, updatedSlot })));
  console.table(database.latestPrices());
} finally {
  database.close();
}