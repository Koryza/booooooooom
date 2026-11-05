import type { Role } from './validation.js';
export const ROLE_INFO: Record<
  Role,
  { name: string; short: string; bonus: string; color: string }
> = {
  engineer: {
    name: 'Инженер',
    short: 'ИНЖ',
    bonus: '+60% к эффективности ремонта',
    color: '#eac16c',
  },
  medic: {
    name: 'Медик',
    short: 'МЕД',
    bonus: '+20 к лечению, двойное снижение инфекции',
    color: '#e99990',
  },
  soldier: {
    name: 'Военный',
    short: 'ВОЕН',
    bonus: 'Сильнее защищает шлюз, снижает риск экспедиции',
    color: '#9fb981',
  },
  scientist: {
    name: 'Учёный',
    short: 'НАУК',
    bonus: 'Исследования дешевле на 30%, гарантированный архив в рейде',
    color: '#91bfe1',
  },
  scout: {
    name: 'Разведчик',
    short: 'РАЗВ',
    bonus: '+40% добычи, снижает риск экспедиции',
    color: '#c4a6e5',
  },
  mechanic: {
    name: 'Механик',
    short: 'МЕХ',
    bonus: 'Крафт и улучшения дешевле на 30%',
    color: '#e5a875',
  },
};
export const AVATAR_COLORS = ['#b5d879', '#e3b66b', '#83b3cd', '#c896ae', '#b29bdb', '#e29079'];
export const RESOURCE_INFO = {
  food: { name: 'Еда', unit: 'порц.' },
  water: { name: 'Вода', unit: 'л' },
  fuel: { name: 'Топливо', unit: 'л' },
  parts: { name: 'Детали', unit: 'шт.' },
  medicine: { name: 'Медикаменты', unit: 'ед.' },
  ammo: { name: 'Боеприпасы', unit: 'шт.' },
  electronics: { name: 'Электроника', unit: 'шт.' },
  seeds: { name: 'Семена', unit: 'шт.' },
} as const;
export type Resource = keyof typeof RESOURCE_INFO;
export type Resources = Record<Resource, number>;
export type Cost = Partial<Resources>;
export const WORLD = { width: 1130, height: 716 };
export const ROOM_INFO = [
  {
    id: 'command',
    name: 'Командный центр',
    label: 'КОМАНДНЫЙ ЦЕНТР',
    icon: 'radio',
    color: '#a3b884',
    desc: 'Управление убежищем, исследования и общий курс.',
  },
  {
    id: 'living',
    name: 'Жилой блок',
    label: 'ЖИЛОЙ БЛОК',
    icon: 'bed',
    color: '#b0a18b',
    desc: 'Сон и отдых восстанавливают силы и снижают стресс.',
  },
  {
    id: 'generator',
    name: 'Генераторная',
    label: 'ГЕНЕРАТОРНАЯ',
    icon: 'power',
    color: '#d5b873',
    desc: 'Сердце бункера. Без топлива отключатся вода и вентиляция.',
  },
  {
    id: 'medical',
    name: 'Медпункт',
    label: 'МЕДПУНКТ',
    icon: 'cross',
    color: '#bd8f88',
    desc: 'Лечение ран, инфекции и изготовление аптечек.',
  },
  {
    id: 'storage',
    name: 'Склад',
    label: 'ОБЩИЙ СКЛАД',
    icon: 'box',
    color: '#b7ad8a',
    desc: 'Общие припасы, личное снаряжение и переработка.',
  },
  {
    id: 'kitchen',
    name: 'Кухня',
    label: 'КУХНЯ',
    icon: 'food',
    color: '#bfad7d',
    desc: 'Горячая еда поддерживает здоровье и мораль.',
  },
  {
    id: 'water',
    name: 'Очистка воды',
    label: 'ОЧИСТКА ВОДЫ',
    icon: 'drop',
    color: '#7ca8b5',
    desc: 'Фильтруйте воду. Сломанная система не работает без энергии.',
  },
  {
    id: 'ventilation',
    name: 'Вентиляционная',
    label: 'ВЕНТИЛЯЦИЯ',
    icon: 'fan',
    color: '#85aaa2',
    desc: 'Воздухообмен и фильтры защищают от удушья и инфекции.',
  },
  {
    id: 'workshop',
    name: 'Мастерская',
    label: 'МАСТЕРСКАЯ',
    icon: 'tool',
    color: '#b99d80',
    desc: 'Крафт, строительство и улучшения всех помещений.',
  },
  {
    id: 'armory',
    name: 'Оружейная',
    label: 'ОРУЖЕЙНАЯ',
    icon: 'shield',
    color: '#99a086',
    desc: 'Боеприпасы и оборона. Угроза у шлюза растёт с каждым днём.',
  },
  {
    id: 'airlock',
    name: 'Шлюз',
    label: 'ШЛЮЗ / ПОВЕРХНОСТЬ',
    icon: 'exit',
    color: '#bd8973',
    desc: 'Экспедиции в заражённый город. Не выходите без снаряжения.',
  },
  {
    id: 'greenhouse',
    name: 'Гидропоника',
    label: 'ГИДРОПОНИКА',
    icon: 'leaf',
    color: '#88b17e',
    desc: 'Постройте ферму, чтобы выращивать еду из семян.',
  },
].map((r, i) => ({ ...r, x: 30 + (i % 4) * 270, y: 48 + Math.floor(i / 4) * 210, w: 250, h: 160 }));
export type RoomId =
  | 'command'
  | 'living'
  | 'generator'
  | 'medical'
  | 'storage'
  | 'kitchen'
  | 'water'
  | 'ventilation'
  | 'workshop'
  | 'armory'
  | 'airlock'
  | 'greenhouse';
export const getRoom = (id: string) => ROOM_INFO.find((r) => r.id === id)!;
export type ActionId =
  | 'repair'
  | 'rest'
  | 'eat'
  | 'purify'
  | 'vent'
  | 'treat'
  | 'defend'
  | 'salvage'
  | 'grow'
  | 'search';
export const ACTION_INFO: Record<
  ActionId,
  { name: string; room?: RoomId; cost: Cost; seconds: number; skill?: boolean; desc: string }
> = {
  repair: {
    name: 'Починить оборудование',
    cost: { parts: 5 },
    seconds: 8,
    skill: true,
    desc: 'Восстанавливает 22–48% прочности. Решите схему проводки.',
  },
  rest: {
    name: 'Отдохнуть',
    room: 'living',
    cost: {},
    seconds: 10,
    desc: '+35 сил, −22 стресса, +6 здоровья.',
  },
  eat: {
    name: 'Приготовить обед',
    room: 'kitchen',
    cost: { food: 3, water: 2 },
    seconds: 6,
    desc: 'Вся команда получает силы, здоровье и меньше стресса.',
  },
  purify: {
    name: 'Очистить воду',
    room: 'water',
    cost: { fuel: 2 },
    seconds: 7,
    skill: true,
    desc: '+25 литров чистой воды. Нужны энергия и рабочий фильтр.',
  },
  vent: {
    name: 'Заменить фильтры',
    room: 'ventilation',
    cost: { parts: 3 },
    seconds: 6,
    skill: true,
    desc: '+25 кислорода, восстанавливает вентиляцию.',
  },
  treat: {
    name: 'Лечить команду',
    room: 'medical',
    cost: { medicine: 2, water: 2 },
    seconds: 8,
    skill: true,
    desc: 'Лечит всех в медпункте и уменьшает инфекцию.',
  },
  defend: {
    name: 'Отбить заражённых',
    room: 'armory',
    cost: { ammo: 5 },
    seconds: 8,
    desc: 'Снижает угрозу на 22–42 и защищает дверь.',
  },
  salvage: {
    name: 'Разобрать хлам',
    room: 'storage',
    cost: {},
    seconds: 12,
    desc: '+5 деталей, иногда электроника. Расходует силы.',
  },
  grow: {
    name: 'Собрать урожай',
    room: 'greenhouse',
    cost: { seeds: 2, water: 5 },
    seconds: 14,
    desc: '+24 еды. Нужны энергия и построенная гидропоника.',
  },
  search: {
    name: 'Прослушать эфир',
    room: 'command',
    cost: { fuel: 1 },
    seconds: 12,
    skill: true,
    desc: 'Понижает угрозу, шанс найти архив или электронику.',
  },
};
export const TECH_INFO = [
  {
    id: 'recycling',
    name: 'Замкнутый водооборот',
    desc: 'Вода расходуется вдвое медленнее.',
    cost: { electronics: 8, parts: 12 },
    requires: [],
  },
  {
    id: 'solar',
    name: 'Солнечный контур',
    desc: 'Днём генератор не расходует топливо.',
    cost: { electronics: 12, parts: 18 },
    requires: [],
  },
  {
    id: 'hydroponics',
    name: 'Гидропоника',
    desc: 'Открывает строительство фермы.',
    cost: { electronics: 8, seeds: 4 },
    requires: ['recycling'],
  },
  {
    id: 'fortification',
    name: 'Периметр обороны',
    desc: 'Вдвое меньше урона при нападениях.',
    cost: { parts: 20, ammo: 10 },
    requires: [],
  },
  {
    id: 'radio',
    name: 'Дальняя связь',
    desc: 'Открывает эвакуацию с пятого дня при наличии 3 архивов.',
    cost: { electronics: 18, parts: 15 },
    requires: ['solar'],
  },
  {
    id: 'vaccine',
    name: 'Протокол «Рассвет»',
    desc: 'Изучив 5 архивов, можно синтезировать вакцину.',
    cost: { medicine: 15, electronics: 20 },
    requires: ['radio'],
  },
] satisfies { id: string; name: string; desc: string; cost: Cost; requires: string[] }[];
export const RECIPES = [
  {
    id: 'medkit',
    name: 'Аптечка',
    cost: { medicine: 2, parts: 1 },
    desc: 'Личная аптечка: +35 здоровья, −15 инфекции.',
  },
  {
    id: 'ration',
    name: 'Паёк',
    cost: { food: 3, water: 1 },
    desc: 'Личный паёк: +25 сил, −12 стресса.',
  },
  {
    id: 'armor',
    name: 'Бронежилет',
    cost: { parts: 12 },
    desc: 'Личная броня уменьшает урон в экспедиции на 50%.',
  },
  {
    id: 'ammo',
    name: 'Боеприпасы ×15',
    cost: { parts: 5, electronics: 1 },
    desc: 'Пополнение общего запаса боеприпасов.',
  },
  {
    id: 'medicine',
    name: 'Медикаменты ×6',
    cost: { food: 2, seeds: 2 },
    desc: 'Пополнение общего запаса медикаментов.',
  },
] satisfies { id: string; name: string; cost: Cost; desc: string }[];
export const ZONES = [
  {
    id: 'market',
    name: 'Старый супермаркет',
    type: 'Бродячие',
    risk: 16,
    seconds: 38,
    desc: 'Тихие проходы, остатки еды и воды.',
    loot: { food: 28, water: 20, seeds: 4 },
  },
  {
    id: 'hospital',
    name: 'Больница № 6',
    type: 'Плевуны',
    risk: 32,
    seconds: 50,
    desc: 'Лекарства и архивы. Высокий риск заражения.',
    loot: { medicine: 12, water: 10, electronics: 5 },
  },
  {
    id: 'factory',
    name: 'Завод «Север»',
    type: 'Бегуны',
    risk: 26,
    seconds: 45,
    desc: 'Детали, канистры и аккумуляторы.',
    loot: { parts: 28, fuel: 22, electronics: 8 },
  },
  {
    id: 'checkpoint',
    name: 'Военный блокпост',
    type: 'Громилы',
    risk: 45,
    seconds: 60,
    desc: 'Боеприпасы и военные радиограммы.',
    loot: { ammo: 35, parts: 15, electronics: 12 },
  },
  {
    id: 'lab',
    name: 'Комплекс «Рассвет»',
    type: 'Носители',
    risk: 58,
    seconds: 70,
    desc: 'Источник инфекции. Редкие архивы проекта.',
    loot: { medicine: 16, electronics: 22, fuel: 14 },
  },
] satisfies {
  id: string;
  name: string;
  type: string;
  risk: number;
  seconds: number;
  desc: string;
  loot: Cost;
}[];
export const STORY = [
  'День −12. Проект «Рассвет»: регенерация нервных тканей. Клинические испытания одобрены без контрольной группы.',
  'День −3. Пациент 06 пришёл в сознание после остановки сердца. Свет вызывает агрессию. Сотрудники отказываются выходить в ночную смену.',
  'День 0. Сигнал эвакуации отменён. Лаборатория герметизирована. Кто-то открыл аварийный выход изнутри.',
  'День 4. Инфекция переносится спорами. Исправная вентиляция — единственный способ остановить передачу в замкнутом помещении.',
  'Протокол «Рассвет». Антитела выживших устойчивы. Для синтеза нужны чистая вода, энергия и медицинская лаборатория. Ещё не поздно.',
];
