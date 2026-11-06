import { it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { GameState, Result, Session } from '../shared/types.js';

it('starts the complete dev game on free ports with a working HTTP/WebSocket proxy and strict origins', async () => {
  const blockers = [createServer(), createServer()];
  for (const server of blockers)
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  const [clientBusy, serverBusy] = blockers.map((s) => (s.address() as { port: number }).port);
  const dir = await mkdtemp(path.join(tmpdir(), 'bunker-dev-'));
  const children: ChildProcess[] = [],
    sockets: Socket[] = [];
  let output = '';
  const child = spawn(process.execPath, ['scripts/dev.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {
      ...process.env,
      CLIENT_PORT: String(clientBusy),
      PORT: String(serverBusy),
      HOST: '127.0.0.1',
      PUBLIC_ORIGIN: 'https://configured.example.test',
      NODE_ENV: 'development',
      DATABASE_URL: '',
      SAVE_DIR: dir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const collect = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-20000);
  };
  child.stdout!.on('data', collect);
  child.stderr!.on('data', collect);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Dev startup failed: ' + output)), 20000);
      const check = setInterval(() => {
        if (/\[client\] Игра: http:\/\/localhost:\d+/.test(output)) {
          clearTimeout(timer);
          clearInterval(check);
          resolve();
        }
      }, 50);
      child.once('exit', () => {
        clearTimeout(timer);
        clearInterval(check);
        reject(Error('Dev exited: ' + output));
      });
      child.once('error', reject);
    });
    const clientPort = Number(output.match(/\[client\] Игра: http:\/\/localhost:(\d+)/)![1]);
    const backendPort = Number(output.match(/\[server\] API: http:\/\/127\.0\.0\.1:(\d+)/)![1]);
    expect(clientPort).not.toBe(clientBusy);
    expect(backendPort).not.toBe(serverBusy);
    expect(clientPort).not.toBe(backendPort);
    const url = `http://127.0.0.1:${clientPort}`;
    expect((await (await fetch(url + '/api/health')).json()).mode).toBe('social');
    expect(await (await fetch(url)).text()).toContain('БУНКЕР');
    const connect = async (transport: string, origin: string, base = url) => {
      const socket = io(base, {
        forceNew: true,
        reconnection: false,
        timeout: 2500,
        transports: [transport],
        extraHeaders: { Origin: origin },
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    };
    const a = await connect('websocket', url),
      b = await connect('polling', url);
    const states = new Map<Socket, GameState>();
    for (const s of [a, b]) s.on('state', (view) => states.set(s, view));
    const request = <T = undefined>(socket: Socket, event: string, data: unknown = null) =>
      new Promise<T>((resolve, reject) =>
        socket.timeout(4000).emit(event, data, (error: Error | null, result: Result<T>) => {
          if (error || !result.ok) reject(error || Error(!result.ok ? result.error : 'error'));
          else resolve(result.data);
        }),
      );
    const session = await request<Session>(a, 'create', { profile: { name: 'Альфа' } });
    await request(b, 'join', { code: session.code, profile: { name: 'Бета' } });
    await request(a, 'ready', true);
    await request(b, 'ready', true);
    await request(a, 'start');
    await expect.poll(() => states.get(b)?.phase, { timeout: 5000 }).toBe('reveal');
    expect(states.get(b)!.self.cards).not.toBeNull();
    await connect(
      'websocket',
      'https://configured.example.test',
      `http://127.0.0.1:${backendPort}`,
    );
    await expect(
      connect('websocket', 'https://untrusted.example', `http://127.0.0.1:${backendPort}`),
    ).rejects.toThrow();
    for (const socket of sockets) socket.disconnect();
    child.kill('SIGTERM');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Dev did not stop')), 13000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    for (const port of [clientPort, backendPort]) {
      const probe = createServer();
      await new Promise<void>((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(port, '0.0.0.0', resolve);
      });
      await new Promise<void>((resolve) => probe.close(() => resolve()));
    }
    expect(blockers.every((s) => s.listening)).toBe(true);
  } finally {
    sockets.forEach((s) => s.disconnect());
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          child.once('exit', () => resolve());
        });
      }
    for (const server of blockers)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}, 40000);
