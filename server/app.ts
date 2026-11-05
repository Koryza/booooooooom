import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { codeSchema, difficulties, profileSchema } from '../shared/validation.js';
import type { Player, Session } from '../shared/types.js';
import { newState, newPlayer, log } from './state.js';
import { commandSchema } from './protocol.js';
import { Engine } from './engine.js';
import type { Snapshot, Store } from './store.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
type Runtime = Snapshot & { engine: Engine; lastEmpty: number };
export function createGameServer(store: Store, options: { tick?: boolean; origin?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const http = createServer(app);
  const allowedOrigins = (
    options.origin ||
    process.env.PUBLIC_ORIGIN ||
    'http://localhost:5173,http://localhost:3001'
  ).split(',');
  const io = new Server(http, {
    maxHttpBufferSize: 16_384,
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
    allowRequest: (req, cb) =>
      cb(null, !req.headers.origin || allowedOrigins.includes(req.headers.origin)),
  });
  const rooms = new Map<string, Runtime>();
  const loading = new Map<string, Promise<Runtime | null>>();
  const seats = new Map<string, Socket>();
  const rate = new Map<string, { count: number; since: number }>();
  let stopping = false;
  let persistenceError = false;
  function limited(key: string, max: number, interval: number) {
    const now = Date.now();
    let item = rate.get(key);
    if (!item || now - item.since > interval) {
      item = { count: 0, since: now };
      rate.set(key, item);
    }
    if (++item.count > max) throw new Error('Слишком много запросов. Подождите немного.');
  }
  async function load(code: string): Promise<Runtime | null> {
    if (rooms.has(code)) return rooms.get(code)!;
    if (loading.has(code)) return loading.get(code)!;
    const promise = (async () => {
      const snapshot = await store.load(code);
      if (!snapshot) return null;
      if (rooms.size >= 100) throw new Error('Сервер заполнен');
      for (const player of snapshot.state.players) {
        player.connected = false;
        player.path = [];
      }
      const runtime = { ...snapshot, engine: new Engine(snapshot.state), lastEmpty: Date.now() };
      rooms.set(code, runtime);
      return runtime;
    })();
    loading.set(code, promise);
    try {
      return await promise;
    } finally {
      loading.delete(code);
    }
  }
  function broadcast(room: Runtime) {
    io.to(room.state.code).emit('state', room.state);
  }
  async function save(room: Runtime, strict = false) {
    const prior = room.state.savedAt;
    room.state.savedAt = Date.now();
    room.state.saveError = false;
    try {
      await store.save({ state: room.state, tokens: room.tokens });
      persistenceError = [...rooms.values()].some((r) => r.state.saveError);
    } catch {
      room.state.savedAt = prior;
      room.state.saveError = true;
      persistenceError = true;
      console.error('Save failed for room', room.state.code);
      if (strict) throw new Error('Сохранение не удалось. Прогресс пока только в памяти сервера.');
    }
  }
  function current(socket: Socket): { room: Runtime; player: Player } {
    const room = rooms.get(socket.data.code);
    const player = room?.state.players.find((p) => p.id === socket.data.playerId);
    if (!room || !player || seats.get(player.id) !== socket)
      throw new Error('Сначала подключитесь к комнате');
    return { room, player };
  }
  async function attach(socket: Socket, room: Runtime, player: Player) {
    const previous = seats.get(player.id);
    if (previous && previous !== socket) previous.disconnect(true);
    socket.data.code = room.state.code;
    socket.data.playerId = player.id;
    seats.set(player.id, socket);
    player.connected = true;
    if (!room.state.players.some((p) => p.id === room.state.hostId && p.connected))
      room.state.hostId = player.id;
    await socket.join(room.state.code);
    broadcast(room);
  }
  io.on('connection', (socket) => {
    let requests = Promise.resolve();
    function on(name: string, fn: (data: unknown) => unknown | Promise<unknown>) {
      socket.on(name, (data, ack) => {
        if (typeof ack !== 'function') return;
        requests = requests.then(async () => {
          try {
            if (stopping) throw new Error('Сервер сохраняет прогресс и перезапускается');
            limited(socket.id, 80, 1000);
            const result = await fn(data);
            ack({ ok: true, data: result });
          } catch (e) {
            ack({
              ok: false,
              error:
                e instanceof z.ZodError
                  ? e.issues[0]?.message || 'Неверные данные'
                  : e instanceof Error
                    ? e.message
                    : 'Внутренняя ошибка',
            });
          }
        });
      });
    }
    function unattached() {
      if (socket.data.code) throw new Error('Вы уже в комнате. Сначала выйдите.');
    }
    on('create', async (data) => {
      unattached();
      limited('create:' + socket.handshake.address, 6, 60000);
      const parsed = z
        .object({ profile: profileSchema, difficulty: z.enum(difficulties) })
        .parse(data);
      if (rooms.size >= 100) throw new Error('Сервер заполнен');
      let code = '';
      do {
        code = Array.from(randomBytes(6), (n) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join(
          '',
        );
      } while (rooms.has(code) || (await store.load(code)));
      const state = newState(code, parsed.difficulty);
      const player = newPlayer(parsed.profile);
      state.players.push(player);
      state.hostId = player.id;
      log(state, `${player.name} открыл убежище. Код доступа: ${code}.`);
      const token = randomBytes(32).toString('hex');
      const room: Runtime = {
        state,
        tokens: { [player.id]: hash(token) },
        engine: new Engine(state),
        lastEmpty: Date.now(),
      };
      rooms.set(code, room);
      await save(room);
      await attach(socket, room, player);
      return { code, playerId: player.id, token } satisfies Session;
    });
    on('join', async (data) => {
      unattached();
      limited('join:' + socket.handshake.address, 30, 60000);
      const parsed = z.object({ code: codeSchema, profile: profileSchema }).parse(data);
      const room = await load(parsed.code);
      if (!room) throw new Error('Комната не найдена. Проверьте код.');
      if (room.state.phase === 'ended')
        throw new Error('Эта история завершена. Создайте новое убежище.');
      if (room.state.players.length >= 6) throw new Error('В комнате уже 6 выживших');
      const player = newPlayer(parsed.profile);
      room.state.players.push(player);
      const token = randomBytes(32).toString('hex');
      room.tokens[player.id] = hash(token);
      log(room.state, `${player.name} присоединился к убежищу.`);
      await attach(socket, room, player);
      await save(room);
      return { code: parsed.code, playerId: player.id, token } satisfies Session;
    });
    on('resume', async (data) => {
      unattached();
      limited('resume:' + socket.handshake.address, 40, 60000);
      const parsed = z
        .object({
          code: codeSchema,
          playerId: z.string().uuid(),
          token: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(data);
      const room = await load(parsed.code);
      const player = room?.state.players.find((p) => p.id === parsed.playerId);
      if (!room || !player || room.tokens[player.id] !== hash(parsed.token))
        throw new Error('Сессия недействительна. Подключитесь заново.');
      await attach(socket, room, player);
      return parsed;
    });
    on('profile', (data) => {
      const { room, player } = current(socket);
      if (room.state.phase !== 'lobby')
        throw new Error('Профессию можно изменить только до начала');
      Object.assign(player, profileSchema.parse(data), { ready: false });
      broadcast(room);
    });
    on('ready', (data) => {
      const { room, player } = current(socket);
      if (room.state.phase !== 'lobby') throw new Error('Игра уже началась');
      player.ready = z.boolean().parse(data);
      broadcast(room);
    });
    on('start', async () => {
      const { room, player } = current(socket);
      if (room.state.phase !== 'lobby' || room.state.hostId !== player.id)
        throw new Error('Только лидер может начать игру');
      if (!room.state.players.filter((p) => p.connected).every((p) => p.ready))
        throw new Error('Дождитесь готовности всех игроков');
      room.state.phase = 'playing';
      log(
        room.state,
        'Герметизация завершена. Держитесь вместе. Генератор нуждается в ремонте.',
        'story',
      );
      broadcast(room);
      await save(room);
    });
    on('chat', (data) => {
      limited('chat:' + socket.id, 4, 3000);
      const { room, player } = current(socket);
      const text = z.string().trim().min(1).max(240).parse(data);
      room.state.chat.push({
        id: randomBytes(8).toString('hex'),
        name: player.name,
        text,
        at: room.state.elapsed,
      });
      room.state.chat = room.state.chat.slice(-80);
      broadcast(room);
    });
    on('command', async (data) => {
      const { room, player } = current(socket);
      const cmd = commandSchema.parse(data);
      const challenge = room.engine.command(player, cmd);
      if (cmd.type !== 'move') {
        broadcast(room);
        await save(room);
      }
      return challenge;
    });
    on('save', async () => {
      const { room } = current(socket);
      await save(room, true);
      broadcast(room);
    });
    on('kick', async (data) => {
      const { room, player } = current(socket);
      const id = z.string().uuid().parse(data);
      if (room.state.phase !== 'lobby' || room.state.hostId !== player.id || id === player.id)
        throw new Error('Исключение доступно лидеру в лобби');
      room.state.players = room.state.players.filter((p) => p.id !== id);
      delete room.tokens[id];
      seats.get(id)?.emit('kicked');
      seats.get(id)?.disconnect(true);
      seats.delete(id);
      broadcast(room);
      await save(room);
    });
    on('leave', async () => {
      const { room, player } = current(socket);
      seats.delete(player.id);
      player.connected = false;
      player.path = [];
      if (room.state.phase === 'lobby') {
        room.state.players = room.state.players.filter((p) => p.id !== player.id);
        delete room.tokens[player.id];
      }
      if (room.state.hostId === player.id)
        room.state.hostId =
          room.state.players.find((p) => p.connected)?.id || room.state.players[0]?.id || '';
      await socket.leave(room.state.code);
      delete socket.data.code;
      delete socket.data.playerId;
      broadcast(room);
      await save(room);
    });
    socket.on('disconnect', () => {
      try {
        const { room, player } = current(socket);
        player.connected = false;
        player.path = [];
        seats.delete(player.id);
        if (room.state.hostId === player.id)
          room.state.hostId = room.state.players.find((p) => p.connected)?.id || player.id;
        if (!room.state.players.some((p) => p.connected)) room.lastEmpty = Date.now();
        broadcast(room);
        void save(room);
      } catch {
        /* Superseded connection or explicit leave. */
      }
      rate.delete(socket.id);
      rate.delete('chat:' + socket.id);
    });
  });
  let ticks = 0;
  const timer =
    options.tick === false
      ? undefined
      : setInterval(() => {
          ticks++;
          for (const room of rooms.values()) {
            if (room.state.players.some((p) => p.connected)) {
              room.engine.tick(0.1);
              if (ticks % 2 === 0) broadcast(room);
            }
          }
        }, 100);
  const autosave = setInterval(() => {
    for (const [code, room] of rooms) {
      void save(room).then(() => {
        if (
          !room.state.saveError &&
          !room.state.players.some((p) => p.connected) &&
          Date.now() - room.lastEmpty > 600000
        )
          rooms.delete(code);
      });
    }
    for (const [key, item] of rate) if (Date.now() - item.since > 60000) rate.delete(key);
  }, 10000);
  app.get('/api/health', (_req, res) =>
    res.status(persistenceError ? 503 : 200).json({
      ok: !persistenceError,
      game: 'BUNKER: LAST SHELTER',
      version: '0.1.0',
      storage: persistenceError ? 'error' : 'ready',
    }),
  );
  const clientPath = fileURLToPath(new URL('../../client', import.meta.url));
  if (import.meta.url.includes('/dist/') && existsSync(clientPath + '/index.html')) {
    app.use(express.static(clientPath, { index: false }));
    app.get('/{*path}', (_req, res) => res.sendFile(clientPath + '/index.html'));
  }
  return {
    http,
    io,
    rooms,
    async close() {
      stopping = true;
      clearInterval(timer);
      clearInterval(autosave);
      await Promise.all([...rooms.values()].map((r) => save(r, true)));
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await store.close();
    },
  };
}
