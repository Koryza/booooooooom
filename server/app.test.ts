import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createGameServer } from './app.js';
import { FileStore } from './store.js';
import type { Category, GameState, Result, Session } from '../shared/types.js';
const profile = { name: 'Север' };
function request<T = undefined>(socket: Socket, event: string, data: unknown = null): Promise<T> {
  return new Promise((resolve, reject) =>
    socket.timeout(4000).emit(event, data, (error: Error | null, result: Result<T>) => {
      if (error || !result.ok) reject(error || new Error(!result.ok ? result.error : 'error'));
      else resolve(result.data);
    }),
  );
}
describe('card-game Socket.IO protocol and persistence', () => {
  let game: ReturnType<typeof createGameServer>, dir: string, url: string;
  const clients: Socket[] = [];
  const snapshots = new Map<Socket, GameState>();
  async function start(tick = false) {
    game = createGameServer(new FileStore(dir), { tick });
    await new Promise<void>((r) => game.http.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(game.http.address() as AddressInfo).port}`;
  }
  async function connect() {
    const socket = io(url, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.on('state', (s) => snapshots.set(socket, s));
    await new Promise<void>((r, j) => {
      socket.once('connect', r);
      socket.once('connect_error', j);
    });
    return socket;
  }
  async function create(count = 2) {
    const sockets = await Promise.all(Array.from({ length: count }, () => connect()));
    const host = await request<Session>(sockets[0], 'create', { profile });
    const sessions = [host];
    for (let i = 1; i < count; i++)
      sessions.push(
        await request<Session>(sockets[i], 'join', {
          code: host.code,
          profile: { name: 'Друг ' + i },
        }),
      );
    return { sockets, sessions, host };
  }
  async function begin(sockets: Socket[]) {
    for (const c of sockets) await request(c, 'ready', true);
    await request(sockets[0], 'start');
  }
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bunker-cards-'));
    await start();
  });
  afterEach(async () => {
    clients.splice(0).forEach((c) => c.disconnect());
    snapshots.clear();
    await game.close();
    await rm(dir, { recursive: true, force: true });
  });
  it('requires readiness, enforces host rights and rejects selecting a profession', async () => {
    const {
      sockets: [a, b],
    } = await create();
    await expect(request(b, 'start')).rejects.toThrow('ведущему');
    await expect(request(a, 'start')).rejects.toThrow('готовы');
    await expect(request(a, 'profile', { name: 'Север', role: 'surgeon' })).rejects.toThrow();
    await begin([a, b]);
    expect(snapshots.get(a)!.phase).toBe('reveal');
    expect(snapshots.get(a)!.self.cards).not.toBeNull();
  });
  it('sends a different private hand per socket and never broadcasts another hand', async () => {
    const {
      sockets: [a, b],
      host,
    } = await create();
    await begin([a, b]);
    const room = game.rooms.get(host.code)!;
    room.state.players[0].sheet!.health.title = 'NETWORK_SECRET_MARKER';
    await request(a, 'chat', 'Начинаем обсуждение');
    const own = snapshots.get(a)!,
      other = snapshots.get(b)!;
    expect(own.self.cards!.health.title).toBe('NETWORK_SECRET_MARKER');
    expect(JSON.stringify(other)).not.toContain('NETWORK_SECRET_MARKER');
    expect(other.players[0].cards.health).toBeNull();
    expect(other.players[0].cards.profession).not.toBeNull();
    expect(JSON.stringify(other)).not.toContain(room.state.players[0].specials[0].id);
    await request(a, 'command', { type: 'reveal', category: 'health' });
    expect(snapshots.get(b)!.players[0].cards.health?.title).toBe('NETWORK_SECRET_MARKER');
    await expect(request(a, 'command', { type: 'reveal', category: 'trait' })).rejects.toThrow(
      'уже',
    );
    await expect(
      request(a, 'command', { type: 'reveal', category: 'hobby', title: 'Подменённая карта' }),
    ).rejects.toThrow();
  });
  it('supports twelve players, rejects a thirteenth and protects session keys', async () => {
    const { sockets, sessions, host } = await create(12),
      extra = await connect();
    await expect(request(extra, 'join', { code: host.code, profile })).rejects.toThrow('12');
    await expect(
      request(extra, 'resume', { ...sessions[0], token: 'a'.repeat(64) }),
    ).rejects.toThrow('недействительна');
    await expect(request(extra, 'join', { code: '../abc', profile })).rejects.toThrow();
    await begin(sockets);
    expect(snapshots.get(sockets[0])!.players).toHaveLength(12);
    expect(
      new Set(game.rooms.get(host.code)!.state.players.map((p) => p.sheet!.profession.title)).size,
    ).toBe(12);
    expect(JSON.stringify(snapshots.get(sockets[1]))).not.toContain(sessions[0].token);
  });
  it('runs six real clients through reveals, secret votes, elimination and a complete game', async () => {
    const { sockets, sessions } = await create(6);
    await begin(sockets);
    for (let round = 0; round < 3; round++) {
      const view = snapshots.get(sockets[0])!,
        alive = view.players.filter((p) => !p.eliminated);
      for (const player of alive) {
        const i = sessions.findIndex((s) => s.playerId === player.id),
          self = snapshots.get(sockets[i])!.self;
        const category = Object.entries(self.cards!).find(([, c]) => !c.revealed)![0] as Category;
        await request(sockets[i], 'command', { type: 'reveal', category });
      }
      expect(snapshots.get(sockets[0])!.phase).toBe('discussion');
      await request(sockets[0], 'command', { type: 'advance' });
      const target = alive.at(-1)!.id;
      for (const player of alive) {
        const i = sessions.findIndex((s) => s.playerId === player.id);
        await request(sockets[i], 'command', {
          type: 'vote',
          targetId: player.id === target ? alive[0].id : target,
        });
      }
      if (round < 2) {
        expect(snapshots.get(sockets[0])!.phase).toBe('results');
        await request(sockets[0], 'command', { type: 'nextRound' });
      }
    }
    expect(snapshots.get(sockets[0])!.phase).toBe('ended');
    expect(snapshots.get(sockets[0])!.winners).toHaveLength(3);
    expect(
      snapshots.get(sockets[0])!.players.every((p) => Object.values(p.cards).every(Boolean)),
    ).toBe(true);
  });
  it('rejects late entry and keeps random cards, special usage and phase on server restart', async () => {
    const {
      sockets: [a, b],
      host,
    } = await create();
    await begin([a, b]);
    const cards = snapshots.get(a)!.self.cards;
    const c = await connect();
    await expect(request(c, 'join', { code: host.code, profile })).rejects.toThrow('Партия уже');
    await request(a, 'command', { type: 'reveal', category: 'hobby' });
    await request(a, 'save');
    a.disconnect();
    b.disconnect();
    c.disconnect();
    await game.close();
    await start();
    const restored = await connect();
    await request(restored, 'resume', host);
    const view = snapshots.get(restored)!;
    expect(view.phase).toBe('reveal');
    expect(view.self.cards!.profession).toEqual(cards!.profession);
    expect(view.self.cards!.hobby.revealed).toBe(true);
    expect(view.self.cards!.trait.title).toBe(cards!.trait.title);
    expect(view.self.playerId).toBe(host.playerId);
  });
  it('removes a kicked lobby seat, invalidates its key and retains safe chat text', async () => {
    const {
      sockets: [a, b],
      sessions,
    } = await create();
    await request(b, 'chat', '<script>alert(1)</script>');
    expect(snapshots.get(a)!.chat.at(-1)!.text).toBe('<script>alert(1)</script>');
    await request(a, 'kick', sessions[1].playerId);
    const c = await connect();
    await expect(request(c, 'resume', sessions[1])).rejects.toThrow('недействительна');
  });
  it('preserves old simulator saves and reports their incompatible version', async () => {
    const file = path.join(dir, 'OLD234.json');
    await writeFile(file, JSON.stringify({ state: { version: 1, code: 'OLD234' }, tokens: {} }));
    const store = new FileStore(dir);
    await expect(store.load('OLD234')).rejects.toThrow('старого симулятора');
    expect(JSON.parse(await readFile(file, 'utf8')).state.version).toBe(1);
  });
  it('continues independent room clocks and pauses a completely empty room', async () => {
    await game.close();
    await start(true);
    const first = await create(),
      second = await create();
    await begin(first.sockets);
    await begin(second.sockets);
    const wait = (socket: Socket) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('No clock broadcast')), 3000);
        socket.on('state', (state: GameState) => {
          if (state.clock >= 0.3) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    await Promise.all([wait(first.sockets[0]), wait(second.sockets[0])]);
    first.sockets.forEach((c) => c.disconnect());
  });
});
