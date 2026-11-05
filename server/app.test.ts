import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createGameServer } from './app.js';
import { FileStore } from './store.js';
import type { GameState, Result, Session } from '../shared/types.js';
const profile = { name: 'Север', role: 'engineer', avatar: 0 };
function request<T = undefined>(socket: Socket, event: string, data: unknown = null) {
  return new Promise<T>((resolve, reject) =>
    socket.timeout(4000).emit(event, data, (error: Error | null, result: Result<T>) => {
      if (error || !result.ok) reject(error || new Error(!result.ok ? result.error : 'error'));
      else resolve(result.data);
    }),
  );
}
describe('real Socket.IO rooms', () => {
  let game: ReturnType<typeof createGameServer>;
  let dir: string;
  let url: string;
  const clients: Socket[] = [];
  async function start(tick = false) {
    game = createGameServer(new FileStore(dir), { tick });
    await new Promise<void>((resolve) => game.http.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(game.http.address() as AddressInfo).port}`;
  }
  async function connect() {
    const socket = io(url, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bunker-test-'));
    await start();
  });
  afterEach(async () => {
    clients.splice(0).forEach((c) => c.disconnect());
    await game.close();
    await rm(dir, { recursive: true, force: true });
  });
  it('synchronizes two players, enforces host and readiness, and relays chat', async () => {
    const a = await connect();
    const b = await connect();
    const session = await request<Session>(a, 'create', { profile, difficulty: 'normal' });
    const second = await request<Session>(b, 'join', {
      profile: { ...profile, name: 'Искра', role: 'medic' },
      code: session.code,
    });
    await expect(request(b, 'start')).rejects.toThrow('Только лидер');
    await request(a, 'ready', true);
    await expect(request(a, 'start')).rejects.toThrow('готовности');
    await request(b, 'ready', true);
    await request(a, 'start');
    expect(game.rooms.get(session.code)!.state.phase).toBe('playing');
    await request(b, 'chat', '<script>alert(1)</script>');
    const s = game.rooms.get(session.code)!.state;
    expect(s.players.map((p) => p.id)).toContain(second.playerId);
    expect(s.chat.at(-1)?.text).toBe('<script>alert(1)</script>'); // Rendered as text by React.
    await expect(request(a, 'profile', { ...profile, role: 'soldier' })).rejects.toThrow(
      'до начала',
    );
  });
  it('rejects seventh player, malformed codes, forged tokens and oversized payloads', async () => {
    const a = await connect();
    const session = await request<Session>(a, 'create', { profile, difficulty: 'normal' });
    for (let n = 1; n < 6; n++)
      await request(await connect(), 'join', { profile, code: session.code });
    const seventh = await connect();
    await expect(request(seventh, 'join', { profile, code: session.code })).rejects.toThrow(
      '6 выживших',
    );
    await expect(request(seventh, 'resume', { ...session, token: 'a'.repeat(64) })).rejects.toThrow(
      'недействительна',
    );
    await expect(request(seventh, 'join', { profile, code: '../abc' })).rejects.toThrow();
    await expect(request(a, 'chat', 'x'.repeat(241))).rejects.toThrow();
  });
  it('restores identities and state from disk after restarting the server', async () => {
    const a = await connect();
    const session = await request<Session>(a, 'create', { profile, difficulty: 'hard' });
    await request(a, 'ready', true);
    await request(a, 'start');
    await request(a, 'chat', 'Мы вернёмся');
    await request(a, 'save');
    a.disconnect();
    await game.close();
    await start();
    const b = await connect();
    const states: GameState[] = [];
    b.on('state', (s) => states.push(s));
    await request(b, 'resume', session);
    expect(states.at(-1)?.players[0].id).toBe(session.playerId);
    expect(states.at(-1)?.chat.at(-1)?.text).toBe('Мы вернёмся');
    expect(states.at(-1)?.phase).toBe('playing');
    expect(JSON.stringify(states.at(-1))).not.toContain(session.token);
  });
  it('removes a lobby seat and makes its session unusable when kicked', async () => {
    const a = await connect();
    const b = await connect();
    const c = await connect();
    const host = await request<Session>(a, 'create', { profile, difficulty: 'normal' });
    const guest = await request<Session>(b, 'join', { profile, code: host.code });
    await request(a, 'kick', guest.playerId);
    expect(game.rooms.get(host.code)!.state.players).toHaveLength(1);
    await expect(request(c, 'resume', guest)).rejects.toThrow('недействительна');
  });
  it('broadcasts independent running rooms instead of starving every other room', async () => {
    await game.close();
    await start(true);
    const a = await connect(),
      b = await connect();
    await request(a, 'create', { profile, difficulty: 'normal' });
    await request(b, 'create', { profile, difficulty: 'normal' });
    const updates = (socket: Socket) =>
      new Promise<GameState>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Room stopped broadcasting')), 3000);
        socket.on('state', (state: GameState) => {
          if (state.elapsed >= 0.3) {
            clearTimeout(timeout);
            resolve(state);
          }
        });
      });
    const first = updates(a),
      second = updates(b);
    await request(a, 'ready', true);
    await request(a, 'start');
    await request(b, 'ready', true);
    await request(b, 'start');
    const [one, two] = await Promise.all([first, second]);
    expect(one.code).not.toBe(two.code);
  });
  it('starts and synchronizes the full six-player team with server-side movement', async () => {
    const sockets = await Promise.all(Array.from({ length: 6 }, () => connect()));
    const host = await request<Session>(sockets[0], 'create', { profile, difficulty: 'normal' });
    await Promise.all(
      sockets
        .slice(1)
        .map((socket, i) =>
          request(socket, 'join', { code: host.code, profile: { ...profile, name: 'Друг ' + i } }),
        ),
    );
    await Promise.all(sockets.map((socket) => request(socket, 'ready', true)));
    await request(sockets[0], 'start');
    const room = game.rooms.get(host.code)!;
    await Promise.all(
      sockets.map((socket) => request(socket, 'command', { type: 'move', x: 1, y: 0 })),
    );
    room.engine.tick(0.1);
    expect(room.state.players).toHaveLength(6);
    for (const player of room.state.players) expect(player.x).toBeCloseTo(175, 6);
    await expect(request(sockets[0], 'command', { type: 'move', x: 9999, y: 0 })).rejects.toThrow();
  });
});
