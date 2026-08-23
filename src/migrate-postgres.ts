import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const database = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
try {
  const schemaPath = path.resolve(process.env.POSTGRES_SCHEMA_PATH ?? 'schema.postgres.sql');
  await database.query(await fs.readFile(schemaPath, 'utf8'));
  console.log('PostgreSQL schema applied successfully.');
} finally {
  await database.end();
}
