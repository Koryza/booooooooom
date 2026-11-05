import { randomUUID } from 'node:crypto';
import type { Challenge, GameCommand, GameState, Player } from '../shared/types.js';
import { ACTION_INFO, RESOURCE_INFO, getRoom, type Resource, type Cost, type ActionId, type RoomId } from '../shared/catalog.js';
import { affordable, missions } from '../shared/rules.js';
import { roomAt, route, sweep } from '../shared/navigation.js';
import { clamp, log, random } from './state.js';
export class Engine {
  readonly challenges = new Map<string, Challenge>();
  private inputs = new Map<string, { x: number; y: number; until: number }>();
  constructor(readonly state: GameState) {}
  private pay(cost: Cost) {
    if (!affordable(this.state.resources, cost)) throw new Error('Недостаточно общих ресурсов');
    for (const [k, amount] of Object.entries(cost)) this.state.resources[k as Resource] -= amount;
  }
  private add(cost: Cost, multiplier = 1) { for (const [k, amount] of Object.entries(cost)) this.state.resources[k as Resource] = clamp(this.state.resources[k as Resource] + amount * multiplier, 0, 999); }
  private at(p: Player, room: RoomId) {
    if (roomAt(p) !== room) throw new Error(`Подойдите в помещение «${getRoom(room).name}»`);
    if (!this.state.rooms[room].built) throw new Error('Помещение ещё не построено');
  }
  private available(p: Player, allowDowned = false) {
    if (!p.connected) throw new Error('Нет соединения');
    if (!allowDowned && p.hp <= 0) throw new Error('Вы без сознания. Используйте аптечку или дождитесь медика.');
    if (p.expedition) throw new Error('Вы в экспедиции');
    if (p.task) throw new Error('Сначала завершите текущее действие');
  }
  private checkAction(p: Player, action: ActionId, room: RoomId) {
    const s = this.state, info = ACTION_INFO[action]; this.available(p); this.at(p, room);
    if (info.room && info.room !== room) throw new Error('Здесь это действие недоступно');
    if (action === 'repair' && s.rooms[room].integrity >= 99) throw new Error('Ремонт не требуется');
    if (action !== 'rest' && p.energy < 8) throw new Error('Нет сил. Отдохните в жилом блоке или используйте паёк.');
    if (['purify', 'grow'].includes(action) && (!s.power || s.rooms[room].integrity < 20)) throw new Error('Нужны питание и исправное оборудование');
    if (action === 'treat' && !s.players.some(x => roomAt(x) === 'medical' && (x.hp < 99 || x.infection > 0))) throw new Error('В медпункте никто не нуждается в лечении');
    if (!affordable(s.resources, info.cost)) throw new Error('Недостаточно общих ресурсов');
  }
  private task(p: Player, action: string, room: RoomId, label: string, seconds: number, quality = 1, target?: string) {
    p.path = []; this.inputs.delete(p.id);
    p.task = { action, room, label, startedAt: this.state.elapsed, endsAt: this.state.elapsed + seconds, quality, target };
  }
  command(p: Player, cmd: GameCommand): Challenge | null {
    const s = this.state;
    if (s.phase !== 'playing') throw new Error('Игра ещё не началась или уже завершена');
    if (cmd.type === 'cancel') { this.challenges.delete(p.id); return null; }
    if (cmd.type === 'challenge') {
      const c = this.challenges.get(p.id); this.challenges.delete(p.id);
      if (!c || c.id !== cmd.id || c.expiresAt < s.elapsed) throw new Error('Схема устарела. Начните действие заново.');
      if (cmd.answer.join(',') !== c.sequence.join(',')) { p.energy = clamp(p.energy - 4); throw new Error('Контакт не совпал. Потеряно 4 силы. Попробуйте снова.'); }
      this.checkAction(p, c.action as ActionId, c.room); this.pay(ACTION_INFO[c.action as ActionId].cost);
      this.task(p, c.action, c.room, ACTION_INFO[c.action as ActionId].name, ACTION_INFO[c.action as ActionId].seconds, 1.2);
      return null;
    }
    if (cmd.type === 'use') {
      this.available(p, true);
      if (p.inventory[cmd.item] <= 0) throw new Error('Предмета нет в рюкзаке');
      p.inventory[cmd.item]--;
      if (cmd.item === 'medkit') { p.hp = clamp(p.hp + 35); p.infection = clamp(p.infection - 15); }
      else { p.energy = clamp(p.energy + 25); p.stress = clamp(p.stress - 12); }
      log(s, `${p.name} использовал ${cmd.item === 'medkit' ? 'аптечку' : 'паёк'}.`, 'good'); return null;
    }
    this.available(p);
    if (cmd.type === 'move') {
      if (this.challenges.has(p.id)) throw new Error('Завершите или закройте схему');
      const len = Math.max(1, Math.hypot(cmd.x, cmd.y));
      this.inputs.set(p.id, { x: cmd.x / len, y: cmd.y / len, until: s.elapsed + 0.3 });
      if (cmd.x || cmd.y) p.path = []; return null;
    }
    if (cmd.type === 'travel') {
      if (this.challenges.has(p.id)) throw new Error('Завершите или закройте схему');
      if (!s.rooms[cmd.room].built) throw new Error('Помещение ещё не построено');
      this.inputs.delete(p.id); p.path = route(p, cmd.room); return null;
    }
    if (cmd.type === 'act') {
      this.checkAction(p, cmd.action, cmd.room); this.inputs.delete(p.id); p.path = [];
      if (ACTION_INFO[cmd.action].skill) {
        const challenge: Challenge = { id: randomUUID(), action: cmd.action, room: cmd.room, expiresAt: s.elapsed + 25, sequence: Array.from({ length: 4 }, () => Math.floor(random(s) * 4)) };
        this.challenges.set(p.id, challenge); return challenge;
      }
      this.pay(ACTION_INFO[cmd.action].cost);
      this.task(p, cmd.action, cmd.room, ACTION_INFO[cmd.action].name, ACTION_INFO[cmd.action].seconds); return null;
    }
    throw new Error('Действие пока недоступно');
  }
  private finish(p: Player) {
    const task = p.task!; const s = this.state, q = task.quality, r = s.rooms[task.room];
    p.task = null; p.xp += 15; p.energy = clamp(p.energy - (task.action === 'rest' ? 0 : 7));
    switch (task.action) {
      case 'repair': r.integrity = clamp(r.integrity + (p.role === 'engineer' ? 40 : 25) * q + Math.min(10, p.xp / 100)); s.stats.repairs++; break;
      case 'rest': p.energy = clamp(p.energy + 35); p.stress = clamp(p.stress - 22); p.hp = clamp(p.hp + 6); break;
      case 'eat': for (const friend of s.players.filter(x => x.connected && !x.expedition)) { friend.energy = clamp(friend.energy + 14); friend.stress = clamp(friend.stress - 10); friend.hp = clamp(friend.hp + 5); } s.morale = clamp(s.morale + 5); break;
      case 'purify': this.add({ water: 25 + r.level * 3 }); r.integrity = clamp(r.integrity - 3); break;
      case 'vent': s.oxygen = clamp(s.oxygen + 25); r.integrity = clamp(r.integrity + 12 * q); break;
      case 'treat': for (const friend of s.players.filter(x => !x.expedition && roomAt(x) === 'medical')) { friend.hp = clamp(friend.hp + (p.role === 'medic' ? 55 : 32) * q); friend.infection = clamp(friend.infection - (p.role === 'medic' ? 40 : 20)); } break;
      case 'defend': s.threat = clamp(s.threat - (p.role === 'soldier' ? 42 : 24)); s.rooms.airlock.integrity = clamp(s.rooms.airlock.integrity + 5); break;
      case 'salvage': this.add({ parts: 5, ...(random(s) < .4 ? { electronics: 1 } : {}) }); break;
      case 'grow': this.add({ food: 24 + r.level * 4 }); break;
      case 'search': s.threat = clamp(s.threat - 8); if (random(s) < .4 && s.story.length < 5) { s.story.push(s.story.length); log(s, 'Перехвачен архив проекта «Рассвет». Читайте в журнале.', 'story'); } else this.add({ electronics: 2 }); break;
    }
    log(s, `${p.name}: ${task.label.toLowerCase()} — завершено.`, 'good');
  }
  tick(dt: number) {
    const s = this.state;
    if (s.phase !== 'playing' || !s.players.some(p => p.connected) || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 1); s.elapsed += dt;
    const previousDay = s.day; s.day = Math.floor(s.elapsed / 180) + 1; s.hour = (7 + s.elapsed / 7.5) % 24;
    if (s.day !== previousDay) { s.weather = (['clear', 'rain', 'fog', 'storm'] as const)[Math.floor(random(s) * 4)]; log(s, `День ${s.day}. Мы всё ещё здесь. Погода изменилась.`, 'story'); }
    const factor = { normal: 1, hard: 1.35, nightmare: 1.75 }[s.difficulty];
    const count = s.players.filter(p => p.connected).length;
    const solar = s.research.includes('solar') && s.hour >= 6 && s.hour < 19 && s.weather !== 'storm';
    s.power = s.rooms.generator.integrity > 15 && (s.resources.fuel > 0 || solar);
    if (s.power && !solar) s.resources.fuel = clamp(s.resources.fuel - .035 * factor * dt, 0, 999);
    s.resources.food = clamp(s.resources.food - .03 * count * factor * dt, 0, 999);
    s.resources.water = clamp(s.resources.water - .045 * count * factor * dt * (s.research.includes('recycling') ? .5 : 1), 0, 999);
    s.oxygen = clamp(s.oxygen + ((s.power && s.rooms.ventilation.integrity > 20) ? .18 * s.rooms.ventilation.level : -.65 * factor) * dt);
    for (const id of ['generator', 'ventilation', 'water'] as const) s.rooms[id].integrity = clamp(s.rooms[id].integrity - .018 * factor * dt);
    s.threat = clamp(s.threat + (.045 + s.day * .008) * factor * dt * (s.hour >= 20 || s.hour < 6 ? 1.6 : 1));
    if (s.threat >= 85) {
      s.threat = 42; s.stats.attacks++; const damage = (18 + s.day * 2) * (s.research.includes('fortification') ? .5 : 1);
      s.rooms.airlock.integrity = clamp(s.rooms.airlock.integrity - damage);
      if (s.rooms.airlock.integrity < 20) for (const p of s.players.filter(p => p.connected && !p.expedition)) p.hp = clamp(p.hp - 25);
      log(s, `Нападение! Шлюз потерял ${Math.round(damage)}% прочности.${s.rooms.airlock.integrity < 20 ? ' Заражённые прорвались внутрь!' : ''}`, 'danger');
    }
    s.morale = clamp(s.morale + ((s.resources.food > 20 && s.oxygen > 60 ? .015 : -.06) - (100 - s.oxygen) / 2000) * dt);
    for (const p of s.players) {
      if (p.task && p.task.endsAt <= s.elapsed) this.finish(p);
      if (p.task || p.expedition || !p.connected || p.hp <= 0) continue;
      if (this.challenges.get(p.id)?.expiresAt! < s.elapsed) this.challenges.delete(p.id);
      let vx = 0, vy = 0;
      const input = this.inputs.get(p.id);
      if (input && input.until >= s.elapsed) { vx = input.x; vy = input.y; }
      else if (p.path.length) {
        const target = p.path[0], dx = target.x - p.x, dy = target.y - p.y, distance = Math.hypot(dx, dy);
        if (distance < 2) p.path.shift(); else { vx = dx / distance * Math.min(1, distance / (200 * dt)); vy = dy / distance * Math.min(1, distance / (200 * dt)); }
      }
      sweep(p, vx * 200 * dt, vy * 200 * dt);
      p.energy = clamp(p.energy - (vx || vy ? .09 : .025) * dt);
      p.stress = clamp(p.stress + (s.oxygen < 40 || !s.power ? .12 : -.01) * dt);
      if (s.oxygen < 20 || s.resources.water <= 0 || s.resources.food <= 0) p.hp = clamp(p.hp - .35 * factor * dt);
      if (s.oxygen < 35) p.infection = clamp(p.infection + .04 * dt);
      if (p.infection > 65) p.hp = clamp(p.hp - .12 * dt);
    }
    for (const mission of missions(s)) if (mission.done && !s.missionsDone.includes(mission.id)) { s.missionsDone.push(mission.id); this.add(mission.reward); log(s, `Задание «${mission.title}» выполнено. Награда добавлена на склад.`, 'good'); }
    if (s.players.length && s.players.every(p => p.hp <= 0)) { s.phase = 'ended'; s.ending = 'Убежище замолчало. Никто не ответил на последний вызов.'; log(s, s.ending, 'danger'); }
  }
}
