import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--workers=1',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: { ...process.env, COFFEE_E2E: '1' } },
);
child.on('exit', (code) => process.exit(code ?? 1));
