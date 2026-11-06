import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';

export function resolvNameservers(contents) {
  return [
    ...new Set(
      contents.split(/\r?\n/).flatMap((line) => {
        const match = line.match(/^\s*nameserver\s+([^\s#;]+)/i);
        return match && isIP(match[1]) ? [match[1]] : [];
      }),
    ),
  ];
}

export async function readResolvConfig(path = '/etc/resolv.conf') {
  try {
    return {
      readable: true,
      missing: false,
      servers: resolvNameservers(await readFile(path, 'utf8')),
    };
  } catch (error) {
    return { readable: false, missing: error.code === 'ENOENT', servers: [] };
  }
}

export function dnsFailureHelp(log, platform, config) {
  if (!/(Could not lookup srv records|\blookup\s+\S+|\bno such host\b)/i.test(log)) return null;
  const refusedLocal = /(?:\[::1\]|127\.0\.0\.1):53/.test(log) && /connection refused/i.test(log);
  const noNameservers = config.missing || (config.readable && config.servers.length === 0);
  if (platform === 'darwin' && (refusedLocal || noNameservers)) {
    const message = [
      'Cloudflare не может найти DNS-записи туннеля.',
      ...(noNameservers
        ? [
            config.missing
              ? 'Файл /etc/resolv.conf не найден. Настройки DNS в окне macOS могут быть заданы отдельно.'
              : 'В /etc/resolv.conf нет действительных строк nameserver. Настройки DNS в окне macOS могут быть заданы отдельно.',
            'Резолвер Go, используемый Cloudflare для SRV, при этом пробует локальный DNS на 127.0.0.1 / ::1.',
            'Если вы уже выбрали 1.1.1.1 и 1.0.0.1 в настройках macOS, восстановите эти записи с резервной копией:',
            '',
            ...(config.missing
              ? []
              : [
                  'sudo cp -p /etc/resolv.conf "/etc/resolv.conf.bunker-backup-$(date +%Y%m%d-%H%M%S)" &&',
                ]),
            "printf '\\nnameserver 1.1.1.1\\nnameserver 1.0.0.1\\n' | sudo tee -a /etc/resolv.conf > /dev/null",
            "grep -E '^[[:space:]]*nameserver[[:space:]]' /etc/resolv.conf",
            'npm run share',
            '',
            'Это ручное изменение DNS-файла Mac. Скрипт игры его не меняет; не заменяйте им работающую DNS-конфигурацию VPN.',
          ]
        : [
            'Cloudflare обращается к локальному DNS на ::1 / 127.0.0.1, который отказал в соединении.',
            'Проверьте работу настроенного DNS/VPN-приложения. Не заменяйте файл, если DNS настроен специально.',
            "Проверка файла: grep -E '^[[:space:]]*nameserver[[:space:]]' /etc/resolv.conf",
          ]),
      'Публичная ссылка не запущена.',
    ];
    return message.join('\n');
  }
  return [
    'Cloudflare не смог разрешить DNS-имя службы туннеля.',
    'Проверьте доступность DNS и сети. Новая сборка игры сама по себе эту ошибку не исправит.',
    'Публичная ссылка не запущена.',
  ].join('\n');
}
