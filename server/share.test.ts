import { afterEach, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { GameState, Result, Session } from '../shared/types.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0))
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
});
function run(env: NodeJS.ProcessEnv, args: string[] = []) {
  const child = spawn(process.execPath, ['scripts/share.mjs', ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let text = '';
  child.stdout!.on('data', (v) => {
    text += v.toString();
  });
  child.stderr!.on('data', (v) => {
    text += v.toString();
  });
  return { child, output: () => text };
}
function exit(child: ChildProcess) {
  return new Promise<number | null>((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
}
it('explains the one-time Cloudflare installation and fails before advertising a link when it is missing', async () => {
  const running = run({
    CLOUDFLARED_PATH: path.join(tmpdir(), 'bunker-nonexistent-cloudflared-binary'),
  });
  expect(await exit(running.child)).toBe(1);
  expect(running.output()).toContain('установите официальный Cloudflare Tunnel');
  expect(running.output()).not.toContain('ИГРА ДЛЯ ДРУЗЕЙ:');
});
it.skipIf(process.platform === 'win32')(
  'serves the real built game for an exact public origin only after a controlled tunnel confirms readiness, then cleans up',
  async () => {
    // This local process fixture exercises orchestration and public-origin handling, not Cloudflare's external network.
    const dir = await mkdtemp(path.join(tmpdir(), 'bunker-share-test-')),
      fixture = path.join(dir, 'cloudflared'),
      registered = path.join(dir, 'registered.json');
    const origin = 'https://local-fixture-test-only.trycloudflare.com';
    await writeFile(
      fixture,
      `#!/usr/bin/env node\nconst fs=require('node:fs');\nif(process.argv.includes('--version')){console.log('cloudflared test fixture');process.exit(0);}\nconsole.error('| ${origin} |');\nconsole.error('fixture verbose='+process.argv.includes('debug'));\nsetTimeout(()=>{fs.writeFileSync(process.env.BUNKER_TEST_READY,JSON.stringify({at:Date.now(),config:process.argv[process.argv.indexOf('--config')+1]}));console.error('Registered tunnel connection protocol=http2');},1200);\nsetInterval(()=>{},1000);\n`,
      { mode: 0o700 },
    );
    const running = run(
      {
        CLOUDFLARED_PATH: fixture,
        BUNKER_TEST_READY: registered,
        npm_execpath: process.env.npm_execpath || '',
        DATABASE_URL: '',
        NODE_ENV: 'development',
        SAVE_DIR: path.join(dir, 'data'),
      },
      ['--verbose'],
    );
    const sockets: Socket[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(() => {
          clearInterval(timer);
          reject(Error('Share startup: ' + running.output()));
        }, 45000);
        const timer = setInterval(() => {
          if (running.output().includes('ИГРА ДЛЯ ДРУЗЕЙ:')) {
            clearTimeout(deadline);
            clearInterval(timer);
            resolve();
          }
        }, 50);
        running.child.once('exit', () => {
          clearTimeout(deadline);
          clearInterval(timer);
          reject(Error('Share exited: ' + running.output()));
        });
      });
      const confirmation = JSON.parse(await readFile(registered, 'utf8'));
      expect(confirmation.at).toBeLessThanOrEqual(Date.now());
      expect(running.output()).toContain(origin);
      expect(running.output()).toContain('fixture verbose=true');
      const port = Number(running.output().match(/BUNKER server listening on (\d+)/)![1]),
        base = `http://127.0.0.1:${port}`;
      expect((await (await fetch(base + '/api/health')).json()).mode).toBe('social');
      expect(await (await fetch(base)).text()).toContain('БУНКЕР');
      const connect = async (header: string) => {
        const s = io(base, {
          reconnection: false,
          forceNew: true,
          transports: ['websocket'],
          extraHeaders: { Origin: header },
        });
        sockets.push(s);
        await new Promise<void>((r, j) => {
          s.once('connect', r);
          s.once('connect_error', j);
        });
        return s;
      };
      const a = await connect(origin),
        b = await connect(origin);
      let view: GameState | undefined;
      b.on('state', (s) => (view = s));
      const request = <T = undefined>(s: Socket, event: string, data: unknown = null) =>
        new Promise<T>((resolve, reject) =>
          s
            .timeout(4000)
            .emit(event, data, (e: Error | null, result: Result<T>) =>
              e || !result.ok
                ? reject(e || Error(!result.ok ? result.error : 'error'))
                : resolve(result.data),
            ),
        );
      const session = await request<Session>(a, 'create', { profile: { name: 'Ведущий' } });
      await request(b, 'join', { code: session.code, profile: { name: 'Друг' } });
      await request(a, 'ready', true);
      await request(b, 'ready', true);
      await request(a, 'start');
      expect(view?.self.cards).not.toBeNull();
      expect(view?.phase).toBe('reveal');
      await expect(connect('https://untrusted.example')).rejects.toThrow();
      sockets.forEach((s) => s.disconnect());
      running.child.kill('SIGTERM');
      await exit(running.child);
      await expect(readFile(confirmation.config)).rejects.toThrow();
      const probe = createServer();
      await new Promise<void>((r, j) => {
        probe.once('error', j);
        probe.listen(port, '127.0.0.1', r);
      });
      await new Promise<void>((r) => probe.close(() => r()));
    } finally {
      sockets.forEach((s) => s.disconnect());
      if (running.child.exitCode === null && running.child.signalCode === null)
        running.child.kill('SIGTERM');
      await rm(dir, { recursive: true, force: true });
    }
  },
  60000,
);
