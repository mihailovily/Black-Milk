import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
for (const file of ['.env.local', '.env'])
  if (existsSync(file)) loadEnvFile(file);
