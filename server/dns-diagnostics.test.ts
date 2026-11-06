import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  dnsFailureHelp,
  readResolvConfig,
  resolvNameservers,
} from '../scripts/dns-diagnostics.mjs';
const original =
  'Could not lookup srv records on _v2-origintunneld._tcp.argotunnel.com: lookup _v2-origintunneld._tcp.argotunnel.com on [::1]:53: read udp [::1]:55542->[::1]:53: read: connection refused';
describe('Cloudflare DNS diagnostics', () => {
  it.skipIf(process.platform === 'win32')(
    'prints a repair command that actually produces two valid DNS records without executing sudo',
    () => {
      const help = dnsFailureHelp(original, 'darwin', {
        readable: true,
        missing: false,
        servers: [],
      });
      const command = help
        .split('\n')
        .find((line) => line.startsWith('printf '))
        .split(' | ')[0];
      const result = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(resolvNameservers(result.stdout)).toEqual(['1.1.1.1', '1.0.0.1']);
    },
  );
  it('does not issue a failing backup command for an absent file', () => {
    const help = dnsFailureHelp(original, 'darwin', {
      readable: false,
      missing: true,
      servers: [],
    });
    expect(help).toContain('не найден');
    expect(help).not.toContain('sudo cp');
  });

  it('recognizes nameservers with whitespace, comments and CRLF instead of assuming grep failure means an empty file', () => {
    expect(
      resolvNameservers(
        '# nameserver 9.9.9.9\n  nameserver 1.1.1.1 # primary\r\n\tnameserver 1.0.0.1\n nameserver 2606:4700:4700::1111\n nameserver invalid\n nameserver 1.1.1.1',
      ),
    ).toEqual(['1.1.1.1', '1.0.0.1', '2606:4700:4700::1111']);
  });
  it('gives the empty-file Mac fix with a backup for the exact reported error', () => {
    const help = dnsFailureHelp(original, 'darwin', {
      readable: true,
      missing: false,
      servers: [],
    });
    expect(help).toContain('нет действительных строк nameserver');
    expect(help).toContain('bunker-backup-');
    expect(help).toContain('sudo tee -a /etc/resolv.conf');
    expect(help).toContain('Публичная ссылка не запущена');
  });
  it('does not tell users to overwrite an existing working resolver or disable their VPN', () => {
    const help = dnsFailureHelp(original, 'darwin', {
      readable: true,
      missing: false,
      servers: ['1.1.1.1', '1.0.0.1'],
    });
    expect(help).toContain('локальному DNS');
    expect(help).not.toContain('sudo tee');
  });
  it('retains the exact DNS timeout and configured servers after nameserver records have been restored', () => {
    const failure =
      'Could not lookup srv records on _v2-origintunneld._tcp.argotunnel.com: lookup _v2-origintunneld._tcp.argotunnel.com on 1.1.1.1:53: read udp 192.168.1.5:55542->1.1.1.1:53: i/o timeout';
    const help = dnsFailureHelp(failure, 'darwin', {
      readable: true,
      missing: false,
      servers: ['1.1.1.1', '1.0.0.1'],
    });
    expect(help).toContain(failure);
    expect(help).toContain('DNS в /etc/resolv.conf: 1.1.1.1, 1.0.0.1');
    expect(help).not.toContain('sudo');
    expect(help).toContain('Публичная ссылка не запущена');
  });
  it('shows an API lookup failure without dumping unrelated tunnel settings or advertising an unregistered URL', () => {
    const failure =
      'failed to request quick Tunnel: lookup api.trycloudflare.com on 1.0.0.1:53: no such host';
    const help = dnsFailureHelp(
      `Settings: private setting\n| https://unregistered-example.trycloudflare.com |\n${failure}\nMetrics server stopped\n${failure}`,
      'darwin',
      { readable: true, missing: false, servers: ['1.0.0.1'] },
    );
    expect(help).toContain(failure);
    expect(help?.split(failure)).toHaveLength(2);
    expect(help).not.toContain('private setting');
    expect(help).not.toContain('unregistered-example');
    expect(help).not.toContain('sudo');
  });
  it('does not confuse an unreadable config with an empty one', () => {
    const help = dnsFailureHelp(original, 'darwin', {
      readable: false,
      missing: false,
      servers: [],
    });
    expect(help).not.toContain('sudo tee');
  });
  it('keeps managed Linux DNS policy intact and does not prescribe a Mac system-file write', () => {
    const help = dnsFailureHelp(
      'failed to request quick Tunnel: lookup api.trycloudflare.com on 172.31.0.1:53: connection refused',
      'linux',
      { readable: true, missing: false, servers: ['172.31.0.1'] },
    );
    expect(help).toContain('Проверьте доступность DNS');
    expect(help).not.toContain('sudo');
  });
  it('does not mislabel non-DNS failures', () =>
    expect(
      dnsFailureHelp('failed to request quick Tunnel: x509: certificate verify failed', 'darwin', {
        readable: true,
        missing: false,
        servers: [],
      }),
    ).toBeNull());
  it('reads the resolver without modifying it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bunker-resolv-')),
      file = path.join(dir, 'resolv.conf');
    try {
      const text = '# generated by macOS\n';
      await writeFile(file, text);
      expect(await readResolvConfig(file)).toEqual({ readable: true, missing: false, servers: [] });
      expect(await readFile(file, 'utf8')).toBe(text);
      expect(await readResolvConfig(file + '.missing')).toEqual({
        readable: false,
        missing: true,
        servers: [],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
