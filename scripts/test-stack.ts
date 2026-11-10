import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { startTestDatabase } from '../tests/support/database';
import { startMailbox } from '../tests/support/mailbox';
import {
  ADMIN_EMAIL,
  MEMBER_EMAIL,
  TEST_PASSWORD,
} from '../tests/support/constants';

const database = await startTestDatabase();
const mailbox = await startMailbox(3102, 3101, async () => {
  await database.pool.query('TRUNCATE rate_limits, request_limits');
});
const password = await hashPassword(TEST_PASSWORD);
for (const [email, name, role] of [
  [ADMIN_EMAIL, 'Administrator', 'admin'],
  [MEMBER_EMAIL, 'Member', 'user'],
]) {
  const id = randomUUID();
  await database.pool.query(
    'INSERT INTO users (id,name,email,email_verified,role) VALUES ($1,$2,$3,true,$4)',
    [id, name, email, role],
  );
  await database.pool.query(
    "INSERT INTO accounts (id,user_id,account_id,provider_id,password) VALUES ($1,$2,$2,'credential',$3)",
    [randomUUID(), id, password],
  );
}
const child = spawn(process.execPath, ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: database.url,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: 'http://127.0.0.1:3100',
    HOSTNAME: '127.0.0.1',
    PORT: '3100',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '3102',
    MAIL_FROM: 'Black Milk <journal@blackmilk.test>',
  },
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill();
  await mailbox.stop();
  await database.stop();
}
process.on('SIGINT', () => void stop().finally(() => process.exit(0)));
process.on('SIGTERM', () => void stop().finally(() => process.exit(0)));
child.on('exit', (code) => void stop().finally(() => process.exit(code || 0)));
