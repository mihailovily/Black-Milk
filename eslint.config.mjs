import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    '.next/**',
    '.pnpm-store/**',
    'out/**',
    'dist/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'blob-report/**',
    'next-env.d.ts',
  ]),
]);
