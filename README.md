# BUNKER: LAST SHELTER

Русскоязычная кооперативная браузерная игра о выживании в бункере. Проект в активной разработке; проверенное состояние — в [PROGRESS.md](PROGRESS.md).

## Разработка (Windows / macOS / Linux)

Установите Node.js 22.12+ и Git. В PowerShell или Terminal:

```sh
git clone https://github.com/Koryza/booooooooom.git
cd booooooooom
npm ci
npm run dev
```

Клиент: порт 5173, сервер: 3001. Для производства: `npm run build`, затем `npm start` (порт 3001, клиент и Socket.IO на одном origin).

```sh
npm test
npm run typecheck
npm run build
```

## Архитектура

- `client/`: React + Vite, Phaser 3 для карты.
- `server/`: Node.js, серверная симуляция, Socket.IO, проверка действий.
- `shared/`: типы протокола, каталог игровых систем, валидация.
- `prisma/`: PostgreSQL JSONB-снимки комнат и миграции.

По умолчанию локальный сервер не требует БД: сохранения в игнорируемом `data/`. Для PostgreSQL задайте `DATABASE_URL` и выполните `npm run db:deploy`. `.env` сам по себе Node не загружает: используйте переменные оболочки или `node --env-file=.env …`. Настоящие секреты в Git не добавлять.

Игровые механики, подключение друзей, публикация и ограничения будут описываться по мере реализации. Внешние графические ресурсы не используются: оформление и игровая графика создаются кодом проекта.
