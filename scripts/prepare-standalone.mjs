import { cp } from 'node:fs/promises';

// Next.js traces server dependencies; static assets are copied explicitly.
await Promise.all(
  [
    ['../public/', '../.next/standalone/public/'],
    ['../.next/static/', '../.next/standalone/.next/static/'],
  ].map(([source, destination]) =>
    cp(
      new URL(source, import.meta.url),
      new URL(destination, import.meta.url),
      {
        recursive: true,
      },
    ),
  ),
);
