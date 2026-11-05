import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const app = express();
const http = createServer(app);
app.get('/api/health', (_req, res) => res.json({ ok: true, game: 'BUNKER: LAST SHELTER', version: '0.1.0' }));
const clientPath = fileURLToPath(new URL('../../client', import.meta.url));
if (existsSync(clientPath + '/index.html') && import.meta.url.includes('/dist/')) {
  app.use(express.static(clientPath));
  app.get('/{*path}', (_req, res) => res.sendFile(clientPath + '/index.html'));
}
http.listen(Number(process.env.PORT || 3001), process.env.HOST || '0.0.0.0', () => console.log('BUNKER server listening on', process.env.PORT || 3001));
