import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const password = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
await writeFile(
  '.env.local',
  `POSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://black_and_milk:${password}@127.0.0.1:5432/black_and_milk\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:3000\nSMTP_HOST=127.0.0.1\nSMTP_PORT=1025\nMAIL_FROM=Black&Milk <journal@blackmilk.test>\n`,
  { flag: 'wx', mode: 0o600 },
);
console.log(
  'Created .env.local with random local secrets. Existing files are never overwritten.',
);
