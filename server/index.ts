import { createGameServer } from './app.js';
import { openStore } from './store.js';
const game = createGameServer(await openStore());
game.http.listen(Number(process.env.PORT || 3001), process.env.HOST || '0.0.0.0', () =>
  console.log('BUNKER server listening on', process.env.PORT || 3001),
);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => process.exit(1), 10000);
    timer.unref();
    void game
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
