import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dnsFailureHelp, readResolvConfig } from './dns-diagnostics.mjs';
import { fileURLToPath } from 'node:url';
import {
  freePort,
  projectRoot,
  quickTunnelUrl,
  readPort,
  readShareOptions,
  recentTunnelErrors,
  shutdownWith,
  spawnNode,
  stopChild,
  waitForApp,
} from './runtime.mjs';

let backend, tunnel, build, temporary;
let tunnelLog = '';
let verbose = false;
let protocol = 'auto';
const publicUrlState = { url: null, registered: false };
const stop = shutdownWith(async () => {
  await Promise.all([stopChild(tunnel), stopChild(backend), stopChild(build)]);
  if (temporary) await rm(temporary, { recursive: true, force: true });
});
try {
  ({ verbose, protocol } = readShareOptions(process.argv.slice(2)));
  const binary = process.env.CLOUDFLARED_PATH || 'cloudflared';
  const version = spawnSync(binary, ['--version'], {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  });
  if (version.error || version.status !== 0) {
    console.error('Для публичной ссылки установите официальный Cloudflare Tunnel один раз:\n');
    if (process.platform === 'darwin') console.error('  brew install cloudflared');
    else if (process.platform === 'win32')
      console.error('  winget install --id Cloudflare.cloudflared');
    else
      console.error(
        '  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
      );
    throw new Error('После установки повторите npm run share. Аккаунт Cloudflare не нужен.');
  }
  if (!process.env.npm_execpath) throw new Error('Запускайте через npm run share');
  console.log('Собираем игру для друзей…');
  build = spawnNode([process.env.npm_execpath, 'run', 'build']);
  await new Promise((resolve, reject) => {
    build.once('error', reject);
    build.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Сборка не прошла; публичная ссылка не запущена.')),
    );
  });
  const port = await freePort(readPort(process.env.PORT, 3001), '127.0.0.1');
  const local = `http://127.0.0.1:${port}`;
  temporary = await mkdtemp(path.join(tmpdir(), 'bunker-share-'));
  const config = path.join(temporary, 'config.yml');
  await writeFile(config, '{}\n', { mode: 0o600 });
  console.log('Получаем временный HTTPS-адрес Cloudflare…');
  console.log(`Транспорт Cloudflare: ${protocol}. Ожидаем подключение до 90 секунд.`);
  console.log('На запрос регистрации Cloudflare отводится до 30 секунд.');
  if (verbose)
    console.log(
      'Подробный журнал Cloudflare. Ссылка на игру появится в строке ИГРА ДЛЯ ДРУЗЕЙ после проверки готовности.',
    );
  tunnel = spawn(
    binary,
    [
      'tunnel',
      '--config',
      config,
      '--url',
      local,
      '--no-autoupdate',
      '--protocol',
      protocol,
      '--rpc-timeout',
      '30s',
      '--metrics',
      '127.0.0.1:0',
      ...(verbose ? ['--loglevel', 'debug'] : []),
    ],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  let tail = '';
  const publicUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error('Cloudflare не подтвердил подключение за 90 секунд. Проверьте журнал туннеля.'),
        ),
      90000,
    );
    const collect = (data) => {
      if (verbose) process.stderr.write(data);
      tail = (tail + data.toString()).slice(-16384);
      tunnelLog = tail;
      publicUrlState.url ||= quickTunnelUrl(tail);
      publicUrlState.registered ||= /Registered tunnel connection/.test(tail);
      if (publicUrlState.url && publicUrlState.registered) {
        clearTimeout(timeout);
        resolve(publicUrlState.url);
      }
    };
    tunnel.stdout.on('data', collect);
    tunnel.stderr.on('data', collect);
    tunnel.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    tunnel.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error('Cloudflare завершился до подтверждения подключения.'));
    });
  });
  const origins = [
    ...new Set([
      publicUrl,
      local,
      `http://localhost:${port}`,
      ...(process.env.PUBLIC_ORIGIN || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ]),
  ].join(',');
  backend = spawnNode([fileURLToPath(new URL('../dist/server/server/index.js', import.meta.url))], {
    PORT: String(port),
    HOST: '127.0.0.1',
    PUBLIC_ORIGIN: origins,
    NODE_ENV: process.env.NODE_ENV || 'development',
  });
  backend.once('error', (error) => {
    console.error('[server]', error.message);
    void stop(1);
  });
  backend.once('exit', (code) => void stop(code || 0));
  tunnel.once('exit', () => {
    console.error('Публичный туннель остановлен. Запустите npm run share заново.');
    void stop(1);
  });
  await waitForApp(local, backend);
  console.log('\n======================================================');
  console.log(`ИГРА ДЛЯ ДРУЗЕЙ: ${publicUrl}`);
  console.log('======================================================\n');
  console.log('Откройте эту ссылку, создайте комнату и скопируйте приглашение друзьям.');
  console.log('Друзья могут быть в любой сети, включая мобильный интернет.');
  console.log('Оставьте этот терминал и компьютер включёнными. Ctrl+C остановит игру.');
  console.log(
    'При следующем запуске адрес изменится. Для продолжения скачайте ключ своей сессии в настройках.\n',
  );
} catch (error) {
  const dnsHelp = dnsFailureHelp(
    tunnelLog || error.message,
    process.platform,
    await readResolvConfig(),
  );
  if (dnsHelp) console.error('[share]', dnsHelp);
  else {
    console.error('[share]', error.message);
    const details = recentTunnelErrors(tunnelLog);
    if (details) console.error('Сообщения Cloudflare:\n' + details);
    if (protocol !== 'quic' && /connection with edge closed/.test(tunnelLog))
      console.error(
        'Если проверка QUIC проходит, попробуйте: npm run share -- --protocol quic --verbose',
      );
    if (tunnelLog && !verbose) console.error('Полный журнал: npm run share -- --verbose');
  }
  await stop(1);
}
