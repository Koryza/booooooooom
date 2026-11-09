import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compressClient } from './compress-client.mjs';

// Client builds are production builds even when the file-backed server uses development mode.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build();
const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
for (const item of await compressClient(root))
  console.log(
    `[compress] ${path.relative(root, item.file)}: ${item.raw} B → br ${item.br} B / gzip ${item.gzip} B`,
  );
