import { describe, it, expect } from 'vitest';
import { openStore } from './store.js';
import { newPlayer, newState } from './state.js';
describe.skipIf(!process.env.DATABASE_URL)('real Prisma + PostgreSQL persistence', () => {
  it('writes, overwrites and reloads a JSONB room snapshot', async () => {
    const store = await openStore(); const state = newState('PGTEST', 'normal');
    state.players.push(newPlayer({ name: 'Postgres', role: 'engineer', avatar: 0 }));
    const tokens = { [state.players[0].id]: 'only-a-hash' };
    try {
      await store.save({ state, tokens }); state.resources.parts = 27;
      await store.save({ state, tokens }); const restored = await store.load('PGTEST');
      expect(restored?.state.resources.parts).toBe(27); expect(restored?.state.players[0].name).toBe('Postgres');
      expect(restored?.tokens).toEqual(tokens);
    } finally { await store.close(); }
  });
});
