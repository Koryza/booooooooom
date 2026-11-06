import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import {
  freePort,
  originsForDev,
  quickTunnelUrl,
  readPort,
  readShareOptions,
  recentTunnelErrors,
} from '../scripts/runtime.mjs';

describe('startup addresses', () => {
  it('uses automatic tunnel transport and allows an explicit QUIC or HTTP/2 selection', () => {
    expect(readShareOptions([])).toEqual({ protocol: 'auto', verbose: false });
    expect(readShareOptions(['--protocol', 'quic', '--verbose'])).toEqual({
      protocol: 'quic',
      verbose: true,
    });
    expect(readShareOptions(['--protocol=http2'])).toEqual({ protocol: 'http2', verbose: false });
  });
  it('rejects invalid or missing protocol values rather than silently forcing HTTP/2', () => {
    expect(() => readShareOptions(['--protocol', 'tcp'])).toThrow('auto, quic или http2');
    expect(() => readShareOptions(['--protocol'])).toThrow();
    expect(() => readShareOptions(['--protokol', 'quic'])).toThrow();
  });
  it('keeps the edge connection cause before shutdown messages without dumping settings', () => {
    const cause = '2026-11-06T16:25:13Z ERR TLS handshake failed: remote error';
    const log = [
      'INF Settings: private configuration',
      cause,
      'ERR Initiating shutdown error="connection with edge closed"',
      'INF Metrics server stopped',
      'connection with edge closed',
    ].join('\n');
    expect(recentTunnelErrors(log)).toContain(cause);
    expect(recentTunnelErrors(log)).toContain('connection with edge closed');
    expect(recentTunnelErrors(log)).not.toContain('private configuration');
    expect(recentTunnelErrors(log)).not.toContain('Metrics server stopped');
  });
  it('chooses a free port without closing an existing listener', async () => {
    const busy = createServer();
    await new Promise<void>((resolve) => busy.listen(0, '0.0.0.0', resolve));
    try {
      const port = (busy.address() as { port: number }).port;
      expect(await freePort(port, '0.0.0.0', [port + 1])).toBeGreaterThan(port + 1);
      expect(busy.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve) => busy.close(() => resolve()));
    }
  });
  it('validates explicitly selected ports', () => {
    expect(readPort(undefined, 5173)).toBe(5173);
    expect(readPort('5174', 5173)).toBe(5174);
    for (const input of ['0', '65536', '5173.5', 'hello'])
      expect(() => readPort(input, 5173)).toThrow('Порт');
  });
  it('allows only exact selected frontend origins and preserves configured hosts', () => {
    const origins = originsForDev(
      { local: ['http://localhost:5174/'], network: ['http://192.168.1.2:5174/'] },
      5174,
      ' https://bunker.example, http://localhost:5174 ',
    );
    expect(origins.split(',')).toEqual([
      'https://bunker.example',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://192.168.1.2:5174',
    ]);
    expect(origins).not.toContain('*');
    expect(origins).not.toContain('5173');
  });
  it('extracts an actual Quick Tunnel address rather than documentation or lookalike hosts', () => {
    expect(quickTunnelUrl('https://developers.cloudflare.com/')).toBeNull();
    expect(quickTunnelUrl('| https://four-random-words-here.trycloudflare.com |')).toBe(
      'https://four-random-words-here.trycloudflare.com',
    );
    expect(quickTunnelUrl('http://local.trycloudflare.com')).toBeNull();
    expect(quickTunnelUrl('https://host.trycloudflare.com.evil.example ')).toBeNull();
  });
});
