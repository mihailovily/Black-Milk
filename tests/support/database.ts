import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

export async function startTestDatabase() {
  let cluster: EmbeddedPostgres | undefined;
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const password = randomBytes(24).toString('hex');
    const directory = resolve(
      '.local',
      'test-pg-' + randomBytes(6).toString('hex'),
    );
    await mkdir(directory, { recursive: true });
    cluster = new EmbeddedPostgres({
      databaseDir: directory,
      port: 55432,
      user: 'postgres',
      password,
      persistent: false,
      authMethod: 'scram-sha-256',
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => {},
      onError: () => {},
    });
    await cluster.initialise();
    await cluster.start();
    await cluster.createDatabase('black_milk_tests');
    url = `postgresql://postgres:${password}@127.0.0.1:55432/black_milk_tests`;
  }
  const pool = new Pool({ connectionString: url });
  // The caller must supply a disposable database, never a developer or production URL.
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_tests'))
    throw new Error(
      'TEST_DATABASE_URL must refer to a disposable database ending in _tests',
    );
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  return {
    url,
    pool,
    stop: async () => {
      await pool.end();
      await cluster?.stop();
    },
  };
}
