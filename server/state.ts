import { randomBytes, randomUUID } from 'node:crypto';
import { ROOM_INFO } from '../shared/catalog.js';
import type { GameState, Player } from '../shared/types.js';
import type { Difficulty } from '../shared/validation.js';
import { profileSchema } from '../shared/validation.js';
export function newState(code: string, difficulty: Difficulty): GameState {
  return {
    version: 1,
    code,
    difficulty,
    hostId: '',
    phase: 'lobby',
    players: [],
    resources: {
      food: 120,
      water: 140,
      fuel: 90,
      parts: 80,
      medicine: 18,
      ammo: 45,
      electronics: 24,
      seeds: 12,
    },
    rooms: Object.fromEntries(
      ROOM_INFO.map((r) => [
        r.id,
        { integrity: r.id === 'generator' ? 58 : 78, level: 1, built: r.id !== 'greenhouse' },
      ]),
    ) as GameState['rooms'],
    elapsed: 0,
    day: 1,
    hour: 7,
    power: true,
    oxygen: 92,
    morale: 75,
    threat: 14,
    research: [],
    story: [],
    achievements: [],
    logs: [],
    chat: [],
    crisis: null,
    expeditions: [],
    weather: 'clear',
    nextEvent: 65,
    seed: randomBytes(4).readUInt32LE(0) || 1,
    ending: null,
    missionsDone: [],
    maintenance: null,
    nextMaintenance: 10,
    jobsCompleted: 0,
    stats: { repairs: 0, expeditions: 0, crafted: 0, attacks: 0, rescued: 0 },
    savedAt: 0,
    saveError: false,
  };
}
export function newPlayer(profile: unknown): Player {
  const p = profileSchema.parse(profile);
  return {
    ...p,
    id: randomUUID(),
    connected: true,
    ready: false,
    x: 155,
    y: 128,
    hp: 100,
    energy: 100,
    stress: 10,
    infection: 0,
    xp: 0,
    inventory: { medkit: 1, ration: 1, armor: 0 },
    path: [],
    task: null,
    expedition: null,
  };
}
export const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export function random(s: GameState): number {
  s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function log(s: GameState, text: string, kind: GameState['logs'][number]['kind'] = 'info') {
  s.logs.push({ id: randomUUID(), at: s.elapsed, day: s.day, text, kind });
  s.logs = s.logs.slice(-100);
}
