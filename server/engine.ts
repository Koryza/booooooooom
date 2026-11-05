import { randomUUID } from 'node:crypto';
import type { Challenge, GameCommand, GameState, Player } from '../shared/types.js';
import {
  ACTION_INFO,
  RECIPES,
  TECH_INFO,
  ZONES,
  getRoom,
  type Resource,
  type Cost,
  type ActionId,
  type RoomId,
} from '../shared/catalog.js';
import { affordable, discounted, missions } from '../shared/rules.js';
import { EVENT_INFO } from '../shared/events.js';
import { roomAt, route, sweep } from '../shared/navigation.js';
import { clamp, log, random } from './state.js';
export class Engine {
  readonly challenges = new Map<string, Challenge>();
  private inputs = new Map<string, { x: number; y: number; until: number }>();
  constructor(readonly state: GameState) {
    // Additive migration for early v1 development saves.
    state.maintenance ??= null;
    state.nextMaintenance ??= state.elapsed + 10;
    state.jobsCompleted ??= 0;
  }
  private maintenanceTick() {
    const s = this.state,
      job = s.maintenance;
    if (job) {
      const value =
        job.kind === 'repair'
          ? s.rooms[job.target!].integrity
          : job.kind === 'oxygen'
            ? s.oxygen
            : job.kind === 'defense'
              ? -s.threat
              : job.kind === 'craft'
                ? s.stats.crafted
                : s.resources[job.kind];
      if (value >= job.goal) {
        this.add(job.reward);
        s.jobsCompleted++;
        s.maintenance = null;
        s.nextMaintenance = s.elapsed + 25;
        log(s, `Дежурное задание «${job.title}» выполнено. Награда на складе.`, 'good');
      } else if (s.elapsed >= job.expiresAt) {
        s.maintenance = null;
        s.nextMaintenance = s.elapsed + 15;
        log(s, 'Дежурное задание снято с доски. Оценим текущее состояние убежища.');
      }
      return;
    }
    if (s.elapsed < s.nextMaintenance) return;
    const weakest = (Object.keys(s.rooms) as RoomId[])
      .filter((id) => s.rooms[id].built)
      .sort((a, b) => s.rooms[a].integrity - s.rooms[b].integrity)[0];
    const base = { reward: { parts: 4, electronics: 1 }, expiresAt: s.elapsed + 120 };
    if (s.oxygen < 65)
      s.maintenance = {
        ...base,
        kind: 'oxygen',
        title: 'Дышать свободно',
        desc: 'Поднимите кислород до 85%.',
        goal: 85,
      };
    else if (s.rooms[weakest].integrity < 72)
      s.maintenance = {
        ...base,
        kind: 'repair',
        target: weakest,
        title: 'Плановый ремонт',
        desc: `Восстановите ${getRoom(weakest).name.toLowerCase()} до 85%.`,
        goal: 85,
      };
    else if (s.resources.water < 65)
      s.maintenance = {
        ...base,
        kind: 'water',
        title: 'Чистый резерв',
        desc: 'Пополните воду на 20 литров.',
        goal: s.resources.water + 20,
      };
    else if (s.resources.food < 55)
      s.maintenance = {
        ...base,
        kind: 'food',
        title: 'Запас на завтра',
        desc: 'Пополните еду на 20 порций.',
        goal: s.resources.food + 20,
      };
    else if (s.threat > 35)
      s.maintenance = {
        ...base,
        kind: 'defense',
        title: 'Тихий периметр',
        desc: 'Снизьте угрозу до 20%.',
        goal: -20,
      };
    else
      s.maintenance = {
        ...base,
        kind: 'craft',
        title: 'Подготовить снаряжение',
        desc: 'Изготовьте любой предмет в мастерской.',
        goal: s.stats.crafted + 1,
      };
    log(s, `Новое дежурное задание: ${s.maintenance.title}.`);
  }
  private pay(cost: Cost) {
    if (!affordable(this.state.resources, cost)) throw new Error('Недостаточно общих ресурсов');
    for (const [k, amount] of Object.entries(cost)) this.state.resources[k as Resource] -= amount;
  }
  private add(cost: Cost, multiplier = 1) {
    for (const [k, amount] of Object.entries(cost))
      this.state.resources[k as Resource] = clamp(
        this.state.resources[k as Resource] + amount * multiplier,
        0,
        999,
      );
  }
  private at(p: Player, room: RoomId) {
    if (roomAt(p) !== room) throw new Error(`Подойдите в помещение «${getRoom(room).name}»`);
    if (!this.state.rooms[room].built) throw new Error('Помещение ещё не построено');
  }
  private available(p: Player, allowDowned = false) {
    if (!p.connected) throw new Error('Нет соединения');
    if (!allowDowned && p.hp <= 0)
      throw new Error('Вы без сознания. Используйте аптечку или дождитесь медика.');
    if (p.expedition) throw new Error('Вы в экспедиции');
    if (p.task) throw new Error('Сначала завершите текущее действие');
  }
  private checkAction(p: Player, action: ActionId, room: RoomId) {
    const s = this.state,
      info = ACTION_INFO[action];
    this.available(p);
    this.at(p, room);
    if (info.room && info.room !== room) throw new Error('Здесь это действие недоступно');
    if (action === 'repair' && s.rooms[room].integrity >= 99)
      throw new Error('Ремонт не требуется');
    if (action !== 'rest' && p.energy < 8)
      throw new Error('Нет сил. Отдохните в жилом блоке или используйте паёк.');
    if (['purify', 'grow'].includes(action) && (!s.power || s.rooms[room].integrity < 20))
      throw new Error('Нужны питание и исправное оборудование');
    if (
      action === 'treat' &&
      !s.players.some((x) => roomAt(x) === 'medical' && (x.hp < 99 || x.infection > 0))
    )
      throw new Error('В медпункте никто не нуждается в лечении');
    if (!affordable(s.resources, info.cost)) throw new Error('Недостаточно общих ресурсов');
  }
  private task(
    p: Player,
    action: string,
    room: RoomId,
    label: string,
    seconds: number,
    quality = 1,
    target?: string,
  ) {
    p.path = [];
    this.inputs.delete(p.id);
    const duration = seconds * (p.stress > 75 ? 1.25 : 1) * (this.state.morale < 25 ? 1.15 : 1);
    p.task = {
      action,
      room,
      label,
      startedAt: this.state.elapsed,
      endsAt: this.state.elapsed + duration,
      quality,
      target,
    };
  }
  command(p: Player, cmd: GameCommand): Challenge | null {
    const s = this.state;
    if (s.phase !== 'playing') throw new Error('Игра ещё не началась или уже завершена');
    if (cmd.type === 'cancel') {
      this.challenges.delete(p.id);
      return null;
    }
    if (cmd.type === 'vote') {
      if (!s.crisis || cmd.choice >= s.crisis.choices.length)
        throw new Error('Голосование уже закрыто');
      s.crisis.votes[p.id] = cmd.choice;
      const active = s.players.filter((x) => x.connected);
      if (active.filter((x) => s.crisis!.votes[x.id] === cmd.choice).length > active.length / 2)
        this.resolveEvent(cmd.choice);
      return null;
    }
    if (cmd.type === 'challenge') {
      const c = this.challenges.get(p.id);
      this.challenges.delete(p.id);
      if (!c || c.id !== cmd.id || c.expiresAt < s.elapsed)
        throw new Error('Схема устарела. Начните действие заново.');
      if (cmd.answer.join(',') !== c.sequence.join(',')) {
        p.energy = clamp(p.energy - 4);
        throw new Error('Контакт не совпал. Потеряно 4 силы. Попробуйте снова.');
      }
      this.checkAction(p, c.action as ActionId, c.room);
      this.pay(ACTION_INFO[c.action as ActionId].cost);
      this.task(
        p,
        c.action,
        c.room,
        ACTION_INFO[c.action as ActionId].name,
        ACTION_INFO[c.action as ActionId].seconds,
        1.2,
      );
      return null;
    }
    if (cmd.type === 'use') {
      this.available(p, true);
      if (p.inventory[cmd.item] <= 0) throw new Error('Предмета нет в рюкзаке');
      p.inventory[cmd.item]--;
      if (cmd.item === 'medkit') {
        p.hp = clamp(p.hp + 35);
        p.infection = clamp(p.infection - 15);
      } else {
        p.energy = clamp(p.energy + 25);
        p.stress = clamp(p.stress - 12);
      }
      log(s, `${p.name} использовал ${cmd.item === 'medkit' ? 'аптечку' : 'паёк'}.`, 'good');
      return null;
    }
    this.available(p);
    if (this.challenges.has(p.id) && !['act', 'move', 'travel'].includes(cmd.type))
      throw new Error('Завершите или закройте схему');
    if (cmd.type === 'move') {
      if (this.challenges.has(p.id)) throw new Error('Завершите или закройте схему');
      const len = Math.max(1, Math.hypot(cmd.x, cmd.y));
      this.inputs.set(p.id, { x: cmd.x / len, y: cmd.y / len, until: s.elapsed + 0.3 });
      if (cmd.x || cmd.y) p.path = [];
      return null;
    }
    if (cmd.type === 'travel') {
      if (this.challenges.has(p.id)) throw new Error('Завершите или закройте схему');
      if (!s.rooms[cmd.room].built) throw new Error('Помещение ещё не построено');
      this.inputs.delete(p.id);
      p.path = route(p, cmd.room);
      return null;
    }
    if (cmd.type === 'act') {
      this.checkAction(p, cmd.action, cmd.room);
      this.inputs.delete(p.id);
      p.path = [];
      if (ACTION_INFO[cmd.action].skill) {
        const challenge: Challenge = {
          id: randomUUID(),
          action: cmd.action,
          room: cmd.room,
          expiresAt: s.elapsed + 25,
          sequence: Array.from({ length: 4 }, () => Math.floor(random(s) * 4)),
        };
        this.challenges.set(p.id, challenge);
        return challenge;
      }
      this.pay(ACTION_INFO[cmd.action].cost);
      this.task(
        p,
        cmd.action,
        cmd.room,
        ACTION_INFO[cmd.action].name,
        ACTION_INFO[cmd.action].seconds,
      );
      return null;
    }
    if (cmd.type === 'craft') {
      this.at(p, 'workshop');
      const recipe = RECIPES.find((x) => x.id === cmd.recipe);
      if (!recipe) throw new Error('Неизвестный рецепт');
      if (recipe.id === 'armor' && p.inventory.armor) throw new Error('Бронежилет уже экипирован');
      if ((recipe.id === 'medkit' || recipe.id === 'ration') && p.inventory[recipe.id] >= 10)
        throw new Error('В рюкзаке уже 10 предметов этого типа');
      this.pay(
        discounted(
          recipe.cost,
          (p.role === 'mechanic' ? 0.7 : 1) - (s.rooms.workshop.level - 1) * 0.05,
        ),
      );
      this.task(p, 'craft', 'workshop', `Изготовление: ${recipe.name}`, 10, 1, recipe.id);
      return null;
    }
    if (cmd.type === 'research') {
      this.at(p, 'command');
      const tech = TECH_INFO.find((t) => t.id === cmd.tech);
      if (!tech || s.research.includes(tech.id))
        throw new Error('Технология неизвестна или уже изучена');
      if (!s.power) throw new Error('Для исследования нужна энергия');
      if (!tech.requires.every((t) => s.research.includes(t)))
        throw new Error('Сначала изучите предыдущие технологии');
      if (tech.id === 'vaccine' && s.story.length < 5)
        throw new Error('Найдите все 5 архивных документов');
      if (s.players.some((x) => x.task?.action === 'research' && x.task.target === tech.id))
        throw new Error('Исследование уже выполняется');
      this.pay(discounted(tech.cost, p.role === 'scientist' ? 0.7 : 1));
      this.task(
        p,
        'research',
        'command',
        `Исследование: ${tech.name}`,
        (p.role === 'scientist' ? 18 : 26) / s.rooms.command.level,
        1,
        tech.id,
      );
      return null;
    }
    if (cmd.type === 'upgrade' || cmd.type === 'build') {
      this.at(p, 'workshop');
      const target = cmd.type === 'build' ? 'greenhouse' : cmd.room;
      const room = s.rooms[target];
      if (cmd.type === 'build' && (!s.research.includes('hydroponics') || room.built))
        throw new Error('Изучите гидропонику; ферма может быть построена один раз');
      if (cmd.type === 'upgrade' && (!room.built || room.level >= 3))
        throw new Error('Помещение не построено или уже достигло уровня 3');
      if (
        s.players.some(
          (x) => ['upgrade', 'build'].includes(x.task?.action || '') && x.task?.target === target,
        )
      )
        throw new Error('В этом отсеке уже идут строительные работы');
      this.pay(
        discounted(
          cmd.type === 'build'
            ? { parts: 28, electronics: 8 }
            : { parts: 12 * room.level, electronics: 4 * room.level },
          p.role === 'mechanic' ? 0.7 : 1,
        ),
      );
      this.task(
        p,
        cmd.type,
        'workshop',
        `${cmd.type === 'build' ? 'Строим' : 'Улучшаем'}: ${getRoom(target).name}`,
        22,
        1,
        target,
      );
      return null;
    }
    if (cmd.type === 'give') {
      const friend = s.players.find((x) => x.id === cmd.playerId);
      if (
        !friend ||
        friend.id === p.id ||
        friend.expedition ||
        Math.hypot(friend.x - p.x, friend.y - p.y) > 100
      )
        throw new Error('Подойдите к товарищу ближе (100 ед.)');
      if (p.inventory[cmd.item] < cmd.amount || friend.inventory[cmd.item] + cmd.amount > 10)
        throw new Error('Недостаточно предметов или рюкзак товарища полон');
      p.inventory[cmd.item] -= cmd.amount;
      friend.inventory[cmd.item] += cmd.amount;
      log(
        s,
        `${p.name} передал ${friend.name}: ${cmd.item === 'medkit' ? 'аптечка' : 'паёк'} ×${cmd.amount}.`,
        'good',
      );
      return null;
    }
    if (cmd.type === 'expedition') {
      this.at(p, 'airlock');
      const zone = ZONES.find((z) => z.id === cmd.zone);
      if (!zone) throw new Error('Зона неизвестна');
      if (s.expeditions.length)
        throw new Error(
          'Уже идёт экспедиция. Присоединитесь к группе или дождитесь её возвращения.',
        );
      if (p.energy < 20 || p.hp < 20) throw new Error('Для выхода нужны 20 сил и 20 здоровья');
      this.pay({ food: 2, water: 2, ammo: 3 });
      const id = randomUUID();
      p.expedition = id;
      p.path = [];
      this.inputs.delete(p.id);
      const expedition = {
        id,
        zone: zone.id,
        mode: cmd.mode,
        players: [p.id],
        launched: false,
        endsAt: s.elapsed + 15,
        risk: this.risk(zone.risk, cmd.mode, [p]),
      };
      s.expeditions.push(expedition);
      log(
        s,
        `${p.name} собирает рейд: ${zone.name}. У команды 15 секунд, чтобы присоединиться.`,
        'story',
      );
      return null;
    }
    if (cmd.type === 'join-expedition') {
      this.at(p, 'airlock');
      const expedition = s.expeditions.find((e) => e.id === cmd.id && !e.launched);
      if (!expedition) throw new Error('Группа уже вышла');
      if (p.energy < 20 || p.hp < 20) throw new Error('Для выхода нужны 20 сил и 20 здоровья');
      this.pay({ food: 2, water: 2, ammo: 3 });
      p.expedition = expedition.id;
      p.path = [];
      this.inputs.delete(p.id);
      expedition.players.push(p.id);
      expedition.risk = this.risk(
        ZONES.find((z) => z.id === expedition.zone)!.risk,
        expedition.mode,
        s.players.filter((x) => expedition.players.includes(x.id)),
      );
      return null;
    }
    if (cmd.type === 'ending') {
      this.at(p, 'command');
      if (s.crisis) throw new Error('Сначала завершите текущее голосование');
      this.canEnd(cmd.ending);
      s.crisis = {
        id: randomUUID(),
        type: 'ending:' + cmd.ending,
        title: 'Решение, которое изменит всё',
        text: {
          evacuation: 'Сигнал принят. Конвой ждёт у северного тоннеля. Покидаем убежище?',
          autonomy: 'Бункер автономен. Превратим убежище в постоянную колонию?',
          vaccine: 'Синтез готов. Выпустить вакцину и открыть двери новому миру?',
        }[cmd.ending],
        choices: [
          { label: 'Остаться и продолжить', desc: 'Выживание продолжается' },
          { label: 'Завершить эту историю', desc: 'Победа и итоговая статистика' },
        ],
        votes: {},
        endsAt: s.elapsed + 30,
      };
      return null;
    }
    const exhaustive: never = cmd;
    throw new Error('Неизвестная игровая команда: ' + String(exhaustive));
  }
  private finish(p: Player) {
    const task = p.task!;
    const s = this.state,
      q = task.quality,
      r = s.rooms[task.room];
    p.task = null;
    p.xp += 15;
    p.energy = clamp(p.energy - (task.action === 'rest' ? 0 : 7));
    switch (task.action) {
      case 'repair':
        r.integrity = clamp(
          r.integrity + (p.role === 'engineer' ? 40 : 25) * q + Math.min(10, p.xp / 100),
        );
        s.stats.repairs++;
        break;
      case 'rest':
        p.energy = clamp(p.energy + 35 + (r.level - 1) * 8);
        p.stress = clamp(p.stress - 22);
        p.hp = clamp(p.hp + 6);
        break;
      case 'eat':
        for (const friend of s.players.filter((x) => x.connected && !x.expedition)) {
          friend.energy = clamp(friend.energy + 14 + (r.level - 1) * 4);
          friend.stress = clamp(friend.stress - 10);
          friend.hp = clamp(friend.hp + 5);
        }
        s.morale = clamp(s.morale + 5);
        break;
      case 'purify':
        this.add({ water: 25 + r.level * 3 });
        r.integrity = clamp(r.integrity - 3);
        break;
      case 'vent':
        s.oxygen = clamp(s.oxygen + 25);
        r.integrity = clamp(r.integrity + 12 * q);
        break;
      case 'treat':
        for (const friend of s.players.filter((x) => !x.expedition && roomAt(x) === 'medical')) {
          friend.hp = clamp(friend.hp + (p.role === 'medic' ? 55 : 32) * q + (r.level - 1) * 8);
          friend.infection = clamp(friend.infection - (p.role === 'medic' ? 40 : 20));
        }
        break;
      case 'defend':
        s.threat = clamp(s.threat - (p.role === 'soldier' ? 42 : 24) - (r.level - 1) * 5);
        s.rooms.airlock.integrity = clamp(s.rooms.airlock.integrity + 5);
        break;
      case 'salvage':
        this.add({ parts: 5 + (r.level - 1) * 2, ...(random(s) < 0.4 ? { electronics: 1 } : {}) });
        break;
      case 'grow':
        this.add({ food: 24 + r.level * 4 });
        break;
      case 'search':
        s.threat = clamp(s.threat - 8);
        if (random(s) < 0.4 && s.story.length < 5) {
          s.story.push(s.story.length);
          log(s, 'Перехвачен архив проекта «Рассвет». Читайте в журнале.', 'story');
        } else this.add({ electronics: 2 });
        break;
      case 'craft': {
        if (task.target === 'ammo') this.add({ ammo: 15 });
        else if (task.target === 'medicine') this.add({ medicine: 6 });
        else p.inventory[task.target as 'medkit' | 'ration' | 'armor']++;
        s.stats.crafted++;
        break;
      }
      case 'research':
        if (!s.research.includes(task.target!)) s.research.push(task.target!);
        break;
      case 'upgrade':
        s.rooms[task.target as RoomId].level++;
        s.rooms[task.target as RoomId].integrity = 100;
        break;
      case 'build':
        s.rooms.greenhouse.built = true;
        s.rooms.greenhouse.integrity = 100;
        break;
    }
    log(s, `${p.name}: ${task.label.toLowerCase()} — завершено.`, 'good');
  }
  private risk(base: number, mode: 'quiet' | 'fast', party: Player[]) {
    return clamp(
      base +
        (mode === 'fast' ? 15 : -8) +
        { clear: 0, rain: 4, fog: 8, storm: 15 }[this.state.weather] -
        party.length * 3 -
        party.filter((p) => p.role === 'soldier' || p.role === 'scout').length * 7 -
        (this.state.rooms.airlock.level - 1) * 3,
      3,
      90,
    );
  }
  private expeditionTick() {
    const s = this.state;
    for (const expedition of [...s.expeditions])
      if (s.elapsed >= expedition.endsAt) {
        const zone = ZONES.find((z) => z.id === expedition.zone)!;
        const party = s.players.filter((p) => expedition.players.includes(p.id));
        if (!expedition.launched) {
          expedition.launched = true;
          expedition.endsAt = s.elapsed + zone.seconds * (expedition.mode === 'fast' ? 0.65 : 1);
          expedition.risk = this.risk(zone.risk, expedition.mode, party);
          log(s, `Группа вышла: ${zone.name}. Опасность: ${Math.ceil(expedition.risk)}%.`, 'story');
          continue;
        }
        const ambush = random(s) * 100 < expedition.risk;
        const multiplier =
          (1 + 0.5 * (party.length - 1)) *
          (party.some((p) => p.role === 'scout') ? 1.4 : 1) *
          (ambush ? 0.5 : 1);
        this.add(zone.loot, multiplier);
        s.stats.expeditions++;
        if (
          s.story.length < 5 &&
          (zone.id === 'lab' || party.some((p) => p.role === 'scientist') || random(s) < 0.55)
        ) {
          s.story.push(s.story.length);
          log(s, 'Группа принесла архив проекта «Рассвет».', 'story');
        }
        if (!ambush && random(s) < 0.25) {
          s.stats.rescued++;
          s.morale = clamp(s.morale + 6);
          log(s, 'Экспедиция помогла уцелевшей семье найти безопасный путь.', 'good');
        }
        for (const p of party) {
          p.expedition = null;
          p.energy = clamp(p.energy - 20);
          p.stress = clamp(p.stress + (ambush ? 18 : 5));
          p.xp += ambush ? 25 : 40;
          if (ambush) {
            p.hp = clamp(p.hp - (15 + zone.risk * 0.35) * (p.inventory.armor ? 0.5 : 1));
            p.infection = clamp(
              p.infection + (zone.id === 'hospital' || zone.id === 'lab' ? 15 : 6),
            );
          }
        }
        s.expeditions = s.expeditions.filter((e) => e.id !== expedition.id);
        s.threat = clamp(s.threat + 7);
        log(
          s,
          `${zone.name}: группа вернулась${ambush ? ' с ранениями и половиной добычи' : ' с припасами'}. Всё сложено на общий склад.`,
          ambush ? 'danger' : 'good',
        );
      }
  }
  private canEnd(ending: 'evacuation' | 'autonomy' | 'vaccine') {
    const s = this.state;
    if (
      ending === 'evacuation' &&
      (s.day < 5 || !s.research.includes('radio') || s.story.length < 3)
    )
      throw new Error('Для эвакуации: 5-й день, дальняя связь, 3 архива');
    if (
      ending === 'autonomy' &&
      (s.day < 7 ||
        !['solar', 'recycling', 'hydroponics', 'fortification'].every((t) =>
          s.research.includes(t),
        ) ||
        !s.rooms.greenhouse.built ||
        s.rooms.generator.level < 2)
    )
      throw new Error(
        'Для автономии: 7-й день, солнечный контур, водооборот, гидропоника, оборона, ферма и генератор уровня 2',
      );
    if (
      ending === 'vaccine' &&
      (!s.research.includes('vaccine') ||
        s.story.length < 5 ||
        s.rooms.medical.level < 2 ||
        s.oxygen < 70 ||
        !s.power)
    )
      throw new Error(
        'Для вакцины: технология, 5 архивов, медпункт уровня 2, кислород ≥70% и питание',
      );
  }
  private createEvent() {
    const s = this.state;
    const event = EVENT_INFO[Math.floor(random(s) * EVENT_INFO.length)];
    s.crisis = { ...structuredClone(event), id: randomUUID(), votes: {}, endsAt: s.elapsed + 35 };
    if (event.type === 'generator')
      s.rooms.generator.integrity = clamp(s.rooms.generator.integrity - 25);
    if (event.type === 'fire') s.rooms.workshop.integrity = clamp(s.rooms.workshop.integrity - 25);
    if (event.type === 'water') s.resources.water = clamp(s.resources.water - 10, 0, 999);
    if (event.type === 'horde') s.threat = clamp(s.threat + 28);
    if (event.type === 'theft') s.resources.food = clamp(s.resources.food - 12, 0, 999);
    if (event.type === 'infection') {
      const p = s.players.find((p) => p.connected);
      if (p) p.infection = clamp(p.infection + 30);
    }
    log(s, event.title + '. Требуется решение команды.', 'danger');
  }
  private resolveEvent(choice: number) {
    const s = this.state;
    const event = s.crisis!;
    s.crisis = null;
    const attempt = (cost: Cost, effect: () => void) => {
      if (affordable(s.resources, cost)) {
        this.pay(cost);
        effect();
      } else {
        s.morale = clamp(s.morale - 8);
        s.threat = clamp(s.threat + 8);
        log(s, 'На решение не хватило припасов: −8 морали, +8 угрозы.', 'danger');
      }
    };
    const each = (effect: (p: Player) => void) => s.players.forEach(effect);
    if (event.type.startsWith('ending:')) {
      if (choice === 1) {
        try {
          const ending = event.type.split(':')[1] as 'evacuation' | 'autonomy' | 'vaccine';
          this.canEnd(ending);
          s.phase = 'ended';
          s.ending = {
            evacuation: 'Северный конвой. Вы выбрались вместе и дали надежду другим.',
            autonomy: 'Новый дом. Ваш бункер стал первой автономной колонией.',
            vaccine: 'Рассвет. Вакцина работает. У человечества появился второй шанс.',
          }[ending];
          log(s, s.ending, 'story');
        } catch {
          log(s, 'Условия финала изменились. Продолжаем бороться.', 'danger');
        }
      }
      return;
    }
    switch (event.type) {
      case 'generator':
        attempt(choice === 0 ? { parts: 10 } : { fuel: 8 }, () => {
          s.rooms.generator.integrity = clamp(
            s.rooms.generator.integrity + (choice === 0 ? 35 : 20),
          );
          if (choice === 1) s.oxygen = clamp(s.oxygen - 8);
        });
        break;
      case 'water':
        attempt(choice === 0 ? { water: 18 } : { medicine: 4 }, () => {});
        break;
      case 'fire':
        attempt(choice === 0 ? { water: 12 } : {}, () => {
          if (choice === 1) s.oxygen = clamp(s.oxygen - 22);
          s.rooms.workshop.integrity = clamp(s.rooms.workshop.integrity + (choice === 0 ? 15 : 8));
        });
        break;
      case 'horde':
        if (choice === 0)
          attempt({ ammo: 12 }, () => {
            s.threat = clamp(s.threat - 32);
          });
        else {
          s.rooms.airlock.integrity = clamp(s.rooms.airlock.integrity - 18);
          s.morale = clamp(s.morale - 10);
        }
        break;
      case 'signal':
        if (choice === 0)
          attempt({ food: 8 }, () => {
            s.stats.rescued++;
            s.morale = clamp(s.morale + 15);
          });
        else {
          this.add({ electronics: 3 });
          s.morale = clamp(s.morale - 5);
        }
        break;
      case 'stranger':
        attempt(choice === 0 ? { medicine: 3 } : { food: 5 }, () => {
          this.add({ fuel: choice === 0 ? 20 : 10 });
          if (choice === 0) {
            s.morale = clamp(s.morale + 8);
            s.stats.rescued++;
          }
        });
        break;
      case 'infection':
        if (choice === 0)
          attempt({ medicine: 5 }, () =>
            each((p) => {
              p.infection = clamp(p.infection - 35);
            }),
          );
        else {
          s.morale = clamp(s.morale - 12);
          each((p) => {
            p.infection = clamp(p.infection - 12);
          });
        }
        break;
      case 'theft':
        if (choice === 0) {
          this.add({ parts: 10 });
          s.threat = clamp(s.threat + 8);
        } else
          attempt({ parts: 5 }, () => {
            s.rooms.airlock.integrity = clamp(s.rooms.airlock.integrity + 12);
          });
        break;
      case 'hidden':
        if (choice === 0)
          attempt({ parts: 8 }, () => {
            this.add({ electronics: 4 });
            if (s.story.length < 5) s.story.push(s.story.length);
          });
        else this.add({ electronics: 6 });
        break;
      case 'cache':
        this.add(choice === 0 ? { food: 20, water: 15 } : { parts: 15, electronics: 6 });
        s.threat = clamp(s.threat + 8);
        break;
    }
    log(s, `Решение: ${event.choices[choice].label}. Последствия применены.`, 'story');
  }
  tick(dt: number) {
    const s = this.state;
    if (
      s.phase !== 'playing' ||
      !s.players.some((p) => p.connected) ||
      !Number.isFinite(dt) ||
      dt <= 0
    )
      return;
    dt = Math.min(dt, 1);
    s.elapsed += dt;
    const previousDay = s.day;
    s.day = Math.floor(s.elapsed / 180) + 1;
    s.hour = (7 + s.elapsed / 7.5) % 24;
    if (s.day !== previousDay) {
      s.weather = (['clear', 'rain', 'fog', 'storm'] as const)[Math.floor(random(s) * 4)];
      log(s, `День ${s.day}. Мы всё ещё здесь. Погода изменилась.`, 'story');
    }
    const factor = { normal: 1, hard: 1.35, nightmare: 1.75 }[s.difficulty];
    const count = s.players.filter((p) => p.connected).length;
    const solar =
      s.research.includes('solar') && s.hour >= 6 && s.hour < 19 && s.weather !== 'storm';
    s.power = s.rooms.generator.integrity > 15 && (s.resources.fuel > 0 || solar);
    if (s.power && !solar)
      s.resources.fuel = clamp(
        s.resources.fuel - (0.035 * factor * dt) / (1 + (s.rooms.generator.level - 1) * 0.2),
        0,
        999,
      );
    s.resources.food = clamp(s.resources.food - 0.03 * count * factor * dt, 0, 999);
    s.resources.water = clamp(
      s.resources.water -
        0.045 * count * factor * dt * (s.research.includes('recycling') ? 0.5 : 1),
      0,
      999,
    );
    s.oxygen = clamp(
      s.oxygen +
        (s.power && s.rooms.ventilation.integrity > 20
          ? 0.18 * s.rooms.ventilation.level
          : -0.65 * factor) *
          dt,
    );
    for (const id of ['generator', 'ventilation', 'water'] as const)
      s.rooms[id].integrity = clamp(s.rooms[id].integrity - 0.018 * factor * dt);
    s.threat = clamp(
      s.threat + (0.045 + s.day * 0.008) * factor * dt * (s.hour >= 20 || s.hour < 6 ? 1.6 : 1),
    );
    if (s.threat >= 85) {
      s.threat = 42;
      s.stats.attacks++;
      const damage = (18 + s.day * 2) * (s.research.includes('fortification') ? 0.5 : 1);
      s.rooms.airlock.integrity = clamp(s.rooms.airlock.integrity - damage);
      if (s.rooms.airlock.integrity < 20)
        for (const p of s.players.filter((p) => p.connected && !p.expedition))
          p.hp = clamp(p.hp - 25);
      log(
        s,
        `Нападение! Шлюз потерял ${Math.round(damage)}% прочности.${s.rooms.airlock.integrity < 20 ? ' Заражённые прорвались внутрь!' : ''}`,
        'danger',
      );
    }
    s.morale = clamp(
      s.morale +
        ((s.resources.food > 20 && s.oxygen > 60 ? 0.015 : -0.06) - (100 - s.oxygen) / 2000) * dt,
    );
    for (const p of s.players) {
      if (p.task && p.task.endsAt <= s.elapsed) this.finish(p);
      if (!p.connected || p.hp <= 0) continue;
      p.stress = clamp(
        p.stress + ((s.oxygen < 40 || !s.power ? 0.12 : -0.01) + (s.morale < 25 ? 0.08 : 0)) * dt,
      );
      if (s.oxygen < 20 || s.resources.water <= 0 || s.resources.food <= 0)
        p.hp = clamp(p.hp - 0.35 * factor * dt);
      if (s.oxygen < 35) p.infection = clamp(p.infection + 0.04 * dt);
      if (p.infection > 65) p.hp = clamp(p.hp - 0.12 * dt);
      if (p.task || p.expedition) continue;
      if (this.challenges.get(p.id)?.expiresAt! < s.elapsed) this.challenges.delete(p.id);
      let vx = 0,
        vy = 0;
      const speed = 200 * (p.energy < 15 ? 0.6 : 1) * (p.stress > 80 ? 0.8 : 1);
      const input = this.inputs.get(p.id);
      if (input && input.until >= s.elapsed) {
        vx = input.x;
        vy = input.y;
      } else if (p.path.length) {
        const target = p.path[0],
          dx = target.x - p.x,
          dy = target.y - p.y,
          distance = Math.hypot(dx, dy);
        if (distance < 2) p.path.shift();
        else {
          vx = (dx / distance) * Math.min(1, distance / (speed * dt));
          vy = (dy / distance) * Math.min(1, distance / (speed * dt));
        }
      }
      sweep(p, vx * speed * dt, vy * speed * dt);
      p.energy = clamp(p.energy - (vx || vy ? 0.09 : 0.025) * dt);
    }
    this.expeditionTick();
    if (s.crisis && s.elapsed >= s.crisis.endsAt) {
      const counts = s.crisis.choices.map(
        (_, i) => s.players.filter((p) => p.connected && s.crisis!.votes[p.id] === i).length,
      );
      this.resolveEvent(counts.indexOf(Math.max(...counts)));
    }
    if (!s.crisis && s.elapsed >= s.nextEvent && s.phase === 'playing') {
      this.createEvent();
      s.nextEvent = s.elapsed + 75 + random(s) * 35;
    }
    const achievements = [
      s.stats.repairs >= 5 && 'Мастер на все руки',
      s.stats.expeditions >= 3 && 'По ту сторону двери',
      s.research.length >= 3 && 'Свет разума',
      s.stats.rescued >= 2 && 'Никто не забыт',
      s.day >= 7 && 'Семь рассветов',
    ];
    for (const a of achievements)
      if (a && !s.achievements.includes(a)) {
        s.achievements.push(a);
        log(s, `Достижение: ${a}.`, 'good');
      }
    this.maintenanceTick();
    for (const mission of missions(s))
      if (mission.done && !s.missionsDone.includes(mission.id)) {
        s.missionsDone.push(mission.id);
        this.add(mission.reward);
        log(s, `Задание «${mission.title}» выполнено. Награда добавлена на склад.`, 'good');
      }
    if (s.players.length && s.players.every((p) => p.hp <= 0)) {
      s.phase = 'ended';
      s.ending = 'Убежище замолчало. Никто не ответил на последний вызов.';
      log(s, s.ending, 'danger');
    }
  }
}
