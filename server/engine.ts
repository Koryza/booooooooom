import type { Challenge, GameCommand, GameState, Player } from '../shared/types.js';
export class Engine {
  readonly challenges = new Map<string, Challenge>();
  constructor(readonly state: GameState) {}
  tick(_dt: number) {}
  command(_player: Player, _command: GameCommand): Challenge | null { throw new Error('Действие пока недоступно'); }
}
