import './env';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, closeDb } from '../src/server/db';
try {
  await migrate(getDb(), { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
} finally {
  await closeDb();
}
