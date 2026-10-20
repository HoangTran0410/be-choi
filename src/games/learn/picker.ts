import { mulberry32 } from '../../core/dom';

/**
 * What the game knows about one concept (a letter, a number, a colour…).
 * Pure data and pure functions: nothing here touches the DOM, the clock or Math.random,
 * so the same state and seed always choose the same questions.
 */
export interface ConceptStat {
  /** Difficulty level 0 … MAX_LEVEL. Level 0 is "just met it". */
  l: number;
  /** Right answers in a row (first try) at this level. */
  s: number;
  /** Wrong first tries in a row. */
  w: number;
  /** Times asked. */
  a: number;
  /** The turn counter when it was last asked (0 = never). */
  t: number;
}

export type Mastery = Record<string, ConceptStat>;

export const MAX_LEVEL = 3;
/** First-try right answers in a row before the next level. */
export const STREAK_TO_LEVEL_UP = 2;
/** Wrong first tries in a row before dropping a level (never below 0). */
export const WRONGS_TO_LEVEL_DOWN = 2;
/** At most this many concepts are "being learned" (level < 2) at once; more join as they are mastered. */
export const LEARNING_SLOTS = 5;

export const FRESH: ConceptStat = { l: 0, s: 0, w: 0, a: 0, t: 0 };

export function statOf(m: Mastery, id: string): ConceptStat {
  return m[id] ?? FRESH;
}

/** How many answer choices a question at this level offers: 2, 3, then 4. */
export function optionCount(level: number): number {
  return 2 + Math.max(0, Math.min(2, level));
}

/**
 * Note one answer. Only a right answer on the FIRST try counts as right: finding it after
 * a wrong tap is learning, but it does not make the next question harder.
 */
export function recordAnswer(m: Mastery, id: string, firstTryRight: boolean, turn: number): Mastery {
  const old = statOf(m, id);
  const next: ConceptStat = { ...old, a: old.a + 1, t: turn };
  if (firstTryRight) {
    next.w = 0;
    next.s = old.s + 1;
    if (next.s >= STREAK_TO_LEVEL_UP && next.l < MAX_LEVEL) {
      next.l = old.l + 1;
      next.s = 0;
    }
  } else {
    next.s = 0;
    next.w = old.w + 1;
    if (next.w >= WRONGS_TO_LEVEL_DOWN && next.l > 0) {
      next.l = old.l - 1;
      next.w = 0;
    }
  }
  return { ...m, [id]: next };
}

/** True once the child has met it and is steady (level 2 or more). */
export function isKnown(m: Mastery, id: string): boolean {
  const s = statOf(m, id);
  return s.a > 0 && s.l >= 2;
}

/**
 * The concepts that may be asked now: everything already met, plus a few new ones
 * (in curriculum order) so that no more than LEARNING_SLOTS are being learned at once.
 * `need` guarantees the pool is big enough for one station.
 */
export function activePool(order: readonly string[], m: Mastery, need = 1): string[] {
  const met = order.filter((id) => statOf(m, id).a > 0);
  const fresh = order.filter((id) => statOf(m, id).a === 0);
  const learning = met.filter((id) => statOf(m, id).l < 2).length;
  let room = Math.max(0, LEARNING_SLOTS - learning);
  if (met.length === 0) room = Math.max(room, 3);
  room = Math.max(room, need - met.length);
  return [...met, ...fresh.slice(0, room)];
}

/** How much the picker wants this concept: unmet and shaky first, long-unasked before just-asked. */
export function weight(stat: ConceptStat, turn: number): number {
  if (stat.a === 0) return 6;
  const base = [5, 3, 1.4, 0.7][Math.max(0, Math.min(MAX_LEVEL, stat.l))] ?? 0.7;
  const stale = Math.min(3, Math.max(0, turn - stat.t) / 6);
  return base * (1 + stale);
}

/** One index drawn by weight. */
function drawIndex(weights: readonly number[], rng: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * `n` concepts to ask about. Distinct while the pool allows it; `avoid` (e.g. what was
 * asked a moment ago) is only used when there is nothing else.
 */
export function pickConcepts(
  order: readonly string[],
  m: Mastery,
  n: number,
  turn: number,
  rng: () => number,
  avoid: readonly string[] = [],
): string[] {
  if (order.length === 0 || n <= 0) return [];
  const pool = activePool(order, m, n + avoid.length);
  const out: string[] = [];
  const draw = (candidates: string[]): void => {
    const left = [...candidates];
    while (out.length < n && left.length > 0) {
      const i = drawIndex(
        left.map((id) => weight(statOf(m, id), turn)),
        rng,
      );
      out.push(left.splice(i, 1)[0]!);
    }
  };
  draw(pool.filter((id) => !avoid.includes(id)));
  if (out.length < n) draw(pool.filter((id) => !out.includes(id)));
  // A pool smaller than n (a family of two) repeats rather than runs dry.
  for (let i = 0; out.length < n; i++) out.push(out[i % Math.max(1, out.length)] ?? order[0]!);
  return out;
}

/** A small stable number from text, for seeding. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The random stream of one station play: the same station at the same moment asks the same things. */
export function stationRng(topic: string, plays: number, turn: number): () => number {
  return mulberry32(hashSeed(`${topic}|${plays}|${turn}`));
}
