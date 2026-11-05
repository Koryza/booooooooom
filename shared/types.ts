import type { Cost, Resources, RoomId, ActionId } from './catalog.js';
import type { Difficulty, Role } from './validation.js';
export type Point = { x: number; y: number };
export interface Player extends Point {
  id: string;
  name: string;
  role: Role;
  avatar: number;
  connected: boolean;
  ready: boolean;
  hp: number;
  energy: number;
  stress: number;
  infection: number;
  xp: number;
  inventory: { medkit: number; ration: number; armor: number };
  path: Point[];
  task: null | {
    label: string;
    startedAt: number;
    endsAt: number;
    action: string;
    room: RoomId;
    target?: string;
    quality: number;
  };
  expedition: string | null;
}
export interface LogEntry {
  id: string;
  at: number;
  day: number;
  text: string;
  kind: 'info' | 'good' | 'danger' | 'story';
}
export interface ChatEntry {
  id: string;
  name: string;
  text: string;
  at: number;
}
export interface Crisis {
  id: string;
  type: string;
  title: string;
  text: string;
  choices: { label: string; desc: string }[];
  votes: Record<string, number>;
  endsAt: number;
}
export interface Expedition {
  id: string;
  zone: string;
  mode: 'quiet' | 'fast';
  players: string[];
  launched: boolean;
  endsAt: number;
  risk: number;
}
export interface GameState {
  version: 1;
  code: string;
  hostId: string;
  phase: 'lobby' | 'playing' | 'ended';
  difficulty: Difficulty;
  players: Player[];
  resources: Resources;
  rooms: Record<RoomId, { integrity: number; level: number; built: boolean }>;
  elapsed: number;
  day: number;
  hour: number;
  power: boolean;
  oxygen: number;
  morale: number;
  threat: number;
  research: string[];
  story: number[];
  achievements: string[];
  logs: LogEntry[];
  chat: ChatEntry[];
  crisis: Crisis | null;
  expeditions: Expedition[];
  weather: 'clear' | 'rain' | 'storm' | 'fog';
  nextEvent: number;
  seed: number;
  ending: string | null;
  missionsDone: string[];
  maintenance: null | {
    title: string;
    desc: string;
    kind: 'repair' | 'oxygen' | 'food' | 'water' | 'defense' | 'craft';
    target?: RoomId;
    goal: number;
    expiresAt: number;
    reward: Cost;
  };
  nextMaintenance: number;
  jobsCompleted: number;
  stats: {
    repairs: number;
    expeditions: number;
    crafted: number;
    attacks: number;
    rescued: number;
  };
  savedAt: number;
  saveError: boolean;
}
export interface Session {
  code: string;
  playerId: string;
  token: string;
}
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export interface Challenge {
  id: string;
  sequence: number[];
  expiresAt: number;
  action: string;
  room: RoomId;
  target?: string;
}
export type GameCommand =
  | { type: 'cancel' }
  | { type: 'move'; x: number; y: number }
  | { type: 'travel'; room: RoomId }
  | { type: 'act'; action: ActionId; room: RoomId }
  | { type: 'challenge'; id: string; answer: number[] }
  | { type: 'craft'; recipe: string }
  | { type: 'research'; tech: string }
  | { type: 'upgrade'; room: RoomId }
  | { type: 'build' }
  | { type: 'use'; item: 'medkit' | 'ration' }
  | { type: 'give'; item: 'medkit' | 'ration'; amount: number; playerId: string }
  | { type: 'expedition'; zone: string; mode: 'quiet' | 'fast' }
  | { type: 'join-expedition'; id: string }
  | { type: 'vote'; choice: number }
  | { type: 'ending'; ending: 'evacuation' | 'autonomy' | 'vaccine' };
export interface Mission {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  reward: Cost;
}
