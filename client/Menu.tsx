import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Dices,
  DoorOpen,
  LockKeyhole,
  Users,
  Shuffle,
  Clock3,
} from 'lucide-react';
import { Avatar, Brand } from './components';
import type { GameConnection } from './network';
import type { Session } from '../shared/types';
export function Menu({ game }: { game: GameConnection }) {
  const invitation = new URLSearchParams(location.search).get('room') || '';
  const [tab, setTab] = useState<'create' | 'join'>(invitation ? 'join' : 'create');
  const [name, setName] = useState(''),
    [code, setCode] = useState(invitation),
    [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    game.setError('');
    try {
      await game.enter(tab, { profile: { name }, ...(tab === 'join' ? { code } : {}) });
    } catch (e) {
      game.setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="menu-shell">
      <header className="topbar">
        <Brand />
        <span className="top-note">СОЦИАЛЬНАЯ КАРТОЧНАЯ ИГРА</span>
        <div className="connection">
          <i className={game.connected ? 'online' : ''} />
          {game.connected ? 'Связь установлена' : 'Соединяемся…'}
        </div>
      </header>
      <main className="menu-main">
        <section className="menu-hero">
          <span className="eyebrow">
            <span /> МЕСТ ХВАТИТ НЕ ВСЕМ
          </span>
          <h1>
            Снаружи — конец.
            <br />
            Внутри — <em>вопрос.</em>
          </h1>
          <p className="hero-copy">
            Кого вы возьмёте с собой в новый мир?
            <br />
            Случайный персонаж. Неудобные секреты.
            <br />И одно общее решение.
          </p>
          <div className="hero-badges">
            <span>
              <Users size={15} /> 2–12 друзей
            </span>
            <span>
              <Dices size={15} /> Всё решает раздача
            </span>
            <span>
              <LockKeyhole size={15} /> Тайные карты
            </span>
          </div>
          <div className="card-fan" aria-label="Примеры карточек персонажа">
            <div className="fan-card card-back">
              <span>БУНКЕР</span>
              <div className="card-back-symbol">Б</div>
              <small>ЧТО ВЫ СКРЫВАЕТЕ?</small>
            </div>
            <div className="fan-card fact-example">
              <small>БАГАЖ / ПРИМЕР</small>
              <Dices size={34} />
              <h3>
                Мешок
                <br />
                картофеля
              </h3>
              <p>
                Съесть, посадить
                <br />
                или убедить остальных.
              </p>
              <span>06 / 08</span>
            </div>
            <div className="fan-card profession-example">
              <small>ПРОФЕССИЯ / ПРИМЕР</small>
              <div className="example-symbol">✳</div>
              <h3>Хирург</h3>
              <p>
                9 лет практики.
                <br />
                Нужен в любом новом мире.
              </p>
              <span>01 / 08</span>
            </div>
          </div>
          <div className="menu-tagline">
            <span>ОТКРОЙТЕ КАРТЫ.</span>
            <span>ЗАЩИТИТЕ СВОЁ МЕСТО.</span>
          </div>
        </section>
        <section className="entry-panel">
          <div className="panel-label">
            <DoorOpen size={17} />
            <span>ПО ТУ СТОРОНУ ДВЕРИ</span>
            <small>№ 07</small>
          </div>
          <div className="entry-tabs">
            <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
              Создать комнату
            </button>
            <button className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}>
              Войти по коду
            </button>
          </div>
          <form onSubmit={submit}>
            <span className="eyebrow">ВАША ИСТОРИЯ НАЧНЁТСЯ СЛУЧАЙНО</span>
            <h2>{tab === 'create' ? 'Соберите своих.' : 'Вас ждут за столом.'}</h2>
            <p>
              {tab === 'create'
                ? 'Пригласите друзей. Раздадим роли, а дальше — убеждайте.'
                : 'Введите код комнаты. Карты раздаются после начала партии.'}
            </p>
            <label className="field">
              КАК ВАС ЗОВУТ?
              <input
                required
                minLength={2}
                maxLength={18}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Имя или позывной"
                autoComplete="nickname"
              />
            </label>
            {tab === 'join' && (
              <label className="field">
                КОД КОМНАТЫ
                <input
                  className="code-input"
                  required
                  minLength={6}
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC234"
                />
              </label>
            )}
            <div className="random-promise">
              <Shuffle size={21} />
              <div>
                <b>Выбираете только имя.</b>
                <p>
                  Профессию, биологию, здоровье, особенности и спецкарты случайно выдаст сервер.
                </p>
              </div>
            </div>
            <button
              className="button primary full"
              disabled={!game.connected || pending || game.recovering}
            >
              {pending || game.recovering
                ? 'Соединяемся…'
                : tab === 'create'
                  ? 'Создать комнату'
                  : 'Присоединиться'}
              <ArrowRight size={18} />
            </button>
            <small className="entry-footnote">
              Друзья подключаются по ссылке. Регистрация не нужна.
            </small>
          </form>
          <label className="import-key">
            Продолжить по ключу сессии
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 2048) throw new Error('Неверный файл ключа');
                  const session = JSON.parse(await file.text()) as Session;
                  await game.send('resume', session);
                  game.remember(session);
                } catch (error) {
                  game.setError((error as Error).message);
                }
              }}
            />
          </label>
        </section>
      </main>
      <footer className="menu-footer">
        <span>8 ХАРАКТЕРИСТИК + 2 СПЕЦКАРТЫ</span>
        <span>ВАША ПРОФЕССИЯ — ЕЩЁ НЕ ВСЁ О ВАС.</span>
        <span>БУНКЕР · 0.2</span>
      </footer>
    </div>
  );
}
export function Lobby({ game }: { game: GameConnection }) {
  const s = game.state!,
    me = s.players.find((p) => p.id === s.self.playerId)!,
    host = me.id === s.hostId;
  const [copied, setCopied] = useState(false),
    [pending, setPending] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/?room=${s.code}`);
      setCopied(true);
    } catch {
      game.setNotice(`Код комнаты: ${s.code}`);
    }
  }
  async function start() {
    setPending(true);
    try {
      await game.send('start');
    } catch (e) {
      game.setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="lobby-shell">
      <header className="topbar">
        <Brand />
        <span className="top-note">ЛОББИ / РАЗДАЧА ЕЩЁ НЕ НАЧАЛАСЬ</span>
        <button
          className="button ghost"
          onClick={() => void game.leave().catch((e) => game.setError(e.message))}
        >
          Выйти
        </button>
      </header>
      <div className="lobby-title">
        <div>
          <span className="eyebrow">ДО ТОГО, КАК ЗАКРОЮТ ДВЕРЬ</span>
          <h1>Кто сегодня за столом?</h1>
          <p>У каждого будет новая случайная жизнь. Подготовьтесь её защищать.</p>
        </div>
        <button className="invite-code" onClick={copy}>
          <small>ПРИГЛАСИТЬ ДРУЗЕЙ</small>
          <b>{s.code}</b>
          <span>
            {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
            {copied ? 'Ссылка скопирована' : 'Копировать ссылку'}
          </span>
        </button>
      </div>
      <main className="lobby-layout">
        <section className="panel">
          <header className="section-head">
            <h2>Участники</h2>
            <span className="badge">{s.players.length} / 12</span>
          </header>
          <div className="lobby-players">
            {s.players.map((p) => (
              <div className="lobby-player" key={p.id}>
                <Avatar avatar={p.avatar} />
                <div>
                  <b>
                    {p.name} {p.id === me.id && <small>ВЫ</small>}
                  </b>
                  <span>
                    {p.id === s.hostId ? 'Ведущий' : 'Участник'} ·{' '}
                    {p.connected ? (p.ready ? 'Готов к раздаче' : 'Выбирает момент') : 'Нет связи'}
                  </span>
                </div>
                <span className={'status-mark ' + (p.ready ? 'is-ready' : '')}>
                  {p.ready ? <Check size={17} /> : <Clock3 size={17} />}
                </span>
                {host && p.id !== me.id && (
                  <button className="text-button" onClick={() => void game.act('kick', p.id)}>
                    Убрать
                  </button>
                )}
              </div>
            ))}
            {s.players.length < 3 && (
              <div className="empty-chair">
                <Users size={23} />
                <p>
                  Здесь может быть ваш друг.
                  <br />
                  <small>Отправьте ему приглашение.</small>
                </p>
              </div>
            )}
          </div>
          <div className="lobby-buttons">
            <button
              className={'button ' + (me.ready ? 'secondary' : 'primary')}
              onClick={() => void game.act('ready', !me.ready)}
            >
              {me.ready ? '✓ Готов · отменить' : 'Я готов'}
            </button>
            {host && (
              <button
                className="button primary"
                disabled={
                  pending || s.players.length < 2 || !s.players.every((p) => p.ready && p.connected)
                }
                onClick={() => void start()}
              >
                Раздать случайные карты
                <Dices size={17} />
              </button>
            )}
          </div>
          <p className="small-note">
            Нужно минимум 2 участника. Все должны быть подключены и готовы.
          </p>
        </section>
        <aside>
          <section className="panel">
            <header className="section-head">
              <h2>Условия партии</h2>
              <DoorOpen size={17} />
            </header>
            <div className="padded settings-grid">
              <label className="field">
                МЕСТА В БУНКЕРЕ
                <select
                  aria-label="Места в бункере"
                  disabled={!host}
                  value={s.settings.seats ?? 'auto'}
                  onChange={(e) =>
                    void game.act('settings', {
                      ...s.settings,
                      seats: e.target.value === 'auto' ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="auto">Половина участников (автоматически)</option>
                  {Array.from({ length: Math.max(1, s.players.length - 1) }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1} мест(а)
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                ОБСУЖДЕНИЕ КАЖДОГО РАУНДА
                <select
                  disabled={!host}
                  value={s.settings.discussionSeconds}
                  onChange={(e) =>
                    void game.act('settings', {
                      ...s.settings,
                      discussionSeconds: Number(e.target.value),
                    })
                  }
                >
                  {[30, 60, 90, 120, 180, 300].map((n) => (
                    <option value={n} key={n}>
                      {n} секунд
                    </option>
                  ))}
                </select>
              </label>
              <div className="lobby-rule">
                <Shuffle size={20} />
                <p>
                  Назначить себе профессию или характеристики нельзя. Всё выдаётся случайно после
                  старта; чужие закрытые карты сервер не передаёт.
                </p>
              </div>
            </div>
          </section>
          <section className="how-panel">
            <span className="eyebrow">ПАРТИЯ В ЧЕТЫРЕ ШАГА</span>
            {[
              ['01', 'Получите персонажа', 'Профессия, 7 характеристик и 2 спецкарты.'],
              ['02', 'Откройте одну карту', 'Решите, какой факт о себе рассказать сейчас.'],
              ['03', 'Обсудите состав', 'Объясните, зачем нужны именно вы.'],
              ['04', 'Проголосуйте', 'Один участник выбывает. Остальные продолжают.'],
            ].map(([n, title, desc]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <b>{title}</b>
                  <p>{desc}</p>
                </div>
              </div>
            ))}
          </section>
        </aside>
      </main>
    </div>
  );
}
