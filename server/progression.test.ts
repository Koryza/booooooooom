import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { newState, newPlayer } from './state.js';
import { Engine } from './engine.js';
import { getRoom, type RoomId } from '../shared/catalog.js';
import { EVENT_INFO } from '../shared/events.js';
import type { Player } from '../shared/types.js';
const advance = (e: Engine, seconds: number) => { for (let n = 0; n < seconds * 10; n++) e.tick(.1); };
function locate(p: Player, room: RoomId) { const r = getRoom(room); p.x = r.x + r.w / 2; p.y = r.y + r.h / 2; }
function setup(count = 1) {
  const s = newState('ABCD23', 'normal'); s.phase = 'playing'; s.nextEvent = 100000;
  s.players = Array.from({ length: count }, (_, i) => newPlayer({ name: 'Выживший ' + i, role: ['mechanic','scientist','scout'][i % 3], avatar: i }));
  s.hostId = s.players[0].id; return { s, e: new Engine(s), p: s.players[0] };
}
describe('progression and cooperative consequences', () => {
  it('crafts real equipment, applies the mechanic discount and prevents duplicate armor', () => {
    const { e, p, s } = setup(); locate(p, 'workshop'); const parts = s.resources.parts;
    e.command(p, { type: 'craft', recipe: 'armor' }); expect(s.resources.parts).toBe(parts - 9); advance(e, 11);
    expect(p.inventory.armor).toBe(1); expect(s.stats.crafted).toBe(1);
    expect(() => e.command(p, { type: 'craft', recipe: 'armor' })).toThrow('экипирован');
    e.command(p, { type: 'craft', recipe: 'ammo' }); const ammo = s.resources.ammo; advance(e, 11); expect(s.resources.ammo).toBe(ammo + 15);
  });
  it('enforces research dependencies, resource payment and a unique shared research job', () => {
    const { e, s, p } = setup(2); p.role = 'scientist'; locate(p, 'command');
    expect(() => e.command(p, { type: 'research', tech: 'hydroponics' })).toThrow('предыдущие');
    const electronics = s.resources.electronics;
    e.command(p, { type: 'research', tech: 'recycling' }); expect(s.resources.electronics).toBe(electronics - 6);
    expect(() => e.command(s.players[1], { type: 'research', tech: 'recycling' })).toThrow('уже выполняется');
    advance(e, 19); expect(s.research).toContain('recycling');
    expect(() => e.command(p, { type: 'research', tech: 'recycling' })).toThrow('уже изучена');
    e.command(p, { type: 'research', tech: 'hydroponics' }); advance(e, 19); expect(s.research).toContain('hydroponics');
  });
  it('builds a new usable room and upgrades equipment with a cap', () => {
    const { e, p, s } = setup(); locate(p, 'workshop');
    expect(() => e.command(p, { type: 'build' })).toThrow('Изучите'); s.research.push('hydroponics');
    e.command(p, { type: 'build' }); advance(e, 23); expect(s.rooms.greenhouse.built).toBe(true); expect(s.missionsDone).toContain('farm');
    e.command(p, { type: 'upgrade', room: 'generator' }); advance(e, 23); expect(s.rooms.generator.level).toBe(2);
    s.resources.parts = 100; e.command(p, { type: 'upgrade', room: 'generator' }); advance(e, 23); expect(s.rooms.generator.level).toBe(3);
    expect(() => e.command(p, { type: 'upgrade', room: 'generator' })).toThrow('уровня 3');
  });
  it('lets two survivors form a party and return with shared loot, wounds and experience', () => {
    const { e, s, p } = setup(2); const friend = s.players[1]; locate(p, 'airlock');
    e.command(p, { type: 'expedition', zone: 'factory', mode: 'quiet' }); const id = s.expeditions[0].id;
    expect(() => e.command(friend, { type: 'join-expedition', id })).toThrow('Подойдите'); locate(friend, 'airlock');
    e.command(friend, { type: 'join-expedition', id }); expect(s.expeditions[0].players).toHaveLength(2);
    expect(() => e.command(p, { type: 'move', x: 1, y: 0 })).toThrow('экспедиции');
    const parts = s.resources.parts; advance(e, 62);
    expect(s.stats.expeditions).toBe(1); expect(s.expeditions).toHaveLength(0); expect(p.expedition).toBeNull();
    expect(s.resources.parts).toBeGreaterThan(parts); expect(p.xp).toBeGreaterThan(0); expect(friend.xp).toBeGreaterThan(0);
    expect(s.story.length).toBe(1); // Scientist guarantees a shared archive.
  });
  it('only hands over personal items to a nearby teammate', () => {
    const { e, s, p } = setup(2); const friend = s.players[1];
    e.command(p, { type: 'give', item: 'medkit', amount: 1, playerId: friend.id }); expect(p.inventory.medkit).toBe(0); expect(friend.inventory.medkit).toBe(2);
    locate(friend, 'medical'); expect(() => e.command(p, { type: 'give', item: 'ration', amount: 1, playerId: friend.id })).toThrow('ближе');
  });
  it.each(EVENT_INFO)('resolves both outcomes of $type and never makes resources negative', event => {
    for (const choice of [0, 1]) {
      const { e, s, p } = setup(3);
      s.crisis = { ...structuredClone(event), id: randomUUID(), votes: {}, endsAt: 30 };
      e.command(p, { type: 'vote', choice }); expect(s.crisis).not.toBeNull();
      e.command(s.players[1], { type: 'vote', choice }); expect(s.crisis).toBeNull();
      expect(s.logs.at(-1)?.text).toContain('Последствия');
      expect(Object.values(s.resources).every(v => v >= 0 && Number.isFinite(v))).toBe(true);
    }
  });
  it('uses the documented first choice on a tied or empty vote deadline', () => {
    const { e, s } = setup(2); const event = EVENT_INFO.find(x => x.type === 'cache')!;
    s.crisis = { ...structuredClone(event), id: randomUUID(), votes: {}, endsAt: 2 }; const food = s.resources.food;
    advance(e, 3); expect(s.crisis).toBeNull(); expect(s.resources.food).toBeGreaterThan(food + 19);
  });
  it('handles unaffordable collective choices without inventing supplies', () => {
    const { e, s, p } = setup(); s.resources.parts = 0; const morale = s.morale;
    s.crisis = { ...structuredClone(EVENT_INFO[0]), id: randomUUID(), votes: {}, endsAt: 20 };
    e.command(p, { type: 'vote', choice: 0 }); expect(s.resources.parts).toBe(0); expect(s.morale).toBe(morale - 8);
  });
  it.each(['evacuation', 'autonomy', 'vaccine'] as const)('gates and completes the %s ending by team vote', ending => {
    const { e, s, p } = setup(2);
    expect(() => e.command(p, { type: 'ending', ending })).toThrow();
    s.day = 7; s.research = ['solar','recycling','hydroponics','fortification','radio','vaccine']; s.story = [0,1,2,3,4];
    s.rooms.greenhouse.built = true; s.rooms.generator.level = 2; s.rooms.medical.level = 2;
    e.command(p, { type: 'ending', ending }); e.command(p, { type: 'vote', choice: 1 }); expect(s.phase).toBe('playing');
    e.command(s.players[1], { type: 'vote', choice: 1 }); expect(s.phase).toBe('ended'); expect(s.ending).toBeTruthy();
  });
  it('survives a seeded six-player twenty-minute simulation without NaN or unlimited logs', () => {
    const { e, s } = setup(6); s.nextEvent = 1; s.seed = 42;
    for (let n = 0; n < 12000 && s.phase === 'playing'; n++) {
      e.tick(.1);
      if (n % 200 === 0) for (const key of Object.keys(s.resources)) s.resources[key as keyof typeof s.resources] = 100;
      if (n % 50 === 0 && s.crisis) for (const p of s.players.slice(0,4)) { if (s.crisis) e.command(p, { type: 'vote', choice: n % 2 }); }
    }
    expect(s.day).toBeGreaterThanOrEqual(7); expect(s.logs.length).toBeLessThanOrEqual(100);
    expect(Object.values(s.resources).every(Number.isFinite)).toBe(true); expect(s.oxygen).toBeGreaterThanOrEqual(0);
  });
});
