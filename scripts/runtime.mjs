import { createConnection, createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function readPort(value, fallback) {
  const port = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Порт должен быть целым числом от 1 до 65535');
  }
  return port;
}

export async function freePort(preferred, host = '0.0.0.0', excluded = []) {
  for (let port = preferred; port <= Math.min(preferred + 100, 65535); port++) {
    if (excluded.includes(port)) continue;
    const available = await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.unref();
      probe.once('error', (error) =>
        error.code === 'EADDRINUSE' ? resolve(false) : reject(error),
      );
      probe.listen({ port, host, exclusive: true }, () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error(`Не найден свободный порт рядом с ${preferred}. Остановите прежний запуск игры.`);
}

export function originsForDev(urls, port, configured = '') {
  return [
    ...new Set(
      [
        ...configured
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
        ...(urls?.local || []),
        ...(urls?.network || []),
      ].map((value) => new URL(value).origin),
    ),
  ].join(',');
}

export function spawnNode(args, env = {}) {
  return spawn(process.execPath, args, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}

export async function stopChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 11000);
    timer.unref();
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

export function shutdownWith(cleanup) {
  let closing = false;
  const stop = async (code = 0) => {
    if (closing) return;
    closing = true;
    try {
      await cleanup();
    } catch (error) {
      console.error(error.message);
      code = 1;
    }
    process.exit(code);
  };
  process.once('SIGINT', () => void stop(130));
  process.once('SIGTERM', () => void stop(143));
  return stop;
}

export async function waitForApp(url, child, milliseconds = 15000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error('Игровой сервер завершился при запуске');
    try {
      const response = await fetch(new URL('/api/health', url), {
        signal: AbortSignal.timeout(1000),
      });
      const health = await response.json();
      if (response.ok && health.ok && health.mode === 'social') return;
    } catch {
      /* The server can still be initializing its store. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Игровой сервер не подтвердил готовность. Проверьте сообщения сервера выше.');
}

export function quickTunnelUrl(text) {
  return (
    text.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com(?=[\s|]|$)/)?.[0] || null
  );
}

export function recentTunnelErrors(log) {
  return [...new Set(log.split(/\r?\n/).map((line) => line.trim()))]
    .filter((line) => /\b(?:ERR|WRN)\b|connection with edge closed/.test(line))
    .slice(-12)
    .map((line) => line.slice(0, 2048))
    .join('\n');
}

export async function waitForPortClosed(port, host = '127.0.0.1') {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = createConnection({ host, port });
      socket.setTimeout(300);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(true);
      });
    });
    if (!open) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Сервер на порту ${port} ещё завершает работу. Проверьте его терминал.`);
}
