import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import {
  freePort,
  originsForDev,
  projectRoot,
  readPort,
  shutdownWith,
  spawnNode,
  stopChild,
  waitForApp,
  waitForPortClosed,
} from './runtime.mjs';

let vite, backend, listeningPort;
const stop = shutdownWith(async () => {
  await Promise.all([vite?.close(), stopChild(backend)]);
  if (listeningPort) await waitForPortClosed(listeningPort);
});
try {
  const requestedClient = readPort(process.env.CLIENT_PORT, 5173);
  const requestedServer = readPort(process.env.PORT, 3001);
  const host = process.env.HOST || '0.0.0.0';
  const serverPort = await freePort(requestedServer, host);
  const clientPort = await freePort(requestedClient, '0.0.0.0', [serverPort]);
  if (serverPort !== requestedServer)
    console.log(`[server] Порт ${requestedServer} занят, используем ${serverPort}.`);
  if (clientPort !== requestedClient)
    console.log(`[client] Порт ${requestedClient} занят, используем ${clientPort}.`);
  const target = `http://127.0.0.1:${serverPort}`;
  vite = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../client', import.meta.url)),
    server: {
      host: '0.0.0.0',
      port: clientPort,
      strictPort: true,
      proxy: { '/api': { target }, '/socket.io': { target, ws: true } },
    },
  });
  await vite.listen();
  const publicOrigins = originsForDev(vite.resolvedUrls, clientPort, process.env.PUBLIC_ORIGIN);
  backend = spawnNode([fileURLToPath(import.meta.resolve('tsx/cli')), 'watch', 'server/index.ts'], {
    PORT: String(serverPort),
    HOST: host,
    PUBLIC_ORIGIN: publicOrigins,
  });
  backend.once('error', (error) => {
    console.error('[server]', error.message);
    void stop(1);
  });
  backend.once('exit', (code) => void stop(code || 0));
  await waitForApp(target, backend);
  listeningPort = serverPort;
  console.log(`\n[client] Игра: http://localhost:${clientPort}`);
  console.log(`[server] API: ${target}\n`);
  vite.printUrls();
  console.log('\nДля друзей из другой сети: npm run share. Остановка: Ctrl+C.\n');
} catch (error) {
  console.error('[dev]', error.message);
  await stop(1);
}
