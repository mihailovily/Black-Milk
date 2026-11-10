import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { getConfig } from '../config';

let pool: Pool | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function getDb() {
  if (!database) {
    pool = new Pool({
      connectionString: getConfig().databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000,
    });
    database = drizzle(pool, { schema });
  }
  return database;
}
export async function closeDb() {
  await pool?.end();
  pool = undefined;
  database = undefined;
}
