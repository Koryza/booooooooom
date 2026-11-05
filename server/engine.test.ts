import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Engine } from './engine.js';
import { newPlayer, newState } from './state.js';
import { CATEGORIES, type SpecialKind, type Player } from '../shared/types.js';
function setup(count = 4) {
  const s = newState('ABCD23');
  s.players = Array.from({ length: count }, (_, i) => newPlayer({ name: 'Игрок ' + i }));
  s.hostId = s.players[0].id;
  s.players.forEach((p) => (p.ready = true));
  const e = new Engine(s);
  e.start(s.players[0]);
  return { s, e, p: s.players[0] };
}
function discussion(e: Engine) {
  for (const p of e.state.players.filter((p) => !p.eliminated))
    if (e.state.phase === 'reveal' && p.revealedRound !== e.state.round)
      e.command(p, { type: 'reveal', category: CATEGORIES.find((c) => !p.sheet![c].revealed)! });
}
function special(e: Engine, p: Player, kind: SpecialKind, target?: Player) {
  const card = { id: randomUUID(), kind, used: false };
  p.specials = [card];
  e.command(p, {
    type: 'special',
    cardId: card.id,
    ...(target ? { targetId: target.id } : {}),
    ...(['peek', 'expose'].includes(kind) ? { category: 'trait' as const } : {}),
  });
  return card;
}
describe('social Bunker character deal', () => {
  it('gives twelve players eight random characteristics, two different specials and unique professions', () => {
    const { s } = setup(12);
    expect(new Set(s.players.map((p) => p.sheet!.profession.title)).size).toBe(12);
    expect(new Set(s.players.map((p) => p.avatar)).size).toBe(12);
    for (const p of s.players) {
      expect(Object.keys(p.sheet!)).toHaveLength(8);
      expect(p.specials).toHaveLength(2);
      expect(p.specials[0].kind).not.toBe(p.specials[1].kind);
      expect(p.sheet!.profession.revealed).toBe(true);
      expect(Object.values(p.sheet!).filter((c) => c.revealed)).toHaveLength(1);
      expect(p.sheet!.biology.title).toMatch(/(Мужчина|Женщина), \d+ лет/);
    }
    expect(s.scenario!.shelter.features).toHaveLength(3);
    expect(s.seats).toBe(6);
  });
  it('produces different complete hands across games', () => {
    const hands = new Set(Array.from({ length: 12 }, () => JSON.stringify(setup(2).p.sheet)));
    expect(hands.size).toBe(12);
  });
  it('requires two connected ready players and a leading host', () => {
    const s = newState('ABCD23'),
      p = newPlayer({ name: 'Один' });
    s.players = [p];
    s.hostId = p.id;
    p.ready = true;
    const e = new Engine(s);
    expect(() => e.start(p)).toThrow('два');
    const b = newPlayer({ name: 'Второй' });
    s.players.push(b);
    expect(() => e.start(b)).toThrow('ведущему');
    expect(() => e.start(p)).toThrow('готовы');
    b.ready = true;
    s.settings.seats = 2;
    expect(() => e.start(p)).toThrow('Мест');
    s.settings.seats = 1;
    e.start(p);
    expect(s.phase).toBe('reveal');
  });
  it('never exposes unrevealed cards, notes, other special IDs, or ballots to another player', () => {
    const { e, s, p } = setup();
    const b = s.players[1];
    b.sheet!.trait.title = 'PRIVATE_TRAIT_MARKER';
    const view = e.view(p.id);
    expect(view.players[1].cards.trait).toBeNull();
    expect(JSON.stringify(view)).not.toContain('PRIVATE_TRAIT_MARKER');
    expect(JSON.stringify(view)).not.toContain(b.specials[0].id);
    expect('votes' in view).toBe(false);
    expect(e.view(b.id).self.cards!.trait.title).toBe('PRIVATE_TRAIT_MARKER');
    view.self.cards!.health.title = 'tampered';
    expect(p.sheet!.health.title).not.toBe('tampered');
  });
  it('allows one personal reveal per round and automatically opens discussion', () => {
    const { e, s, p } = setup();
    e.command(p, { type: 'reveal', category: 'hobby' });
    expect(e.view(s.players[1].id).players[0].cards.hobby).not.toBeNull();
    expect(() => e.command(p, { type: 'reveal', category: 'health' })).toThrow('уже');
    discussion(e);
    expect(s.phase).toBe('discussion');
    expect(() => e.command(p, { type: 'reveal', category: 'health' })).toThrow('не этап');
  });
  it('does not reopen already public cards or accept revealing another player’s card', () => {
    const { e, p } = setup();
    expect(() => e.command(p, { type: 'reveal', category: 'profession' })).toThrow('закрытую');
  });
});
describe('discussion, secret votes and complete matches', () => {
  it('accepts ready votes and keeps ballot choices secret until the tally', () => {
    const { e, s, p } = setup();
    discussion(e);
    for (const x of s.players) e.command(x, { type: 'readyVote', ready: true });
    expect(s.phase).toBe('voting');
    const b = s.players[1];
    e.command(p, { type: 'vote', targetId: b.id });
    expect(e.view(b.id).voters).toEqual([p.id]);
    expect(e.view(b.id).self.voteTarget).toBeNull();
    expect(e.view(p.id).self.voteTarget).toBe(b.id);
    expect(() => e.command(p, { type: 'vote', targetId: s.players[2].id })).toThrow('уже');
    expect(() => e.command(b, { type: 'vote', targetId: b.id })).toThrow('другого');
  });
  it('eliminates the plurality target, runs the next round and finishes at the configured capacity', () => {
    const { e, s, p } = setup();
    discussion(e);
    e.command(p, { type: 'advance' });
    const [a, b, c, d] = s.players;
    for (const [voter, target] of [
      [a, b],
      [b, c],
      [c, b],
      [d, b],
    ])
      e.command(voter, { type: 'vote', targetId: target.id });
    expect(b.eliminated).toBe(true);
    expect(s.phase).toBe('results');
    expect(s.lastVote!.counts[b.id]).toBe(3);
    expect(() => e.command(b, { type: 'reveal', category: 'health' })).toThrow('исключены');
    e.command(p, { type: 'nextRound' });
    discussion(e);
    e.command(p, { type: 'advance' });
    for (const [voter, target] of [
      [a, c],
      [c, d],
      [d, c],
    ])
      e.command(voter, { type: 'vote', targetId: target.id });
    expect(s.phase).toBe('ended');
    expect(s.winners).toEqual([a.id, d.id]);
    expect(e.view(b.id).players.every((x) => Object.values(x.cards).every(Boolean))).toBe(true);
  });
  it('uses a runoff, then a server lottery on a second tie (including two-player matches)', () => {
    const { e, s, p } = setup(2);
    discussion(e);
    e.command(p, { type: 'advance' });
    const [a, b] = s.players;
    e.command(a, { type: 'vote', targetId: b.id });
    e.command(b, { type: 'vote', targetId: a.id });
    expect(s.phase).toBe('voting');
    expect(s.ballot).toBe(2);
    expect(s.lastVote!.eliminatedId).toBeNull();
    e.command(a, { type: 'vote', targetId: b.id });
    e.command(b, { type: 'vote', targetId: a.id });
    expect(s.phase).toBe('ended');
    expect(s.lastVote!.lottery).toBe(true);
    expect(s.winners).toHaveLength(1);
  });
  it('lets an eliminated host advance the procedural round but never cast a ballot', () => {
    const { e, s, p } = setup(4);
    discussion(e);
    e.command(p, { type: 'advance' });
    for (const x of s.players)
      e.command(x, { type: 'vote', targetId: x.id === p.id ? s.players[1].id : p.id });
    expect(p.eliminated).toBe(true);
    e.command(p, { type: 'nextRound' });
    expect(s.round).toBe(2);
    discussion(e);
    e.command(p, { type: 'advance' });
    expect(() => e.command(p, { type: 'vote', targetId: s.players[1].id })).toThrow('исключены');
  });
  it('rematches into the same lobby with new server-dealt characters, preserving identities', () => {
    const { e, s, p } = setup(2),
      original = JSON.stringify(p.sheet),
      id = p.id;
    s.phase = 'ended';
    e.command(p, { type: 'rematch' });
    expect(s.phase).toBe('lobby');
    expect(p.sheet).toBeNull();
    expect(p.ready).toBe(false);
    s.players.forEach((x) => (x.ready = true));
    e.start(p);
    expect(s.match).toBe(2);
    expect(p.id).toBe(id);
    expect(JSON.stringify(p.sheet)).not.toBe(original);
  });
  it('advances deadlines even for disconnected participants and pauses if everybody is offline', () => {
    const { e, s } = setup();
    s.players.forEach((p) => (p.connected = false));
    e.tick(1);
    expect(s.clock).toBe(0);
    s.players[0].connected = true;
    for (let n = 0; n < 60; n++) e.tick(1);
    expect(s.phase).toBe('discussion');
    expect(s.players.every((p) => p.revealedRound === 1)).toBe(true);
    for (let n = 0; n < 90; n++) e.tick(1);
    expect(s.phase).toBe('voting');
    for (let n = 0; n < 80; n++) e.tick(1);
    expect(s.phase).toBe('results');
    expect(s.lastVote!.lottery).toBe(true);
  });
  it('skips reveal when all characteristics are already open and completes a 12-to-1 match', () => {
    const { e, s } = setup(12);
    s.seats = 1;
    for (let tick = 0; tick < 4000 && s.phase !== 'ended'; tick++) e.tick(1);
    expect(s.phase).toBe('ended');
    expect(s.winners).toHaveLength(1);
    expect(s.round).toBe(11);
    expect(s.logs.length).toBeLessThanOrEqual(120);
  });
});
describe('special cards have server-validated effects', () => {
  it.each(['newProfession', 'newHealth', 'newPhobia'] as const)(
    '%s replaces an actual characteristic',
    (kind) => {
      const { e, p } = setup();
      const category = (
        { newProfession: 'profession', newHealth: 'health', newPhobia: 'phobia' } as const
      )[kind];
      const old = p.sheet![category].title;
      const card = special(e, p, kind);
      expect(p.sheet![category].title).not.toBe(old);
      expect(card.used).toBe(true);
      expect(() => e.command(p, { type: 'special', cardId: card.id })).toThrow('использована');
    },
  );
  it('swaps professions and baggage while preserving public information', () => {
    for (const kind of ['swapProfession', 'swapBaggage'] as const) {
      const { e, s, p } = setup();
      const b = s.players[1],
        category = kind === 'swapProfession' ? 'profession' : 'baggage';
      b.sheet![category].revealed = true;
      const old = p.sheet![category].title,
        other = b.sheet![category].title;
      special(e, p, kind, b);
      expect(p.sheet![category].title).toBe(other);
      expect(b.sheet![category].title).toBe(old);
      expect(p.sheet![category].revealed && b.sheet![category].revealed).toBe(true);
    }
  });
  it('keeps a secret peek private, and exposure does not spend the target’s ordinary reveal', () => {
    const { e, s, p } = setup();
    const b = s.players[1],
      c = s.players[2];
    b.sheet!.trait.title = 'SECRET_PEEK_MARKER';
    special(e, p, 'peek', b);
    expect(p.notes[0].card.title).toBe('SECRET_PEEK_MARKER');
    expect(b.sheet!.trait.revealed).toBe(false);
    expect(JSON.stringify(e.view(c.id))).not.toContain('SECRET_PEEK_MARKER');
    special(e, c, 'expose', b);
    expect(b.sheet!.trait.revealed).toBe(true);
    expect(b.revealedRound).toBe(0);
    e.command(b, { type: 'reveal', category: 'hobby' });
    expect(b.revealedRound).toBe(1);
  });
  it('prevents multiple specials in a round and all specials after discussion', () => {
    const { e, s, p } = setup();
    special(e, p, 'doubleVote');
    const card = { id: randomUUID(), kind: 'newHealth' as const, used: false };
    p.specials.push(card);
    expect(() => e.command(p, { type: 'special', cardId: card.id })).toThrow('одну');
    discussion(e);
    e.command(p, { type: 'advance' });
    expect(() => e.command(p, { type: 'special', cardId: card.id })).toThrow('до голосования');
    expect(s.phase).toBe('voting');
  });
  it('protects only the current round and keeps at least two candidates', () => {
    const { e, s, p } = setup(3);
    special(e, p, 'immunity');
    expect(() => special(e, s.players[1], 'immunity')).toThrow('два кандидата');
    discussion(e);
    e.command(p, { type: 'advance' });
    expect(s.candidates).not.toContain(p.id);
    expect(() => e.command(s.players[1], { type: 'vote', targetId: p.id })).toThrow('доступного');
  });
  it('counts the doubled vote and rejects foreign special IDs and missing targets', () => {
    const { e, s, p } = setup(3);
    expect(() => e.command(p, { type: 'special', cardId: s.players[1].specials[0].id })).toThrow(
      'не найдена',
    );
    const invalid = { id: randomUUID(), kind: 'peek' as const, used: false };
    p.specials = [invalid];
    expect(() => e.command(p, { type: 'special', cardId: invalid.id })).toThrow('другого');
    special(e, p, 'doubleVote');
    discussion(e);
    e.command(p, { type: 'advance' });
    const [a, b, c] = s.players;
    for (const [voter, target] of [
      [a, b],
      [b, c],
      [c, a],
    ])
      e.command(voter, { type: 'vote', targetId: target.id });
    expect(s.lastVote!.counts[b.id]).toBe(2);
    expect(b.eliminated).toBe(true);
  });
});
