import type { GameMeta, Skill } from '../core/types';

/**
 * "Hôm nay chơi gì": three suggestions for the day, one from each broad kind of play so
 * the day is balanced. Pure and deterministic: the same date, the same plays and the same
 * filter always give the same three games in the same order.
 */

type Kind = 'music' | 'think' | 'calm' | 'play';

const KIND_OF: Record<Skill, Kind> = {
  music: 'music',
  puzzle: 'think',
  logic: 'think',
  matching: 'think',
  listening: 'think',
  sorting: 'think',
  memory: 'think',
  counting: 'think',
  nature: 'calm',
  care: 'calm',
  'cause-effect': 'play',
  creative: 'play',
};

/** The kinds a day is made of. `play` is only the fallback when one of these is empty. */
const SLOTS: readonly Kind[] = ['music', 'think', 'calm'];

export interface TodayOptions {
  /** Identifies the day, e.g. `2026-10-19`. The seed. */
  dateKey: string;
  /** Recent plays, newest last, one id per play. Games played less come first. */
  recent?: readonly string[];
  /** Parent's filter (age, …). Games it rejects are never suggested. */
  allow?: (game: GameMeta) => boolean;
  /** How many to suggest. Default 3. */
  count?: number;
}

/** Local calendar day as `YYYY-MM-DD`. */
export function dateKeyOf(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hash(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickToday<G extends GameMeta>(games: readonly G[], opts: TodayOptions): G[] {
  const want = opts.count ?? 3;
  const rng = mulberry32(hash(opts.dateKey));
  const plays = new Map<string, number>();
  for (const id of opts.recent ?? []) plays.set(id, (plays.get(id) ?? 0) + 1);

  // Fewest plays first; the date breaks ties, so a fresh start still varies day to day.
  const ranked = games
    .filter((g) => (opts.allow ? opts.allow(g) : true))
    .map((g) => ({ g, score: (plays.get(g.id) ?? 0) + rng() * 0.99 }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.g);

  const chosen: G[] = [];
  const take = (g: G | undefined) => {
    if (g && !chosen.includes(g) && chosen.length < want) chosen.push(g);
  };

  const order = [...SLOTS];
  // Which kind comes first changes with the day, but never within it.
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  for (const kind of order) take(ranked.find((g) => KIND_OF[g.skill] === kind));
  // A kind with nothing to offer (filtered out): borrow the least-played game of a kind not
  // yet shown, then anything at all.
  while (chosen.length < want) {
    const used = new Set(chosen.map((g) => KIND_OF[g.skill]));
    const next = ranked.find((g) => !chosen.includes(g) && !used.has(KIND_OF[g.skill])) ?? ranked.find((g) => !chosen.includes(g));
    if (!next) break;
    take(next);
  }
  return chosen;
}
