export const CATEGORIES = [
  'profession',
  'biology',
  'health',
  'hobby',
  'phobia',
  'baggage',
  'fact',
  'trait',
] as const;
export type Category = (typeof CATEGORIES)[number];
export type Phase = 'lobby' | 'reveal' | 'discussion' | 'voting' | 'results' | 'ended';
export interface Card {
  title: string;
  detail: string;
}
export interface CharacterCard extends Card {
  revealed: boolean;
}
export type Sheet = Record<Category, CharacterCard>;
export const SPECIAL_KINDS = [
  'newProfession',
  'newHealth',
  'newPhobia',
  'swapProfession',
  'swapBaggage',
  'peek',
  'expose',
  'immunity',
  'doubleVote',
] as const;
export type SpecialKind = (typeof SPECIAL_KINDS)[number];
export interface SpecialCard {
  id: string;
  kind: SpecialKind;
  used: boolean;
}
export interface PeekNote {
  playerId: string;
  name: string;
  category: Category;
  card: Card;
  round: number;
}
export interface Player {
  id: string;
  name: string;
  avatar: number;
  connected: boolean;
  ready: boolean;
  characterName: string | null;
  sheet: Sheet | null;
  specials: SpecialCard[];
  notes: PeekNote[];
  eliminated: boolean;
  revealedRound: number;
  readyForVote: boolean;
  specialPlayedRound: number;
  immunityRound: number;
  doubleVoteRound: number;
}
export interface Settings {
  seats: number | null;
  revealSeconds: number;
  discussionSeconds: number;
  voteSeconds: number;
}
export interface Scenario {
  id: string;
  title: string;
  description: string;
  outside: string;
  shelter: {
    area: number;
    months: number;
    foodMonths: number;
    features: string[];
    problem: string;
  };
}
export interface LogEntry {
  id: string;
  round: number;
  text: string;
  kind: 'info' | 'reveal' | 'special' | 'vote';
}
export interface ChatEntry {
  id: string;
  playerId: string;
  name: string;
  text: string;
}
export interface VoteResult {
  counts: Record<string, number>;
  eliminatedId: string | null;
  tied: string[];
  runoff: boolean;
  lottery: boolean;
  votesCast: number;
}
export interface RoomState {
  version: 2;
  mode: 'social';
  code: string;
  hostId: string;
  phase: Phase;
  settings: Settings;
  match: number;
  round: number;
  clock: number;
  phaseEndsAt: number | null;
  seats: number;
  players: Player[];
  scenario: Scenario | null;
  logs: LogEntry[];
  chat: ChatEntry[];
  votes: Record<string, string>;
  candidates: string[];
  ballot: number;
  lastVote: VoteResult | null;
  winners: string[];
  savedAt: number;
  saveError: boolean;
}
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  connected: boolean;
  ready: boolean;
  characterName: string | null;
  eliminated: boolean;
  cards: Record<Category, Card | null>;
  revealedRound: number;
  readyForVote: boolean;
  protected: boolean;
  doubleVote: boolean;
  specialsUsed: SpecialKind[];
  specialCount: number;
}
export interface GameState extends Omit<RoomState, 'players' | 'votes'> {
  players: PublicPlayer[];
  voters: string[];
  self: {
    playerId: string;
    cards: Sheet | null;
    specials: SpecialCard[];
    notes: PeekNote[];
    voteTarget: string | null;
    specialPlayedRound: number;
  };
}
export interface Session {
  code: string;
  playerId: string;
  token: string;
}
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export type GameCommand =
  | { type: 'reveal'; category: Category }
  | { type: 'readyVote'; ready: boolean }
  | { type: 'advance' }
  | { type: 'vote'; targetId: string }
  | { type: 'nextRound' }
  | { type: 'special'; cardId: string; targetId?: string; category?: Category }
  | { type: 'rematch' };
