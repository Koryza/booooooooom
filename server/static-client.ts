import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

function cachePolicy(file: string) {
  return /(?:^|\/)assets\/[\w.-]+-[\w-]{6,}\.(?:js|css)$/.test(file)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

export function staticClient(root: string) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.vary('Accept-Encoding');
    const file = req.path === '/' ? 'index.html' : req.path.slice(1);
    if (file !== 'index.html' && !/^assets\/[\w.-]+\.(?:js|css)$/.test(file)) return next();
    if (req.headers.range) return next();
    const encoding = req.acceptsEncodings('br', 'gzip', 'identity');
    if (encoding !== 'br' && encoding !== 'gzip') return next();
    const compressed = file + (encoding === 'br' ? '.br' : '.gz');
    if (!existsSync(path.join(root, compressed))) return next();
    res.type(path.extname(file));
    res.set('Content-Encoding', encoding);
    res.set('Cache-Control', cachePolicy(file));
    res.sendFile(compressed, { root, acceptRanges: false, cacheControl: false });
  });
  router.use(
    express.static(root, {
      index: false,
      setHeaders: (res, file) =>
        res.setHeader(
          'Cache-Control',
          cachePolicy(path.relative(root, file).split(path.sep).join('/')),
        ),
    }),
  );
  // A missing script must fail as a script request, rather than receive the SPA HTML.
  router.use('/assets', (_req, res) => res.sendStatus(404));
  router.get('/{*path}', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile('index.html', { root, cacheControl: false });
  });
  return router;
}
