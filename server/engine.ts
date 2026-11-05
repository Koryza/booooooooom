import { randomInt, randomUUID } from 'node:crypto';
import {
  AVATAR_COLORS,
  CATASTROPHES,
  CATEGORY_INFO,
  DECKS,
  SHELTER_FEATURES,
  SHELTER_PROBLEMS,
  SPECIAL_INFO,
} from '../shared/catalog.js';
import {
  CATEGORIES,
  SPECIAL_KINDS,
  type Category,
  type GameCommand,
  type GameState,
  type Player,
  type RoomState,
  type Sheet,
} from '../shared/types.js';
import { log } from './state.js';
export class Engine {
  constructor(
    readonly state: RoomState,
    private rng: (max: number) => number = randomInt,
  ) {}
  private pick<T>(items: readonly T[]): T {
    return items[this.rng(items.length)];
  }
  private shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.rng(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  private active() {
    return this.state.players.filter((p) => !p.eliminated);
  }
  private host(p: Player) {
    if (p.id !== this.state.hostId) throw new Error('Это действие доступно ведущему');
  }
  private participant(p: Player) {
    if (!this.state.players.includes(p) || !p.connected) throw new Error('Подключитесь к комнате');
    if (p.eliminated) throw new Error('Вы исключены и наблюдаете за партией');
  }
  start(p: Player) {
    this.host(p);
    const s = this.state;
    if (s.phase !== 'lobby') throw new Error('Партия уже началась');
    if (s.players.length < 2)
      throw new Error('Нужны хотя бы два игрока. Пригласите друзей по коду.');
    if (!s.players.every((x) => x.connected && x.ready))
      throw new Error('Все участники должны быть подключены и готовы');
    const seats = s.settings.seats ?? Math.max(1, Math.floor(s.players.length / 2));
    if (seats >= s.players.length) throw new Error('Мест должно быть меньше, чем участников');
    s.seats = seats;
    s.match++;
    s.round = 1;
    s.clock = 0;
    s.votes = {};
    s.winners = [];
    s.lastVote = null;
    s.candidates = [];
    s.chat = [];
    s.logs = [];
    const scenario = this.pick(CATASTROPHES);
    s.scenario = {
      ...scenario,
      shelter: {
        area: 120 + this.rng(39) * 10,
        months: 12 + this.rng(25),
        foodMonths: 8 + this.rng(17),
        features: this.shuffle(SHELTER_FEATURES).slice(0, 3),
        problem: this.pick(SHELTER_PROBLEMS),
      },
    };
    const decks = Object.fromEntries(
      Object.entries(DECKS).map(([key, values]) => [key, this.shuffle(values)]),
    ) as typeof DECKS;
    const portraits = this.shuffle(Array.from({ length: AVATAR_COLORS.length }, (_, i) => i));
    const names = {
      m: ['Алексей', 'Марк', 'Тимур', 'Сергей', 'Роман', 'Денис', 'Лев', 'Илья'],
      f: ['Анна', 'Ирина', 'Мария', 'Алиса', 'Ольга', 'Вера', 'Елена', 'Нина'],
    };
    for (const [i, player] of s.players.entries()) {
      const sex = this.rng(2) ? 'm' : 'f';
      const age = 18 + this.rng(51),
        height = 150 + this.rng(46),
        weight = 48 + this.rng(65);
      player.characterName = this.pick(names[sex]);
      player.avatar = portraits[i];
      player.sheet = Object.fromEntries(
        CATEGORIES.map((category) => [
          category,
          {
            ...(category === 'biology'
              ? {
                  title: `${sex === 'm' ? 'Мужчина' : 'Женщина'}, ${age} лет`,
                  detail: `Рост ${height} см · вес ${weight} кг. Эти данные относятся к вымышленному персонажу.`,
                }
              : decks[category][i]),
            revealed: category === 'profession',
          },
        ]),
      ) as Sheet;
      player.specials = this.shuffle(SPECIAL_KINDS)
        .slice(0, 2)
        .map((kind) => ({ id: randomUUID(), kind, used: false }));
      player.notes = [];
      player.eliminated = false;
      player.revealedRound = 0;
      player.specialPlayedRound = 0;
      player.immunityRound = 0;
      player.doubleVoteRound = 0;
      player.readyForVote = false;
    }
    log(
      s,
      `Партия ${s.match}. ${s.players.length} претендентов, ${s.seats} мест. ${scenario.title}.`,
    );
    log(
      s,
      'Профессии открыты. Все остальные характеристики и две спецкарты выданы случайно и видны только владельцам.',
    );
    this.beginReveal();
  }
  private beginReveal() {
    const s = this.state;
    s.phase = 'reveal';
    s.votes = {};
    s.ballot = 0;
    s.candidates = [];
    for (const p of this.active()) {
      p.readyForVote = false;
      if (!CATEGORIES.some((c) => !p.sheet![c].revealed)) p.revealedRound = s.round;
    }
    s.phaseEndsAt = s.clock + s.settings.revealSeconds;
    log(s, `Раунд ${s.round}. Откройте по одной характеристике.`, 'reveal');
    this.checkRevealed();
  }
  private checkRevealed() {
    if (
      this.state.phase === 'reveal' &&
      this.active().every((p) => p.revealedRound === this.state.round)
    )
      this.discussion();
  }
  private discussion() {
    const s = this.state;
    s.phase = 'discussion';
    s.phaseEndsAt = s.clock + s.settings.discussionSeconds;
    log(s, 'Обсудите, кого стоит оставить. Можно сообщить о готовности к голосованию.');
  }
  private ballot(candidates?: string[]) {
    const s = this.state;
    s.phase = 'voting';
    s.votes = {};
    s.ballot = candidates ? 2 : 1;
    s.candidates =
      candidates ||
      this.active()
        .filter((p) => p.immunityRound !== s.round)
        .map((p) => p.id);
    s.phaseEndsAt = s.clock + s.settings.voteSeconds;
    log(
      s,
      candidates
        ? 'Равенство голосов. Переголосование только между указанными кандидатами.'
        : 'Тайное голосование началось. Голосуйте за исключение одного участника.',
      'vote',
    );
  }
  private voters() {
    return this.active().filter((p) => this.state.candidates.some((id) => id !== p.id));
  }
  private finishBallot() {
    const s = this.state;
    const counts = Object.fromEntries(s.candidates.map((id) => [id, 0]));
    for (const [id, target] of Object.entries(s.votes)) {
      const voter = this.active().find((p) => p.id === id);
      if (voter && target in counts) counts[target] += voter.doubleVoteRound === s.round ? 2 : 1;
    }
    const top = Math.max(...Object.values(counts));
    const tied = s.candidates.filter((id) => counts[id] === top);
    const cast = Object.keys(s.votes).length;
    if (tied.length > 1 && s.ballot === 1) {
      s.lastVote = {
        counts,
        eliminatedId: null,
        tied,
        runoff: true,
        lottery: false,
        votesCast: cast,
      };
      this.ballot(tied);
      return;
    }
    const id = this.pick(tied),
      eliminated = s.players.find((p) => p.id === id)!;
    eliminated.eliminated = true;
    s.lastVote = {
      counts,
      eliminatedId: id,
      tied,
      runoff: s.ballot === 2,
      lottery: tied.length > 1,
      votesCast: cast,
    };
    log(
      s,
      `${eliminated.name} исключён${tied.length > 1 ? ': равенство после переголосования, решено жребием' : `: ${counts[id]} голос(а)`}.`,
      'vote',
    );
    s.votes = {};
    s.candidates = [];
    if (this.active().length <= s.seats) {
      s.phase = 'ended';
      s.phaseEndsAt = null;
      s.winners = this.active().map((p) => p.id);
      log(s, 'Дверь закрывается. Состав убежища выбран группой. Все досье открыты.');
    } else {
      s.phase = 'results';
      s.phaseEndsAt = s.clock + 12;
    }
  }
  private reveal(p: Player, category: Category) {
    const s = this.state;
    if (s.phase !== 'reveal') throw new Error('Сейчас не этап раскрытия карт');
    if (p.revealedRound === s.round) throw new Error('В этом раунде вы уже открыли карту');
    const card = p.sheet?.[category];
    if (!card || card.revealed) throw new Error('Выберите свою закрытую характеристику');
    card.revealed = true;
    p.revealedRound = s.round;
    log(
      s,
      `${p.name} открывает ${CATEGORY_INFO[category].name.toLowerCase()}: ${card.title}.`,
      'reveal',
    );
    this.checkRevealed();
  }
  private playSpecial(p: Player, cmd: Extract<GameCommand, { type: 'special' }>) {
    const s = this.state;
    if (!['reveal', 'discussion'].includes(s.phase))
      throw new Error('Спецкарты играются при раскрытии или обсуждении, до голосования');
    const special = p.specials.find((c) => c.id === cmd.cardId && !c.used);
    if (!special) throw new Error('Спецкарта не найдена или уже использована');
    if (p.specialPlayedRound === s.round) throw new Error('Можно сыграть одну спецкарту за раунд');
    const info = SPECIAL_INFO[special.kind];
    const target = this.active().find((x) => x.id === cmd.targetId && x.id !== p.id);
    if (info.target && !target) throw new Error('Выберите другого участника, который ещё в игре');
    if (info.category && (!cmd.category || !target?.sheet || target.sheet[cmd.category].revealed))
      throw new Error('Выберите закрытую характеристику участника');
    switch (special.kind) {
      case 'newProfession':
      case 'newHealth':
      case 'newPhobia': {
        const category = (
          { newProfession: 'profession', newHealth: 'health', newPhobia: 'phobia' } as const
        )[special.kind];
        const old = p.sheet![category];
        const cards = DECKS[category].filter(
          (c) =>
            c.title !== old.title &&
            (category !== 'profession' ||
              !this.active().some((x) => x.sheet?.profession.title === c.title)),
        );
        p.sheet![category] = { ...this.pick(cards), revealed: old.revealed };
        if (old.revealed)
          log(
            s,
            `${p.name}: новая карта «${CATEGORY_INFO[category].name}» — ${p.sheet![category].title}.`,
            'special',
          );
        break;
      }
      case 'swapProfession':
      case 'swapBaggage': {
        const category = special.kind === 'swapProfession' ? 'profession' : 'baggage';
        const a = p.sheet![category],
          b = target!.sheet![category];
        const publicCard = a.revealed || b.revealed;
        p.sheet![category] = { ...b, revealed: publicCard };
        target!.sheet![category] = { ...a, revealed: publicCard };
        break;
      }
      case 'peek':
        p.notes.push({
          playerId: target!.id,
          name: target!.name,
          category: cmd.category!,
          card: {
            title: target!.sheet![cmd.category!].title,
            detail: target!.sheet![cmd.category!].detail,
          },
          round: s.round,
        });
        p.notes = p.notes.slice(-20);
        break;
      case 'expose':
        target!.sheet![cmd.category!].revealed = true;
        log(
          s,
          `${target!.name}, ${CATEGORY_INFO[cmd.category!].name.toLowerCase()}: ${target!.sheet![cmd.category!].title}.`,
          'reveal',
        );
        break;
      case 'immunity':
        if (this.active().filter((x) => x.immunityRound !== s.round).length <= 2)
          throw new Error('Для защиты должны остаться минимум два кандидата');
        p.immunityRound = s.round;
        break;
      case 'doubleVote':
        p.doubleVoteRound = s.round;
        break;
    }
    special.used = true;
    p.specialPlayedRound = s.round;
    log(s, `${p.name} играет «${info.name}»${target ? ` → ${target.name}` : ''}.`, 'special');
    if (s.phase === 'reveal') {
      for (const active of this.active())
        if (!CATEGORIES.some((c) => !active.sheet![c].revealed)) active.revealedRound = s.round;
      this.checkRevealed();
    }
  }
  command(p: Player, cmd: GameCommand) {
    const s = this.state;
    if (cmd.type === 'rematch') {
      this.host(p);
      if (s.phase !== 'ended') throw new Error('Сначала завершите партию');
      s.phase = 'lobby';
      s.phaseEndsAt = null;
      s.round = 0;
      s.winners = [];
      s.scenario = null;
      s.lastVote = null;
      s.votes = {};
      s.candidates = [];
      for (const player of s.players) {
        player.ready = false;
        player.sheet = null;
        player.characterName = null;
        player.specials = [];
        player.notes = [];
        player.eliminated = false;
        player.revealedRound = 0;
        player.readyForVote = false;
        player.specialPlayedRound = 0;
        player.immunityRound = 0;
        player.doubleVoteRound = 0;
      }
      log(s, 'Новая партия в том же лобби. После готовности будет новая случайная раздача.');
      return;
    }
    if (cmd.type === 'advance' || cmd.type === 'nextRound') {
      this.host(p);
      if (cmd.type === 'advance') {
        if (s.phase !== 'discussion') throw new Error('Дождитесь раскрытия карт');
        this.ballot();
      } else {
        if (s.phase !== 'results') throw new Error('Дождитесь результатов');
        s.round++;
        this.beginReveal();
      }
      return;
    }
    this.participant(p);
    if (cmd.type === 'reveal') return this.reveal(p, cmd.category);
    if (cmd.type === 'special') return this.playSpecial(p, cmd);
    if (cmd.type === 'readyVote') {
      if (s.phase !== 'discussion') throw new Error('Сейчас не этап обсуждения');
      p.readyForVote = cmd.ready;
      if (this.active().every((x) => x.readyForVote)) this.ballot();
      return;
    }
    if (cmd.type === 'vote') {
      if (s.phase !== 'voting') throw new Error('Сейчас нет голосования');
      if (s.votes[p.id]) throw new Error('Ваш голос уже принят');
      if (cmd.targetId === p.id || !s.candidates.includes(cmd.targetId))
        throw new Error('Выберите другого доступного кандидата');
      s.votes[p.id] = cmd.targetId;
      if (this.voters().every((x) => !!s.votes[x.id])) this.finishBallot();
      return;
    }
    const exhaustive: never = cmd;
    throw new Error('Неизвестная команда: ' + String(exhaustive));
  }
  tick(dt: number) {
    const s = this.state;
    if (
      !s.players.some((p) => p.connected) ||
      s.phase === 'lobby' ||
      s.phase === 'ended' ||
      !Number.isFinite(dt) ||
      dt <= 0
    )
      return;
    s.clock += Math.min(dt, 1);
    if (s.phaseEndsAt === null || s.clock < s.phaseEndsAt) return;
    if (s.phase === 'reveal') {
      for (const p of this.active())
        if (p.revealedRound !== s.round) {
          const hidden = CATEGORIES.filter((c) => !p.sheet![c].revealed);
          if (hidden.length) {
            const category = this.pick(hidden);
            p.sheet![category].revealed = true;
            log(
              s,
              `${p.name}: по таймеру открыта карта «${CATEGORY_INFO[category].name}» — ${p.sheet![category].title}.`,
              'reveal',
            );
          }
          p.revealedRound = s.round;
        }
      this.discussion();
    } else if (s.phase === 'discussion') this.ballot();
    else if (s.phase === 'voting') this.finishBallot();
    else if (s.phase === 'results') {
      s.round++;
      this.beginReveal();
    }
  }
  view(playerId: string): GameState {
    const s = this.state,
      me = s.players.find((p) => p.id === playerId);
    if (!me) throw new Error('Вы не участник комнаты');
    const { players: _players, votes, ...publicState } = s;
    return structuredClone({
      ...publicState,
      players: s.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        connected: p.connected,
        ready: p.ready,
        characterName: p.characterName,
        eliminated: p.eliminated,
        cards: Object.fromEntries(
          CATEGORIES.map((category) => [
            category,
            p.sheet && (p.sheet[category].revealed || s.phase === 'ended')
              ? { title: p.sheet[category].title, detail: p.sheet[category].detail }
              : null,
          ]),
        ) as GameState['players'][number]['cards'],
        revealedRound: p.revealedRound,
        readyForVote: p.readyForVote,
        protected: p.immunityRound === s.round && s.round > 0,
        doubleVote: p.doubleVoteRound === s.round && s.round > 0,
        specialsUsed: p.specials.filter((c) => c.used).map((c) => c.kind),
        specialCount: p.specials.filter((c) => !c.used).length,
      })),
      voters: Object.keys(votes),
      self: {
        playerId: me.id,
        cards: me.sheet,
        specials: me.specials,
        notes: me.notes,
        voteTarget: votes[me.id] || null,
        specialPlayedRound: me.specialPlayedRound,
      },
    });
  }
}
