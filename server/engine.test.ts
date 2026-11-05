import { describe, expect, it } from 'vitest';
import { Engine } from './engine.js';
import { newPlayer, newState } from './state.js';
import { ROOM_INFO, getRoom, type RoomId } from '../shared/catalog.js';
import { roomAt, walkable } from '../shared/navigation.js';
function setup() {
  const s = newState('ABCD23', 'normal');
  const p = newPlayer({ name: 'Инженер', role: 'engineer', avatar: 0 });
  s.players.push(p);
  s.hostId = p.id;
  s.phase = 'playing';
  return { s, p, e: new Engine(s) };
}
const advance = (e: Engine, seconds: number) => {
  for (let i = 0; i < seconds * 10; i++) e.tick(0.1);
};
function locate(p: { x: number; y: number }, id: RoomId) {
  const r = getRoom(id);
  p.x = r.x + r.w / 2;
  p.y = r.y + r.h / 2;
}
describe('authoritative bunker simulation', () => {
  it('does not move more than the server speed or walk through walls', () => {
    const { e, p } = setup();
    const start = p.x;
    e.command(p, { type: 'move', x: 1, y: 0 });
    e.tick(0.1);
    expect(p.x - start).toBeCloseTo(20);
    for (let n = 0; n < 40; n++) {
      e.command(p, { type: 'move', x: 1, y: 0 });
      e.tick(0.1);
    }
    expect(p.x).toBeLessThan(280);
    expect(roomAt(p)).toBe('command');
    const x = p.x;
    advance(e, 1);
    const stopped = p.x;
    advance(e, 2);
    expect(p.x).toBe(stopped);
    expect(p.x).toBeGreaterThanOrEqual(x);
  });
  it('routes a real character to all twelve rooms through doors and corridors', () => {
    const { e, p, s } = setup();
    s.rooms.greenhouse.built = true;
    for (const room of ROOM_INFO) {
      e.command(p, { type: 'travel', room: room.id as RoomId });
      for (let tick = 0; tick < 600 && p.path.length; tick++) {
        e.tick(0.1);
        expect(walkable(p)).toBe(true);
      }
      expect(roomAt(p), room.id).toBe(room.id);
      expect(p.path, room.id).toHaveLength(0);
    }
  });
  it('turns off ventilation and purification when fuel is exhausted', () => {
    const { e, s, p } = setup();
    s.resources.fuel = 0;
    const oxygen = s.oxygen;
    advance(e, 4);
    expect(s.power).toBe(false);
    expect(s.oxygen).toBeLessThan(oxygen);
    locate(p, 'water');
    expect(() => e.command(p, { type: 'act', action: 'purify', room: 'water' })).toThrow('питание');
  });
  it('validates proximity, consumes resources once and completes a repair challenge', () => {
    const { e, p, s } = setup();
    expect(() => e.command(p, { type: 'act', action: 'repair', room: 'generator' })).toThrow(
      'Подойдите',
    );
    locate(p, 'generator');
    const initial = s.rooms.generator.integrity,
      parts = s.resources.parts;
    const c = e.command(p, { type: 'act', action: 'repair', room: 'generator' })!;
    expect(s.resources.parts).toBe(parts);
    e.command(p, { type: 'challenge', id: c.id, answer: c.sequence });
    expect(s.resources.parts).toBe(parts - 5);
    expect(() => e.command(p, { type: 'challenge', id: c.id, answer: c.sequence })).toThrow(
      'устарела',
    );
    expect(() => e.command(p, { type: 'move', x: 1, y: 0 })).toThrow('завершите');
    advance(e, 9);
    expect(s.rooms.generator.integrity).toBeGreaterThan(initial + 35);
    expect(s.stats.repairs).toBe(1);
    expect(s.missionsDone).toContain('restore');
  });
  it('rejects incorrect and expired minigames without granting rewards', () => {
    const { e, p, s } = setup();
    locate(p, 'generator');
    const c = e.command(p, { type: 'act', action: 'repair', room: 'generator' })!;
    expect(() => e.command(p, { type: 'challenge', id: c.id, answer: [] })).toThrow('не совпал');
    expect(p.task).toBeNull();
    const d = e.command(p, { type: 'act', action: 'repair', room: 'generator' })!;
    advance(e, 26);
    expect(() => e.command(p, { type: 'challenge', id: d.id, answer: d.sequence })).toThrow(
      'устарела',
    );
    expect(s.stats.repairs).toBe(0);
  });
  it('heals a teammate in the medical room with the medic role bonus', () => {
    const { e, s, p } = setup();
    p.role = 'medic';
    locate(p, 'medical');
    const friend = newPlayer({ name: 'Друг', role: 'soldier', avatar: 1 });
    locate(friend, 'medical');
    friend.hp = 10;
    friend.infection = 50;
    s.players.push(friend);
    const c = e.command(p, { type: 'act', action: 'treat', room: 'medical' })!;
    e.command(p, { type: 'challenge', id: c.id, answer: c.sequence });
    advance(e, 9);
    expect(friend.hp).toBeGreaterThan(70);
    expect(friend.infection).toBeLessThan(15);
  });
  it('pauses time and consumption while everyone is offline', () => {
    const { e, p, s } = setup();
    p.connected = false;
    advance(e, 30);
    expect(s.elapsed).toBe(0);
    expect(s.resources.food).toBe(120);
  });
  it('executes attacks, starvation, inventory use and game over', () => {
    const { e, p, s } = setup();
    s.threat = 85;
    advance(e, 1);
    expect(s.stats.attacks).toBe(1);
    expect(s.rooms.airlock.integrity).toBeLessThan(78);
    p.hp = 25;
    e.command(p, { type: 'use', item: 'medkit' });
    expect(p.hp).toBe(60);
    expect(p.inventory.medkit).toBe(0);
    expect(() => e.command(p, { type: 'use', item: 'medkit' })).toThrow('Предмета нет');
    s.resources.water = 0;
    p.hp = 0.1;
    advance(e, 1);
    expect(s.phase).toBe('ended');
    expect(s.ending).toContain('замолчало');
  });
});
