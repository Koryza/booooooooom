import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
// Prisma's JS/WASM schema engine and official pg adapter avoid platform-specific binaries.
// The adapter is instantiated by database commands, not by `prisma generate`.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  experimental: { adapter: true },
  engine: 'js',
  adapter: async () => {
    if (!process.env.DATABASE_URL)
      throw new Error('DATABASE_URL is required for database commands');
    return new PrismaPg({ connectionString: process.env.DATABASE_URL });
  },
});
