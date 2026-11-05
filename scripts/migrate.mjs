import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
// Apply the checked-in Prisma SQL migrations without the experimental WASM migrate engine.
// One dedicated connection holds the advisory lock; every migration is transactional.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query('SELECT pg_advisory_lock(73491, 1)');
  await client.query('CREATE TABLE IF NOT EXISTS "_BunkerMigration" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const names = (await readdir(new URL('../prisma/migrations/', import.meta.url), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  for (const name of names) {
    const sql = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query('SELECT checksum FROM "_BunkerMigration" WHERE name = $1', [name]);
    if (existing.rows.length) {
      if (existing.rows[0].checksum !== checksum) throw new Error('Applied migration was modified: ' + name);
      console.log('Already applied:', name); continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO "_BunkerMigration" (name, checksum) VALUES ($1, $2)', [name, checksum]);
      await client.query('COMMIT'); console.log('Applied:', name);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { await client.end(); }
