import 'dotenv/config';
import { PoolDatabase } from './db.js';
import { calculateSqrtPrice } from './price-fetcher/calculator.js';
import { orientPool } from './price-fetcher/orientation.js';
import { applyFdv } from './market-cap.js';

const database = new PoolDatabase(process.env.DATABASE_PATH ?? 'data/pumpswap.db');
try {
  const latest = new Map(database.latestPriceRecords().map((row) => [row.poolAddress, row]));
  let refreshed = 0;
  for (const pool of database.meteoraPools()) {
    const orientation = orientPool({
      address: pool.address, poolType: pool.poolType, baseMint: pool.tokenAMint, baseSymbol: pool.tokenASymbol,
      baseDecimals: pool.tokenADecimals, poolBaseTokenAccount: pool.tokenAVault, quoteMint: pool.tokenBMint,
      quoteSymbol: pool.tokenBSymbol, quoteDecimals: pool.tokenBDecimals, poolQuoteTokenAccount: pool.tokenBVault,
    });
    const row = latest.get(pool.address);
    if (!orientation || !row) continue;
    const price = calculateSqrtPrice(orientation, BigInt(pool.sqrtPrice), row.baseReserve, row.quoteReserve, row.updatedSlot, pool.address);
    const marketBaseSupply = pool.tokenAMint === orientation.baseMint ? pool.tokenATotalSupplyRaw : pool.tokenBTotalSupplyRaw;
    const marketBaseDecimals = pool.tokenAMint === orientation.baseMint ? pool.tokenADecimals : pool.tokenBDecimals;
    database.recordPrice(applyFdv(price, BigInt(marketBaseSupply), marketBaseDecimals, process.env.SOL_PRICE_USD ? Number(process.env.SOL_PRICE_USD) : null));
    refreshed += 1;
  }
  console.log(`Refreshed ${refreshed} stored Meteora prices from sqrt_price.`);
} finally {
  database.close();
}