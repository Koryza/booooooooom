import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Biohazard,
  CloudSnow,
  Waves,
  Zap,
  Orbit,
  Check,
  ChevronRight,
  Copy,
  DoorClosed,
  DoorOpen,
  Eye,
  FileText,
  Flag,
  HelpCircle,
  Hourglass,
  LockKeyhole,
  MessageCircle,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  Vote,
  X,
} from 'lucide-react';
import { AVATAR_COLORS, CATEGORY_INFO, SPECIAL_INFO } from '../shared/catalog';
import {
  CATEGORIES,
  type Category,
  type GameCommand,
  type GameState,
  type PublicPlayer,
  type SpecialCard,
} from '../shared/types';
import type { GameConnection } from './network';
import { Avatar, Brand, CategoryIcon, HiddenCard, Modal } from './components';
import { alarm, unlockAudio } from './audio';
const PHASE_LABEL = {
  lobby: 'Лобби',
  reveal: 'Раскрытие карт',
  discussion: 'Обсуждение',
  voting: 'Тайное голосование',
  results: 'Результат раунда',
  ended: 'Состав выбран',
};
const DISASTER_ICONS = {
  infection: Biohazard,
  winter: CloudSnow,
  flood: Waves,
  storm: Zap,
  spores: Biohazard,
  impact: Orbit,
};
function Dossier({ player, onClose }: { player: PublicPlayer; onClose: () => void }) {
  return (
    <Modal title={`Общее досье: ${player.name}`} onClose={onClose}>
      <div className="padded">
        <p className="muted">Здесь только открытые для стола характеристики.</p>
        <div className="dossier-grid">
          {CATEGORIES.map((category) => (
            <article key={category}>
              <span className="eyebrow">
                <CategoryIcon category={category} size={14} />
                {CATEGORY_INFO[category].name}
              </span>
              {player.cards[category] ? (
                <>
                  <h3>{player.cards[category].title}</h3>
                  <p>{player.cards[category].detail}</p>
                </>
              ) : (
                <div className="dossier-locked">
                  <LockKeyhole size={21} />
                  <p>Карта не раскрыта</p>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </Modal>
  );
}
function SpecialDialog({
  special,
  state: s,
  pending,
  onPlay,
  onClose,
}: {
  special: SpecialCard;
  state: GameState;
  pending: boolean;
  onPlay: (command: GameCommand) => Promise<boolean>;
  onClose: () => void;
}) {
  const info = SPECIAL_INFO[special.kind],
    others = s.players.filter((p) => !p.eliminated && p.id !== s.self.playerId);
  const [targetId, setTargetId] = useState(others[0]?.id || '');
  const target = others.find((p) => p.id === targetId),
    hidden = CATEGORIES.filter((c) => !target?.cards[c]);
  const [category, setCategory] = useState<Category>(hidden[0] || 'biology');
  return (
    <Modal title={info.name} onClose={onClose}>
      <div className="padded">
        <div className="special-dialog-icon">
          <Sparkles size={32} />
        </div>
        <p className="special-description">{info.text}</p>
        <p className="muted">
          Одно применение за партию. За раунд можно сыграть только одну спецкарту.
        </p>
        {info.target && (
          <label className="field">
            УЧАСТНИК
            <select
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                const p = others.find((p) => p.id === e.target.value);
                setCategory(CATEGORIES.find((c) => !p?.cards[c]) || 'biology');
              }}
            >
              {others.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {info.category && (
          <label className="field">
            ЗАКРЫТАЯ ХАРАКТЕРИСТИКА
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {hidden.map((c) => (
                <option value={c} key={c}>
                  {CATEGORY_INFO[c].name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="button primary full"
          disabled={
            pending || (info.target && !target) || (info.category && !hidden.includes(category))
          }
          onClick={() =>
            void onPlay({
              type: 'special',
              cardId: special.id,
              ...(info.target ? { targetId } : {}),
              ...(info.category ? { category } : {}),
            }).then((ok) => {
              if (ok) onClose();
            })
          }
        >
          Сыграть спецкарту
          <Sparkles size={16} />
        </button>
      </div>
    </Modal>
  );
}
export function GameScreen({ game }: { game: GameConnection }) {
  const s = game.state!,
    me = s.players.find((p) => p.id === s.self.playerId)!,
    active = s.players.filter((p) => !p.eliminated),
    isHost = s.hostId === me.id;
  const [pending, setPending] = useState(false),
    [modal, setModal] = useState<'settings' | 'help' | null>(null),
    [dossier, setDossier] = useState<string | null>(null),
    [special, setSpecial] = useState<SpecialCard | null>(null);
  const [message, setMessage] = useState(''),
    [chatTab, setChatTab] = useState<'chat' | 'log'>('chat'),
    [sound, setSound] = useState(false),
    [copied, setCopied] = useState(false);
  const lastResult = useRef(s.lastVote?.eliminatedId);
  useEffect(() => {
    if (sound && s.lastVote?.eliminatedId && lastResult.current !== s.lastVote.eliminatedId)
      alarm(false);
    lastResult.current = s.lastVote?.eliminatedId;
  }, [s.lastVote?.eliminatedId, sound]);
  async function command(cmd: GameCommand) {
    setPending(true);
    game.setError('');
    try {
      await game.send('command', cmd);
      return true;
    } catch (e) {
      game.setError((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }
  const DisasterIcon = DISASTER_ICONS[s.scenario?.id as keyof typeof DISASTER_ICONS] || Biohazard;
  const remaining = Math.max(0, Math.ceil((s.phaseEndsAt || s.clock) - s.clock));
  const revealed = Object.values(me.cards).filter(Boolean).length;
  const instructions =
    s.phase === 'reveal'
      ? me.eliminated
        ? 'Вы наблюдаете. Участники открывают по одной карте.'
        : me.revealedRound === s.round
          ? 'Ваша карта раскрыта. Послушайте, что расскажут остальные.'
          : 'Выберите одну характеристику из своего досье и откройте её всем.'
      : s.phase === 'discussion'
        ? 'Говорите, спорьте, находите союзников. Чья история убедительнее?'
        : s.phase === 'voting'
          ? 'Выберите, кто покинет состав. Ваш выбор скрыт до подсчёта.'
          : s.phase === 'results'
            ? 'Один стул опустел. История остальных продолжается.'
            : 'Вы решили, кто получит место в новом мире.';
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/?room=${s.code}`);
      setCopied(true);
    } catch {
      game.setNotice(`Код комнаты: ${s.code}`);
    }
  }
  return (
    <div className="table-shell" data-phase={s.phase} data-round={s.round}>
      <header className="topbar table-topbar">
        <Brand />
        <button className="room-code" onClick={copy}>
          <span>КОМНАТА</span>
          <b>{s.code}</b>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <span className="table-mode">КАРТОЧНАЯ ПАРТИЯ · {s.players.length} УЧАСТНИКОВ</span>
        <div className="top-tools">
          <button
            className="icon-button"
            title="Правила"
            aria-label="Правила"
            onClick={() => setModal('help')}
          >
            <HelpCircle size={18} />
          </button>
          <button
            className="icon-button"
            title="Настройки"
            aria-label="Настройки"
            onClick={() => setModal('settings')}
          >
            <Settings size={18} />
          </button>
        </div>
      </header>
      <section className="round-heading">
        <div>
          <span className="eyebrow">
            <span /> ПАРТИЯ {String(s.match).padStart(2, '0')} / РАУНД{' '}
            {String(s.round).padStart(2, '0')}
          </span>
          <h1>
            {s.phase === 'ended'
              ? 'Дверь закрывается.'
              : s.phase === 'voting'
                ? 'Кому не хватит места?'
                : s.phase === 'discussion'
                  ? 'У каждого есть аргумент.'
                  : s.phase === 'results'
                    ? 'Группа сделала выбор.'
                    : 'Что вы расскажете о себе?'}
          </h1>
          <p>{instructions}</p>
        </div>
        <div className="round-status">
          <div className="phase-name">
            <i />
            {PHASE_LABEL[s.phase]}
          </div>
          {s.phase !== 'ended' && (
            <div className={'countdown ' + (remaining < 15 ? 'urgent' : '')}>
              <Hourglass size={17} />
              <b>
                {String(Math.floor(remaining / 60)).padStart(2, '0')}:
                {String(remaining % 60).padStart(2, '0')}
              </b>
            </div>
          )}
          <span>
            {s.players.some((p) => p.connected)
              ? 'Время идёт, пока хотя бы один участник в сети'
              : 'Партия на паузе'}
          </span>
        </div>
      </section>
      {s.phase === 'ended' && (
        <section className="finale-banner">
          <div className="finale-seal">
            <DoorClosed size={31} />
          </div>
          <div className="grow">
            <span className="eyebrow">ПРАВО НА БУДУЩЕЕ</span>
            <h2>
              В бункере остаются{' '}
              {s.winners.map((id) => s.players.find((p) => p.id === id)?.name).join(', ')}.
            </h2>
            <p>
              Состав выбран голосованием. Все характеристики открыты — время обсудить, что вы не
              успели узнать.
            </p>
          </div>
          {isHost ? (
            <button
              className="button primary"
              disabled={pending}
              onClick={() => void command({ type: 'rematch' })}
            >
              Новая случайная раздача
              <ArrowRight size={16} />
            </button>
          ) : (
            <span className="muted">Ведущий может начать новую партию.</span>
          )}
        </section>
      )}
      {(s.phase === 'results' || (s.phase === 'voting' && s.ballot === 2)) && s.lastVote && (
        <section className="result-banner">
          <Flag size={23} />
          <div className="grow">
            <h3>
              {s.lastVote.eliminatedId
                ? `${s.players.find((p) => p.id === s.lastVote!.eliminatedId)?.name} покидает состав`
                : 'Равенство голосов — переголосование'}
            </h3>
            <p>
              {Object.entries(s.lastVote.counts)
                .map(([id, count]) => `${s.players.find((p) => p.id === id)?.name}: ${count}`)
                .join(' · ')}
              {s.lastVote.lottery ? ' · После повторной ничьей применён случайный жребий.' : ''}
            </p>
          </div>
          {s.phase === 'results' && isHost && (
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => void command({ type: 'nextRound' })}
            >
              Следующий раунд
              <ChevronRight size={15} />
            </button>
          )}
        </section>
      )}
      <main className="table-layout">
        <aside className="scenario-column">
          <section className="scenario-card">
            <div className="scenario-art">
              <span className="eyebrow">КАТАСТРОФА / {s.scenario?.id.toUpperCase()}</span>
              <div className="hazard-symbol">
                <DisasterIcon size={70} strokeWidth={1} />
              </div>
              <span className="scenario-stamp">МИР БОЛЬШЕ НЕ ПРЕЖНИЙ</span>
            </div>
            <div className="padded">
              <h2>{s.scenario?.title}</h2>
              <p>{s.scenario?.description}</p>
              <details>
                <summary>Что ждёт на поверхности?</summary>
                <p>{s.scenario?.outside}</p>
              </details>
            </div>
          </section>
          <section className="panel shelter-panel">
            <header className="section-head">
              <h2>Наше убежище</h2>
              <DoorOpen size={18} />
            </header>
            <div className="shelter-seats">
              <b>{s.seats}</b>
              <div>
                <span>МЕСТ В БУНКЕРЕ</span>
                <small>Претендентов осталось: {active.length}</small>
              </div>
            </div>
            <div className="shelter-numbers">
              <div>
                <b>
                  {s.scenario?.shelter.area}
                  <small>м²</small>
                </b>
                <span>ПЛОЩАДЬ</span>
              </div>
              <div>
                <b>
                  {s.scenario?.shelter.months}
                  <small>мес.</small>
                </b>
                <span>ИЗОЛЯЦИЯ</span>
              </div>
            </div>
            <div className="padded shelter-features">
              <span className="eyebrow">ВНУТРИ ЕСТЬ</span>
              {s.scenario?.shelter.features.map((f) => (
                <p key={f}>
                  <Check size={12} />
                  {f}
                </p>
              ))}
              <p>
                <Check size={12} />
                Еда на {s.scenario?.shelter.foodMonths} месяцев
              </p>
              <div className="shelter-warning">
                <Radio size={15} />
                <p>{s.scenario?.shelter.problem}</p>
              </div>
            </div>
          </section>
          <p className="scenario-note">
            Условия убежища — ваши аргументы в обсуждении. Итоговый состав выбираете вы.
          </p>
        </aside>
        <section className="players-column">
          <div className="table-section-title">
            <h2>За общим столом</h2>
            <span>
              <Users size={14} /> {active.length} в игре · {s.players.length - active.length}{' '}
              наблюдают
            </span>
          </div>
          <div className="player-board">
            {s.players.map((p, i) => (
              <article
                key={p.id}
                className={
                  'player-tile ' +
                  (p.eliminated ? 'eliminated ' : '') +
                  (p.id === me.id ? 'is-me' : '')
                }
                data-player-id={p.id}
              >
                <header>
                  <span className="player-number">{String(i + 1).padStart(2, '0')}</span>
                  <Avatar avatar={p.avatar} size={39} />
                  <div className="grow">
                    <h3>
                      {p.name}
                      {p.id === me.id && <small>ВЫ</small>}
                    </h3>
                    <span>
                      {p.characterName} · <i className={p.connected ? 'online' : ''} />
                      {p.connected ? 'в сети' : 'нет связи'}
                    </span>
                  </div>
                  {p.eliminated ? (
                    <span className="player-label excluded">ИСКЛЮЧЁН</span>
                  ) : p.protected ? (
                    <ShieldCheck size={19} className="protected" />
                  ) : (
                    <span className="card-count">
                      {Object.values(p.cards).filter(Boolean).length}/8
                    </span>
                  )}
                </header>
                <div
                  className="profession-strip"
                  style={{ borderLeftColor: AVATAR_COLORS[p.avatar] }}
                >
                  <CategoryIcon category="profession" size={18} />
                  <div>
                    <small>ПРОФЕССИЯ</small>
                    <b>{p.cards.profession?.title || 'Не раскрыта'}</b>
                  </div>
                </div>
                <div className="public-traits">
                  {CATEGORIES.filter((c) => c !== 'profession').map((category) => (
                    <div className="public-trait" data-category={category} key={category}>
                      {p.cards[category] ? (
                        <div className="revealed-trait" key={p.cards[category].title}>
                          <CategoryIcon category={category} size={13} />
                          <div>
                            <small>{CATEGORY_INFO[category].name}</small>
                            <span>{p.cards[category].title}</span>
                          </div>
                        </div>
                      ) : (
                        <HiddenCard category={category} />
                      )}
                    </div>
                  ))}
                </div>
                <footer>
                  <button className="text-button" onClick={() => setDossier(p.id)}>
                    <FileText size={12} />
                    Открытое досье
                  </button>
                  <span>
                    {p.doubleVote && 'ГОЛОС ×2 '}
                    {p.specialCount} спец.
                  </span>
                </footer>
                {s.phase === 'voting' && !me.eliminated && (
                  <div className="player-vote">
                    <button
                      className={
                        'button full ' +
                        (s.self.voteTarget === p.id ? 'voted-button' : 'vote-button')
                      }
                      disabled={
                        pending ||
                        !!s.self.voteTarget ||
                        p.id === me.id ||
                        !s.candidates.includes(p.id)
                      }
                      onClick={() => void command({ type: 'vote', targetId: p.id })}
                    >
                      {s.self.voteTarget === p.id ? (
                        <>
                          <Check size={14} />
                          Ваш голос за исключение
                        </>
                      ) : p.id === me.id ? (
                        'Это вы'
                      ) : p.eliminated ? (
                        'Уже исключён'
                      ) : p.protected ? (
                        'Под защитой'
                      ) : !s.candidates.includes(p.id) ? (
                        'Не участвует в переголосовании'
                      ) : (
                        <>
                          <Vote size={14} />
                          Голос за исключение
                        </>
                      )}
                    </button>
                  </div>
                )}
                {s.phase === 'reveal' && !p.eliminated && (
                  <div
                    className={'player-round-status ' + (p.revealedRound === s.round ? 'done' : '')}
                  >
                    {p.revealedRound === s.round ? <Check size={12} /> : <Hourglass size={12} />}{' '}
                    {p.revealedRound === s.round
                      ? 'Карта раскрыта'
                      : 'Выбирает карту для раскрытия'}
                  </div>
                )}
                {s.phase === 'discussion' && !p.eliminated && p.readyForVote && (
                  <div className="player-round-status done">
                    <Check size={12} />
                    Готов голосовать
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="round-actions">
            {s.phase === 'reveal' && (
              <>
                <Eye size={18} />
                <p>
                  {me.eliminated
                    ? 'Можно наблюдать и общаться в чате.'
                    : me.revealedRound === s.round
                      ? 'Вы сделали ход. Осталось дождаться остальных.'
                      : 'Ваши закрытые характеристики — в личном досье справа.'}
                </p>
                <span>
                  {active.filter((p) => p.revealedRound === s.round).length}/{active.length} готовы
                </span>
              </>
            )}
            {s.phase === 'discussion' && (
              <>
                <MessageCircle size={18} />
                <div className="grow">
                  <b>Последний шанс привести аргумент.</b>
                  <p>Спецкарты можно сыграть до начала голосования.</p>
                </div>
                {!me.eliminated && (
                  <button
                    className="button secondary"
                    disabled={pending}
                    onClick={() => void command({ type: 'readyVote', ready: !me.readyForVote })}
                  >
                    {me.readyForVote ? 'Отменить готовность' : 'Готов голосовать'}
                  </button>
                )}
                {isHost && (
                  <button
                    className="button primary"
                    disabled={pending}
                    onClick={() => void command({ type: 'advance' })}
                  >
                    Начать голосование
                    <Vote size={14} />
                  </button>
                )}
              </>
            )}
            {s.phase === 'voting' && (
              <>
                <LockKeyhole size={18} />
                <div className="grow">
                  <b>
                    {me.eliminated
                      ? 'Вы наблюдаете за голосованием.'
                      : s.self.voteTarget
                        ? 'Голос принят. Изменить его уже нельзя.'
                        : 'Голосуйте за исключение участника.'}
                  </b>
                  <p>Выбор каждого скрыт до подсчёта. Голосовать за себя нельзя.</p>
                </div>
                <span>
                  {s.voters.length}/{active.length} голосов
                </span>
              </>
            )}
          </div>
          <section className="panel communications">
            <header>
              <div className="chat-tabs">
                <button
                  className={chatTab === 'chat' ? 'active' : ''}
                  onClick={() => setChatTab('chat')}
                >
                  <MessageCircle size={14} />
                  Обсуждение<span>{s.chat.length}</span>
                </button>
                <button
                  className={chatTab === 'log' ? 'active' : ''}
                  onClick={() => setChatTab('log')}
                >
                  <FileText size={14} />
                  Ход партии
                </button>
              </div>
              <span className="chat-live">
                <i /> ОБЩИЙ КАНАЛ
              </span>
            </header>
            <div className="messages" aria-live="polite">
              {chatTab === 'chat' ? (
                s.chat.length ? (
                  s.chat
                    .slice()
                    .reverse()
                    .map((m) => (
                      <p key={m.id}>
                        <b>{m.name}</b>
                        <span>{m.text}</span>
                      </p>
                    ))
                ) : (
                  <div className="chat-empty">
                    <MessageCircle size={23} />
                    <p>
                      Первое слово за вами.
                      <br />
                      <small>Пишите здесь или обсуждайте голосом с друзьями.</small>
                    </p>
                  </div>
                )
              ) : (
                s.logs
                  .slice()
                  .reverse()
                  .map((l) => (
                    <p key={l.id} className={l.kind}>
                      <time>Р{l.round}</time>
                      <span>{l.text}</span>
                    </p>
                  ))
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (message.trim())
                  void game
                    .send('chat', message)
                    .then(() => {
                      setMessage('');
                      setChatTab('chat');
                    })
                    .catch((e) => game.setError(e.message));
              }}
            >
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={240}
                placeholder="Убедите остальных, что вы нужны…"
                aria-label="Сообщение команде"
              />
              <button className="icon-button" aria-label="Отправить сообщение">
                <ArrowRight size={18} />
              </button>
            </form>
          </section>
        </section>
        <aside className="private-column">
          <section className="private-panel">
            <header className="private-head">
              <div>
                <LockKeyhole size={17} />
                <h2>Ваше досье</h2>
              </div>
              <span>ТОЛЬКО ДЛЯ ВАС</span>
            </header>
            <div className="private-person">
              <Avatar avatar={me.avatar} size={40} />
              <div>
                <b>{me.characterName}</b>
                <span>За столом — {me.name}</span>
              </div>
              <div className="private-counter">
                {revealed}
                <small>/8 открыто</small>
              </div>
            </div>
            <div className="private-legend">
              <ShuffleIcon />
              Всё выдано случайно. Скрытые карты видите только вы.
            </div>
            <div className="private-cards">
              {CATEGORIES.map((category) => {
                const card = s.self.cards![category],
                  isPublic = card.revealed || s.phase === 'ended';
                return (
                  <article
                    key={category}
                    className={
                      'sheet-card ' +
                      (category === 'profession' ? 'profession-card ' : '') +
                      (isPublic ? 'is-public' : '')
                    }
                    data-category={category}
                  >
                    <div className="sheet-card-top">
                      <span>
                        <CategoryIcon category={category} size={14} />
                        {CATEGORY_INFO[category].name}
                      </span>
                      {isPublic ? <Eye size={13} /> : <LockKeyhole size={12} />}
                    </div>
                    <h3>{card.title}</h3>
                    <details>
                      <summary>Подробнее</summary>
                      <p>{card.detail}</p>
                    </details>
                    {isPublic ? (
                      <span className="public-note">ОТКРЫТА ВСЕМ</span>
                    ) : (
                      <button
                        className="reveal-button"
                        aria-label={`Раскрыть: ${CATEGORY_INFO[category].name}`}
                        disabled={
                          pending ||
                          me.eliminated ||
                          s.phase !== 'reveal' ||
                          me.revealedRound === s.round
                        }
                        onClick={() => void command({ type: 'reveal', category })}
                      >
                        Раскрыть команде
                        <Eye size={12} />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
            <div className="special-cards">
              <div className="private-section-title">
                <Sparkles size={15} />
                <h3>Ваши спецкарты</h3>
                <span>ОДНА ЗА РАУНД</span>
              </div>
              {s.self.specials.map((card) => (
                <article className={'special-card ' + (card.used ? 'used' : '')} key={card.id}>
                  <div>
                    <Sparkles size={17} />
                    <b>{SPECIAL_INFO[card.kind].name}</b>
                    {card.used && <Check size={14} />}
                  </div>
                  <p>{SPECIAL_INFO[card.kind].text}</p>
                  <button
                    className="button secondary full"
                    disabled={
                      pending ||
                      card.used ||
                      me.eliminated ||
                      !['reveal', 'discussion'].includes(s.phase) ||
                      s.self.specialPlayedRound === s.round
                    }
                    onClick={() => setSpecial(card)}
                  >
                    {card.used ? 'Сыграна' : 'Сыграть карту'}
                    <ChevronRight size={13} />
                  </button>
                </article>
              ))}
            </div>
            {s.self.notes.length > 0 && (
              <section className="private-notes">
                <span className="eyebrow">
                  <LockKeyhole size={13} />
                  СЕКРЕТНЫЕ ЗАПИСИ
                </span>
                {s.self.notes.map((note, i) => (
                  <article key={i}>
                    <small>
                      {note.name} · {CATEGORY_INFO[note.category].name} · Р{note.round}
                    </small>
                    <b>{note.card.title}</b>
                    <p>{note.card.detail}</p>
                  </article>
                ))}
              </section>
            )}
          </section>
        </aside>
      </main>
      <footer className="table-footer">
        <span>
          <i className={game.connected ? 'online' : ''} />{' '}
          {game.connected ? 'СВЯЗЬ УСТАНОВЛЕНА' : 'СВЯЗЬ ПОТЕРЯНА'}
        </span>
        <span>{s.saveError ? 'ОШИБКА СОХРАНЕНИЯ' : 'ПАРТИЯ СОХРАНЯЕТСЯ АВТОМАТИЧЕСКИ'}</span>
        <span>НЕ ВСЕ СЕКРЕТЫ СТОИТ ОТКРЫВАТЬ СРАЗУ.</span>
      </footer>
      {dossier && (
        <Dossier
          player={s.players.find((p) => p.id === dossier)!}
          onClose={() => setDossier(null)}
        />
      )}
      {special && (
        <SpecialDialog
          special={special}
          state={s}
          pending={pending}
          onPlay={command}
          onClose={() => setSpecial(null)}
        />
      )}
      {modal && (
        <Modal
          title={modal === 'help' ? 'Как играть в «Бункер»' : 'Комната и сохранение'}
          onClose={() => setModal(null)}
        >
          <div className="padded">
            {modal === 'help' ? (
              <div className="rules-text">
                <p>
                  После катастрофы мест в убежище меньше, чем людей. Ваша задача — убедить группу
                  оставить вашего случайного персонажа.
                </p>
                <h3>1. Случайная раздача</h3>
                <p>
                  Профессия открыта сразу. Биология, здоровье, хобби, фобия, багаж, факт и характер
                  видны только вам. Ничего из этого нельзя выбирать при входе.
                </p>
                <h3>2. Раскрытие</h3>
                <p>
                  В каждом раунде каждый участник открывает одну закрытую карту. Если не успеть,
                  сервер выберет её случайно по таймеру. Открытые характеристики видят все.
                </p>
                <h3>3. Обсуждение и спецкарты</h3>
                <p>
                  Расскажите, чем пригодитесь при текущей катастрофе и условиях убежища. Две
                  случайные спецкарты меняют ситуацию: одну можно сыграть за раунд, каждую — один
                  раз за партию.
                </p>
                <h3>4. Тайное голосование</h3>
                <p>
                  Голосуйте за исключение другого участника. Голос нельзя изменить. Если все
                  допустимые голоса приняты, сразу идёт подсчёт; иначе ждём таймер. При ничьей —
                  переголосование между лидерами. Повторную ничью или отсутствие голосов разрешает
                  случайный жребий.
                </p>
                <h3>5. Следующий раунд</h3>
                <p>
                  Исключённые наблюдают и могут писать в чат, но не голосуют и не играют карты.
                  Партия заканчивается, когда участников остаётся ровно столько, сколько мест. Все
                  досье открываются. Ведущий может вернуть всех в лобби для новой случайной раздачи.
                </p>
                <p>
                  Если все отключатся, таймеры остановятся. Для возвращения нужен тот же браузер или
                  ключ сессии из настроек.
                </p>
              </div>
            ) : (
              <>
                <div className="settings-room">
                  <span className="eyebrow">КОД КОМНАТЫ</span>
                  <strong>{s.code}</strong>
                  <button className="button secondary" onClick={copy}>
                    {copied ? 'Ссылка скопирована' : 'Копировать приглашение'}
                    <Copy size={14} />
                  </button>
                </div>
                <button
                  className="button full"
                  onClick={() => {
                    if (!sound) void unlockAudio();
                    setSound(!sound);
                  }}
                >
                  {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}Сигналы:{' '}
                  {sound ? 'включены' : 'выключены'}
                </button>
                <button
                  className="button full"
                  onClick={() =>
                    void game
                      .send('save')
                      .then(() => game.setNotice('Партия сохранена'))
                      .catch((e) => game.setError(e.message))
                  }
                >
                  Сохранить сейчас
                </button>
                <button
                  className="button full"
                  onClick={() => {
                    if (!game.session) return;
                    const blob = new Blob([JSON.stringify(game.session)], {
                      type: 'application/json',
                    });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `bunker-cards-${s.code}-session.json`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  Скачать ключ сессии
                </button>
                <p className="muted">
                  Ключ восстанавливает вашего персонажа и его закрытые карты. Храните его у себя.
                  Для друзей — только код комнаты.
                </p>
                <button
                  className="button ghost full"
                  onClick={() => void game.leave().catch((e) => game.setError(e.message))}
                >
                  Выйти в меню
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function ShuffleIcon() {
  return <Sparkles size={15} />;
}
