import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GameState } from '../shared/types.js';
import type { PrismaClient } from '@prisma/client';
export interface Snapshot { state: GameState; tokens: Record<string, string> }
export interface Store { load(code: string): Promise<Snapshot | null>; save(snapshot: Snapshot): Promise<void>; close(): Promise<void> }
export class FileStore implements Store {
  private writes = new Map<string, Promise<void>>();
  constructor(private dir = process.env.SAVE_DIR || path.resolve('data')) {}
  private file(code: string) {
    if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error('Invalid room code');
    return path.join(this.dir, code + '.json');
  }
  async load(code: string): Promise<Snapshot | null> {
    await this.writes.get(code);
    try {
      const value = JSON.parse(await readFile(this.file(code), 'utf8')) as Snapshot;
      if (value.state.version !== 1 || value.state.code !== code || !value.tokens) throw new Error('Unsupported save format');
      return value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  save(snapshot: Snapshot): Promise<void> {
    const code = snapshot.state.code;
    const content = JSON.stringify(snapshot);
    const target = this.file(code);
    const next = (this.writes.get(code) || Promise.resolve()).catch(() => {}).then(async () => {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      const temporary = target + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, content, { mode: 0o600 });
      await rename(temporary, target);
    });
    this.writes.set(code, next);
    void next.finally(() => { if (this.writes.get(code) === next) this.writes.delete(code); }).catch(() => {});
    return next;
  }
  async close() { await Promise.all(this.writes.values()); }
}
export class PostgresStore implements Store {
  private writes = new Map<string, Promise<void>>();
  constructor(private db: PrismaClient) {}
  async load(code: string): Promise<Snapshot | null> {
    await this.writes.get(code);
    const row = await this.db.savedRoom.findUnique({ where: { code } });
    if (!row) return null;
    const snapshot = row.snapshot as unknown as Snapshot;
    if (snapshot.state.version !== 1 || snapshot.state.code !== code || !snapshot.tokens) throw new Error('Unsupported save format');
    return snapshot;
  }
  save(snapshot: Snapshot): Promise<void> {
    const code = snapshot.state.code;
    const data = JSON.parse(JSON.stringify(snapshot));
    const next = (this.writes.get(code) || Promise.resolve()).catch(() => {}).then(async () => {
      await this.db.savedRoom.upsert({ where: { code }, create: { code, snapshot: data }, update: { snapshot: data } });
    });
    this.writes.set(code, next);
    void next.finally(() => { if (this.writes.get(code) === next) this.writes.delete(code); }).catch(() => {});
    return next;
  }
  async close() { await Promise.all(this.writes.values()); await this.db.$disconnect(); }
}
export async function openStore(): Promise<Store> {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') throw new Error('Production requires DATABASE_URL');
    console.log('Persistence: local atomic files (development only)');
    return new FileStore();
  }
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([import('@prisma/client'), import('@prisma/adapter-pg')]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  await db.$connect();
  await db.savedRoom.count(); // Fail fast if migrations were not applied.
  console.log('Persistence: PostgreSQL');
  return new PostgresStore(db);
}
