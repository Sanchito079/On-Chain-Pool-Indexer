import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { PoolDatabase } from './db.js';

const db = new PoolDatabase(process.env.DATABASE_PATH ?? 'data/pumpswap.db');
const connection = new Connection((process.env.SOLANA_HTTP_RPC_URLS ?? '').split(',')[0], 'confirmed');
try {
  for (const pool of db.meteoraPools()) {
    const accounts = await connection.getMultipleAccountsInfo([new PublicKey(pool.tokenAMint), new PublicKey(pool.tokenBMint)]);
    db.updateMeteoraSupply(pool.address, pool.tokenAMint, accounts[0]?.data.readBigUInt64LE(36).toString() ?? '0', pool.tokenBMint, accounts[1]?.data.readBigUInt64LE(36).toString() ?? '0');
  }
  for (const pool of db.dlmmPools()) {
    const accounts = await connection.getMultipleAccountsInfo([new PublicKey(pool.tokenXMint), new PublicKey(pool.tokenYMint)]);
    db.updateDlmmSupply(pool.address, accounts[0]?.data.readBigUInt64LE(36).toString() ?? '0', accounts[1]?.data.readBigUInt64LE(36).toString() ?? '0');
  }
  console.log('Refreshed Meteora DAMM v2 and DLMM total supplies.');
} finally { db.close(); }