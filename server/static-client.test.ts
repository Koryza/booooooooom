import { afterAll, beforeAll, expect, it } from 'vitest';
import express from 'express';
import { createServer, request, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { compressClient } from '../scripts/compress-client.mjs';
import { staticClient } from './static-client.js';

const script = 'console.log("Бункер: загрузка публичного клиента");\n'.repeat(200);
const html =
  '<!doctype html><html lang="ru"><title>БУНКЕР</title><div id="root">Загрузка</div></html>';
const asset = '/assets/index-test1234.js';
let dir: string, base: string;
const app = express();
app.get('/api/health', (_req, res) => res.json({ ok: true }));
const server = createServer(app);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bunker-static-'));
  await mkdir(path.join(dir, 'assets'));
  await writeFile(path.join(dir, 'index.html'), html);
  await writeFile(path.join(dir, asset), script);
  await compressClient(dir);
  app.use(staticClient(dir));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});
function raw(url: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>(
    (resolve, reject) => {
      const req = request(new URL(url, base), { headers, method }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }),
        );
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    },
  );
}

it.each(['br', 'gzip', 'identity'])(
  'serves the identical script using %s with the correct MIME type and cache variant',
  async (encoding) => {
    const result = await raw(asset, { 'Accept-Encoding': encoding });
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toMatch(/javascript/);
    expect(result.headers.vary).toContain('Accept-Encoding');
    expect(result.headers['cache-control']).toContain('immutable');
    expect(Number(result.headers['content-length'])).toBe(result.body.length);
    const decoded =
      encoding === 'br'
        ? brotliDecompressSync(result.body)
        : encoding === 'gzip'
          ? gunzipSync(result.body)
          : result.body;
    expect(decoded.toString()).toBe(script);
    if (encoding === 'identity') expect(result.headers['content-encoding']).toBeUndefined();
    else {
      expect(result.headers['content-encoding']).toBe(encoding);
      expect(result.body.length).toBeLessThan(Buffer.byteLength(script));
    }
  },
);
it('honours encoding quality and explicitly disabled compression', async () => {
  expect(
    (await raw(asset, { 'Accept-Encoding': 'br;q=0.5, gzip;q=1' })).headers['content-encoding'],
  ).toBe('gzip');
  expect(
    (await raw(asset, { 'Accept-Encoding': 'br;q=0, gzip;q=0, identity' })).headers[
      'content-encoding'
    ],
  ).toBeUndefined();
});
it('sends compressed HTML with revalidation instead of an immutable page', async () => {
  const result = await raw('/', { 'Accept-Encoding': 'br' });
  expect(result.headers['content-type']).toMatch(/text\/html/);
  expect(result.headers['cache-control']).toBe('no-cache');
  expect(brotliDecompressSync(result.body).toString()).toBe(html);
  expect((await raw('/some/spa/route', { 'Accept-Encoding': 'identity' })).body.toString()).toBe(
    html,
  );
});
it('handles HEAD and range requests without mixing compressed and identity bytes', async () => {
  const head = await raw(asset, { 'Accept-Encoding': 'gzip' }, 'HEAD');
  expect(head.status).toBe(200);
  expect(head.body.length).toBe(0);
  expect(Number(head.headers['content-length'])).toBe(
    (await readFile(path.join(dir, asset + '.gz'))).length,
  );
  const partial = await raw(asset, { 'Accept-Encoding': 'br', Range: 'bytes=0-9' });
  expect(partial.status).toBe(206);
  expect(partial.headers['content-encoding']).toBeUndefined();
  expect(partial.body).toEqual(Buffer.from(script).subarray(0, 10));
});
it('revalidates the cached encoding variant without sending the asset again', async () => {
  const first = await raw(asset, { 'Accept-Encoding': 'br' });
  const second = await raw(asset, {
    'Accept-Encoding': 'br',
    'If-None-Match': String(first.headers.etag),
  });
  expect(second.status).toBe(304);
  expect(second.body.length).toBe(0);
  expect(second.headers.vary).toContain('Accept-Encoding');
});
it('returns 404 for missing scripts instead of substituting the SPA HTML', async () => {
  const result = await raw('/assets/not-found.js', { 'Accept-Encoding': 'br' });
  expect(result.status).toBe(404);
  expect(result.body.toString()).not.toContain('<title>БУНКЕР');
});
it('leaves API responses outside static-file compression', async () => {
  const result = await raw('/api/health', { 'Accept-Encoding': 'br' });
  expect(result.status).toBe(200);
  expect(result.headers['content-encoding']).toBeUndefined();
  expect(JSON.parse(result.body.toString())).toEqual({ ok: true });
});
