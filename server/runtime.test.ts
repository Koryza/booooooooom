import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import {
  freePort,
  localhostRunUrl,
  originsForDev,
  quickTunnelUrl,
  readPort,
  readShareOptions,
  recentTunnelErrors,
  sshTunnelArgs,
} from '../scripts/runtime.mjs';

describe('startup addresses', () => {
  it('uses automatic tunnel transport and allows an explicit QUIC or HTTP/2 selection', () => {
    expect(readShareOptions([])).toEqual({
      provider: 'cloudflare',
      protocol: 'auto',
      verbose: false,
    });
    expect(readShareOptions(['--protocol', 'quic', '--verbose'])).toEqual({
      provider: 'cloudflare',
      protocol: 'quic',
      verbose: true,
    });
    expect(readShareOptions(['--protocol=http2'])).toEqual({
      provider: 'cloudflare',
      protocol: 'http2',
      verbose: false,
    });
    expect(readShareOptions(['--provider', 'localhostrun'])).toEqual({
      provider: 'localhostrun',
      protocol: 'auto',
      verbose: false,
    });
  });
  it('rejects invalid or missing protocol values rather than silently forcing HTTP/2', () => {
    expect(() => readShareOptions(['--protocol', 'tcp'])).toThrow('auto, quic или http2');
    expect(() => readShareOptions(['--protocol'])).toThrow();
    expect(() => readShareOptions(['--protokol', 'quic'])).toThrow();
    expect(() => readShareOptions(['--provider', 'unknown'])).toThrow(
      'cloudflare или localhostrun',
    );
    expect(() => readShareOptions(['--provider', 'localhostrun', '--protocol', 'quic'])).toThrow(
      'Параметр --protocol',
    );
  });
  it('routes the SSH gateway to the selected loopback port with host verification and without key or password authentication', () => {
    const args = sshTunnelArgs(3012);
    expect(args).toContain('80:127.0.0.1:3012');
    expect(args.at(-1)).toBe('nokey@localhost.run');
    for (const option of [
      'StrictHostKeyChecking=ask',
      'ExitOnForwardFailure=yes',
      'ForwardAgent=no',
      'PubkeyAuthentication=no',
      'PasswordAuthentication=no',
      'KbdInteractiveAuthentication=no',
    ])
      expect(args).toContain(option);
    expect(() => sshTunnelArgs('3012:otherhost')).toThrow('Порт');
  });
  it('accepts the HTTPS address from a confirmed localhost.run forwarding message', () => {
    expect(
      localhostRunUrl(
        'sample-name.lhr.life tunneled with tls termination, https://sample-name.lhr.life\r\n',
      ),
    ).toBe('https://sample-name.lhr.life');
    expect(
      localhostRunUrl(
        '\x1b[32msample-name.localhost.run tunneled with tls termination, https://sample-name.localhost.run\x1b[0m',
      ),
    ).toBe('https://sample-name.localhost.run');
  });
  it('does not treat documentation, an unconfirmed address, HTTP or lookalike domains as SSH tunnel readiness', () => {
    for (const log of [
      'https://admin.localhost.run',
      'https://sample-name.lhr.life',
      'sample tunneled with tls termination, http://sample-name.lhr.life',
      'sample tunneled with tls termination, https://sample-name.lhr.life.evil.example',
      'sample tunneled with tls termination, https://other.example',
    ])
      expect(localhostRunUrl(log)).toBeNull();
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
