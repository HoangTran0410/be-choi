/**
 * Ngày của bạn nhỏ — the pure rules: the four parts of the day and the little jobs in each,
 * what a day brings (weather, a surprise), how the little friend feels, and what gets
 * unlocked as days go by. No DOM in here, so all of it can be tested.
 */
import { mulberry32, shuffle } from '../../core/dom';
import { RECIPES, type Recipe } from '../cooking/logic';
import { GARMENTS, SCENARIOS, SLOTS, fits, type Garment, type Scenario, type Slot } from '../dressup/logic';
import type { Mood as FeelMood } from '../feelings/logic';

/** Up to `n` distinct elements; fewer if there are not enough (unlike `pick`, never throws). */
export function take<T>(arr: readonly T[], n: number, rng: () => number = Math.random): T[] {
  return shuffle(arr, rng).slice(0, Math.max(0, n));
}

// ---------------------------------------------------------------- the day

export type PeriodId = 'morning' | 'noon' | 'afternoon' | 'evening';

export interface Period {
  id: PeriodId;
  /** Shown on the sun track. */
  icon: string;
  /** Said when the sky changes into this part of the day. */
  say: string;
}

export const PERIODS: readonly Period[] = [
  { id: 'morning', icon: '🌅', say: 'Trời sáng rồi… bạn nhỏ… thức dậy nào!' },
  { id: 'noon', icon: '☀️', say: 'Trưa rồi… nắng to quá!' },
  { id: 'afternoon', icon: '🌤️', say: 'Chiều rồi… trời dịu lại.' },
  { id: 'evening', icon: '🌙', say: 'Tối rồi… trời lên sao.' },
];

export type TaskId = 'dress' | 'breakfast' | 'teeth' | 'outing' | 'pet' | 'bath' | 'party' | 'comfort' | 'bed';

export interface TaskDef {
  id: TaskId;
  icon: string;
  /** Read by a parent / used as aria-label; the child goes by the picture. */
  label: string;
  /** Index into `PERIODS`. */
  period: number;
  /** Said when the job opens. */
  say: string;
}

export const TASKS: readonly TaskDef[] = [
  { id: 'dress', icon: '👕', label: 'Mặc đồ', period: 0, say: 'Mặc đồ cho bạn nhỏ nào!' },
  { id: 'breakfast', icon: '🍳', label: 'Ăn sáng', period: 0, say: 'Bạn nhỏ đói rồi… nấu bữa sáng nhé!' },
  { id: 'teeth', icon: '🪥', label: 'Đánh răng', period: 0, say: 'Đánh răng cho sạch nào!' },
  { id: 'outing', icon: '🌳', label: 'Đi chơi', period: 1, say: 'Ra ngoài chơi thôi!' },
  { id: 'pet', icon: '🐶', label: 'Cho thú ăn', period: 1, say: 'Các bạn thú đói rồi… cho ăn nhé!' },
  { id: 'bath', icon: '🛁', label: 'Tắm', period: 2, say: 'Bạn nhỏ bẩn rồi… tắm nào!' },
  { id: 'party', icon: '🍰', label: 'Làm bánh', period: 2, say: 'Làm bánh nào!' },
  { id: 'comfort', icon: '🤗', label: 'Dỗ bạn nhỏ', period: 3, say: 'Bạn nhỏ không vui… dỗ bạn nhé!' },
  { id: 'bed', icon: '🛏️', label: 'Đi ngủ', period: 3, say: 'Tới giờ ngủ rồi… ru bạn nhỏ ngủ nhé!' },
];

export function taskDef(id: TaskId): TaskDef {
  const t = TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`day: unknown task ${id}`);
  return t;
}

// -------------------------------------------------------------- what a day brings

export type Weather = 'sunny' | 'rainy' | 'cold';
/** Something special about the day. `none` is an ordinary day. */
export type DayEvent = 'none' | 'rain' | 'birthday' | 'friend';
export const EVENTS: readonly DayEvent[] = ['none', 'rain', 'birthday', 'friend'];

export type UpsetMood = 'sad' | 'angry' | 'surprised';
export type Mood = FeelMood | 'hungry';

export interface DayPlan {
  /** 1 for the very first day. */
  dayNo: number;
  weather: Weather;
  event: DayEvent;
  /** Which family photo / family member shows up on a `friend` day. */
  friendIdx: number;
  /** What the little friend gets upset about in the evening. */
  upset: UpsetMood;
  seed: number;
}

/** Candles on the cake on a birthday. */
export const BIRTHDAY_AGE = 3;

/**
 * The plan for day number `dayNo`. The same seed and day give the same plan; an event never
 * repeats the one before it, and the very first day is a plain, sunny one.
 */
export function makePlan(dayNo: number, seed: number, prev: DayEvent | null = null): DayPlan {
  const rng = mulberry32((seed ^ Math.imul(dayNo, 7919)) >>> 0);
  let event: DayEvent = 'none';
  if (dayNo > 1) {
    const pool = (['none', 'rain', 'birthday', 'friend', 'rain', 'friend'] as const).filter((e) => e === 'none' || e !== prev);
    event = pool[Math.floor(rng() * pool.length)] ?? 'none';
  }
  const w = rng();
  const weather: Weather = event === 'rain' ? 'rainy' : dayNo === 1 || w < 0.7 ? 'sunny' : 'cold';
  const upsets: readonly UpsetMood[] = ['sad', 'angry', 'surprised'];
  return {
    dayNo,
    weather,
    event,
    friendIdx: Math.floor(rng() * 1000),
    upset: upsets[Math.floor(rng() * upsets.length)] ?? 'sad',
    seed: Math.floor(rng() * 1e9),
  };
}

export function scenarioOf(plan: DayPlan): Scenario {
  return SCENARIOS.find((s) => s.id === plan.weather) ?? (SCENARIOS[0] as Scenario);
}

/** Said at the start of the day. */
export function dayLine(plan: DayPlan): string {
  switch (plan.event) {
    case 'rain':
      return 'Hôm nay… trời mưa!';
    case 'birthday':
      return 'Hôm nay… là sinh nhật bạn nhỏ!';
    case 'friend':
      return 'Hôm nay… có khách đến chơi!';
    default:
      return plan.dayNo === 1 ? 'Một ngày mới… bắt đầu nào!' : 'Ngày mới rồi… cùng chơi nhé!';
  }
}

export function dayIcon(plan: DayPlan): string {
  if (plan.event === 'rain') return '☔';
  if (plan.event === 'birthday') return '🎂';
  if (plan.event === 'friend') return '🚪';
  return plan.weather === 'cold' ? '❄️' : '🌞';
}

// ---------------------------------------------------------------- family visitor

export interface Visitor {
  emoji: string;
  /** Spoken name: "Mẹ", "Ba"… */
  name: string;
}
export const VISITORS: readonly Visitor[] = [
  { emoji: '👩', name: 'Mẹ' },
  { emoji: '👨', name: 'Ba' },
  { emoji: '👵', name: 'Bà' },
  { emoji: '👴', name: 'Ông' },
  { emoji: '🧒', name: 'bạn nhỏ' },
];
const RELATIVE: Visitor = { emoji: '🧑', name: 'người thân' };

/** Who comes to play: a family photo if there are any, otherwise a drawn person. */
export function visitorOf(plan: DayPlan, photoCount: number): { photoIndex: number | null; visitor: Visitor } {
  if (photoCount > 0) return { photoIndex: plan.friendIdx % photoCount, visitor: RELATIVE };
  return { photoIndex: null, visitor: VISITORS[plan.friendIdx % VISITORS.length] ?? RELATIVE };
}

/** "Ai đến chơi nhỉ? Mẹ!" */
export function visitorLine(v: Visitor): string {
  return v === RELATIVE ? 'Ai đến chơi nhỉ?… Người thân của bé đến chơi!' : `Ai đến chơi nhỉ?… ${v.name}!`;
}

// ---------------------------------------------------------------- progress through a day

export interface DayState {
  /** Index into `PERIODS`. */
  period: number;
  done: TaskId[];
}

export function newDay(): DayState {
  return { period: 0, done: [] };
}

export function tasksOf(period: number): TaskDef[] {
  return TASKS.filter((t) => t.period === period);
}

export function isDone(s: DayState, id: TaskId): boolean {
  return s.done.includes(id);
}

export function periodDone(s: DayState, period = s.period): boolean {
  return tasksOf(period).every((t) => isDone(s, t.id));
}

export interface Step {
  state: DayState;
  /** This job finished the part of the day. */
  periodDone: boolean;
  /** …and it was the last part, so the day is over. */
  dayDone: boolean;
}

/**
 * A job is finished. Idempotent. Moves on to the next part of the day when the last job of
 * this one is done; it never goes backwards and never skips a part.
 */
export function complete(s: DayState, id: TaskId): Step {
  const def = taskDef(id);
  const done = s.done.includes(id) ? s.done : [...s.done, id];
  const cur = { period: s.period, done };
  const finishedPeriod = def.period === s.period && periodDone(cur);
  if (!finishedPeriod) return { state: cur, periodDone: false, dayDone: false };
  const last = s.period >= PERIODS.length - 1;
  return { state: { period: last ? s.period : s.period + 1, done }, periodDone: true, dayDone: last };
}

export function progressOf(s: DayState): { done: number; total: number } {
  return { done: s.done.length, total: TASKS.length };
}

/** How the little friend feels right now. */
export function moodOf(s: DayState, plan: DayPlan): Mood {
  if (s.period === 0 && !isDone(s, 'breakfast')) return 'hungry';
  if (s.period === 3) return isDone(s, 'comfort') ? 'sleepy' : plan.upset;
  return 'happy';
}

// ---------------------------------------------------------------- unlocks

export type UnlockKind = 'outfit' | 'food' | 'toy';
export interface Unlock {
  /** Number of finished days that opens it. */
  at: number;
  kind: UnlockKind;
  /** Outfit and toy: the emoji. Food: the recipe id. */
  id: string;
  emoji: string;
  name: string;
}

export const UNLOCKS: readonly Unlock[] = [
  { at: 1, kind: 'outfit', id: '👑', emoji: '👑', name: 'vương miện' },
  { at: 2, kind: 'food', id: 'banana-smoothie', emoji: '🍹', name: 'sinh tố chuối' },
  { at: 2, kind: 'toy', id: '🪁', emoji: '🪁', name: 'con diều' },
  { at: 3, kind: 'outfit', id: '🎩', emoji: '🎩', name: 'mũ tròn' },
  { at: 3, kind: 'food', id: 'hot-noodles', emoji: '🍜', name: 'mì nóng' },
  { at: 4, kind: 'outfit', id: '👠', emoji: '👠', name: 'giày cao gót' },
  { at: 4, kind: 'toy', id: '🚲', emoji: '🚲', name: 'xe đạp' },
  { at: 5, kind: 'food', id: 'fried-rice', emoji: '🍛', name: 'cơm chiên' },
  { at: 5, kind: 'outfit', id: '🎀', emoji: '🎀', name: 'cái nơ' },
  { at: 6, kind: 'outfit', id: '👘', emoji: '👘', name: 'đồ ngủ' },
  { at: 6, kind: 'toy', id: '🎈', emoji: '🎈', name: 'bóng bay' },
  { at: 7, kind: 'food', id: 'pizza', emoji: '🍕', name: 'bánh pizza' },
  { at: 7, kind: 'toy', id: '🌈', emoji: '🌈', name: 'cầu vồng' },
  { at: 8, kind: 'food', id: 'veggie-soup', emoji: '🍲', name: 'súp rau' },
  { at: 8, kind: 'outfit', id: '👞', emoji: '👞', name: 'giày da' },
];

export function unlockedAt(days: number): Unlock[] {
  return UNLOCKS.filter((u) => u.at <= days);
}

/** What the day that has just been finished (the `days`-th) opened. */
export function justUnlocked(days: number): Unlock[] {
  return UNLOCKS.filter((u) => u.at === days);
}

const BASE_RECIPES: readonly string[] = ['strawberry-smoothie', 'fried-egg', 'pancake'];
const EXTRA_OUTFIT = new Set(UNLOCKS.filter((u) => u.kind === 'outfit').map((u) => u.id));

/** Garments for one slot: the everyday ones plus whatever has been unlocked. */
export function outfitPool(days: number, slot: Slot): Garment[] {
  const open = new Set(unlockedAt(days).filter((u) => u.kind === 'outfit').map((u) => u.id));
  return GARMENTS.filter((g) => g.slot === slot && (!EXTRA_OUTFIT.has(g.emoji) || open.has(g.emoji)));
}

export function recipePool(days: number): Recipe[] {
  const open = new Set([...BASE_RECIPES, ...unlockedAt(days).filter((u) => u.kind === 'food').map((u) => u.id)]);
  return RECIPES.filter((r) => open.has(r.id));
}

const OUTING: Record<Weather, readonly string[]> = {
  sunny: ['🦋', '⚽', '🌸', '🐞', '🐝'],
  rainy: ['🐸', '🐌', '☔', '🦆', '🐛'],
  cold: ['⛄', '🍂', '🐦', '🧤', '🐿️'],
};

/** Things to find outside: weather-themed, plus unlocked toys on a sunny day. */
export function outingPool(days: number, weather: Weather): string[] {
  const toys = unlockedAt(days).filter((u) => u.kind === 'toy').map((u) => u.emoji);
  return [...OUTING[weather], ...(weather === 'sunny' ? toys : toys.slice(0, 1))];
}

export const OUTING_COUNT = 4;

/** Each slot offers one garment that suits the weather and two that may not: no wrong, only funny. */
export function dressOffers(plan: DayPlan, days: number, rng: () => number = Math.random): Record<Slot, Garment[]> {
  const sc = scenarioOf(plan);
  const fresh = new Set(justUnlocked(days).map((u) => u.id));
  const offers = {} as Record<Slot, Garment[]>;
  for (const slot of SLOTS) {
    const all = outfitPool(days, slot);
    const good = take(
      all.filter((g) => fits(g, sc)),
      1,
      rng,
    );
    const rest = all.filter((g) => !good.includes(g));
    // A just-unlocked piece always gets a place on the rack.
    const first = take(
      rest.filter((g) => fresh.has(g.emoji)),
      1,
      rng,
    );
    const left = rest.filter((g) => !first.includes(g));
    offers[slot] = shuffle([...good, ...first, ...take(left, 2 - first.length, rng)], rng);
  }
  return offers;
}

export function isFresh(days: number, emoji: string): boolean {
  return justUnlocked(days).some((u) => u.id === emoji);
}

/** Said when a finished day opened something. */
export function newLine(list: readonly Unlock[]): string {
  return list.length > 0 ? `Bạn nhỏ có đồ mới!… ${list.map((u) => u.name).join(', ')}.` : 'Hoan hô… một ngày vui!';
}
