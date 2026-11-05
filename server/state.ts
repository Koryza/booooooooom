import { randomInt, randomUUID } from 'node:crypto';
import type { Player, RoomState, Settings } from '../shared/types.js';
import { profileSchema } from '../shared/validation.js';
export const DEFAULT_SETTINGS: Settings = {
  seats: null,
  revealSeconds: 60,
  discussionSeconds: 90,
  voteSeconds: 40,
};
export function newState(code: string): RoomState {
  return {
    version: 2,
    mode: 'social',
    code,
    hostId: '',
    phase: 'lobby',
    settings: { ...DEFAULT_SETTINGS },
    match: 0,
    round: 0,
    clock: 0,
    phaseEndsAt: null,
    seats: 0,
    players: [],
    scenario: null,
    logs: [],
    chat: [],
    votes: {},
    candidates: [],
    ballot: 0,
    lastVote: null,
    winners: [],
    savedAt: 0,
    saveError: false,
  };
}
export function newPlayer(profile: unknown): Player {
  const { name } = profileSchema.parse(profile);
  return {
    id: randomUUID(),
    name,
    avatar: randomInt(12),
    connected: true,
    ready: false,
    characterName: null,
    sheet: null,
    specials: [],
    notes: [],
    eliminated: false,
    revealedRound: 0,
    readyForVote: false,
    specialPlayedRound: 0,
    immunityRound: 0,
    doubleVoteRound: 0,
  };
}
export function log(s: RoomState, text: string, kind: RoomState['logs'][number]['kind'] = 'info') {
  s.logs.push({ id: randomUUID(), round: s.round, text, kind });
  s.logs = s.logs.slice(-120);
}
