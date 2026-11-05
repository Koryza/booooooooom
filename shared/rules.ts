import { RESOURCE_INFO, type Cost, type Resources, type Resource } from './catalog.js';
import type { GameState, Mission } from './types.js';
export function costText(cost: Cost): string {
  return (
    Object.entries(cost)
      .map(([k, v]) => `${v} ${RESOURCE_INFO[k as Resource].name.toLowerCase()}`)
      .join(' · ') || 'Без ресурсов'
  );
}
export function discounted(cost: Cost, multiplier: number): Cost {
  return Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.ceil(v * multiplier)]));
}
export function affordable(resources: Resources, cost: Cost): boolean {
  return Object.entries(cost).every(([k, v]) => resources[k as Resource] >= v);
}
export function missions(s: GameState): Mission[] {
  return [
    {
      id: 'restore',
      title: 'Сердце убежища',
      desc: 'Восстановить генератор до 90%.',
      done: s.rooms.generator.integrity >= 90,
      reward: { parts: 10, fuel: 10 },
    },
    {
      id: 'air',
      title: 'Глоток воздуха',
      desc: 'Поднять кислород до 98%.',
      done: s.oxygen >= 98,
      reward: { medicine: 4 },
    },
    {
      id: 'first-raid',
      title: 'Никто не забыт',
      desc: 'Вернуться из первой экспедиции.',
      done: s.stats.expeditions >= 1,
      reward: { electronics: 5, food: 10 },
    },
    {
      id: 'science',
      title: 'Знание — сила',
      desc: 'Завершить первое исследование.',
      done: s.research.length >= 1,
      reward: { parts: 12, electronics: 5 },
    },
    {
      id: 'farm',
      title: 'Жизнь под землёй',
      desc: 'Построить гидропонику.',
      done: s.rooms.greenhouse.built,
      reward: { seeds: 10, water: 20 },
    },
    {
      id: 'week',
      title: 'Мы всё ещё здесь',
      desc: 'Дожить до седьмого дня.',
      done: s.day >= 7,
      reward: { food: 30, water: 30, fuel: 20 },
    },
  ];
}
