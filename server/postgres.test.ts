import { describe, it, expect } from 'vitest';
import { openStore } from './store.js';
import { newPlayer, newState } from './state.js';
import { Engine } from './engine.js';
describe.skipIf(!process.env.DATABASE_URL)('Prisma + PostgreSQL card-game snapshots', () => {
  it('stores random private hands and restores the same deal', async () => {
    const store = await openStore(),
      state = newState('PGCARD');
    state.players = ['Первый', 'Второй'].map((name) => newPlayer({ name }));
    state.hostId = state.players[0].id;
    state.players.forEach((p) => (p.ready = true));
    const e = new Engine(state);
    e.start(state.players[0]);
    const tokens = { [state.hostId]: 'only-a-hash' };
    try {
      await store.save({ state, tokens });
      const restored = await store.load('PGCARD');
      expect(restored?.state.version).toBe(2);
      expect(restored?.state.players[0].sheet).toEqual(state.players[0].sheet);
      expect(restored?.tokens).toEqual(tokens);
    } finally {
      await store.close();
    }
  });
});
