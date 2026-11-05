import { spawnSync } from 'node:child_process';
// Schema parsing needs a URL even though code generation never opens a connection.
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://unused:unused@localhost:5432/bunker',
  },
});
process.exit(result.status ?? 1);
