import { loadVersioned, saveVersioned, type Backend, type VersionedSpec } from '../../core/save';
import { MAX_LEVEL, type ConceptStat, type Mastery } from './picker';
import type { TopicId } from './types';

/** What the teacher wears. `who` is the character itself; the rest are accessories. */
export interface Wear {
  who: string;
  head?: string;
  face?: string;
  neck?: string;
}

export interface LearnState {
  /** What the child knows, per letter / number / colour… */
  mastery: Mastery;
  /** Questions asked so far: the game's own clock, so "long ago" needs no real time. */
  turn: number;
  /** Finished stations, per topic. */
  runs: Partial<Record<TopicId, number>>;
  wear: Wear;
}

export const SAVE_KEY = 'be-choi:learn';
export const BASE_TEACHER = '🦉';

export function freshState(): LearnState {
  return { mastery: {}, turn: 0, runs: {}, wear: { who: BASE_TEACHER } };
}

export type WearSlot = 'who' | 'head' | 'face' | 'neck';

export interface Reward {
  id: string;
  emoji: string;
  slot: WearSlot;
  name: string;
}

/** Unlocked one by one, a new one for every station finished. */
export const REWARDS: readonly Reward[] = [
  { id: 'grad', emoji: '🎓', slot: 'head', name: 'mũ cử nhân' },
  { id: 'specs', emoji: '👓', slot: 'face', name: 'kính' },
  { id: 'scarf', emoji: '🧣', slot: 'neck', name: 'khăn quàng' },
  { id: 'fox', emoji: '🦊', slot: 'who', name: 'cô cáo' },
  { id: 'crown', emoji: '👑', slot: 'head', name: 'vương miện' },
  { id: 'bow', emoji: '🎀', slot: 'neck', name: 'nơ' },
  { id: 'panda', emoji: '🐼', slot: 'who', name: 'cô gấu trúc' },
  { id: 'shades', emoji: '🕶️', slot: 'face', name: 'kính râm' },
  { id: 'tophat', emoji: '🎩', slot: 'head', name: 'mũ phù thủy' },
  { id: 'bunny', emoji: '🐰', slot: 'who', name: 'cô thỏ' },
  { id: 'cap', emoji: '🧢', slot: 'head', name: 'mũ lưỡi trai' },
  { id: 'unicorn', emoji: '🦄', slot: 'who', name: 'ngựa một sừng' },
];

export function totalRuns(s: LearnState): number {
  return Object.values(s.runs).reduce<number>((a, b) => a + (b ?? 0), 0);
}

/** Rewards earned so far: one per finished station. */
export function unlocked(s: LearnState): Reward[] {
  return REWARDS.slice(0, Math.min(REWARDS.length, totalRuns(s)));
}

/** The reward that finishing one more station would unlock, if any are left. */
export function nextReward(s: LearnState): Reward | null {
  return REWARDS[totalRuns(s)] ?? null;
}

/** Is this reward on the teacher right now? */
export function isWorn(w: Wear, r: Reward): boolean {
  return r.slot === 'who' ? w.who === r.emoji : w[r.slot] === r.emoji;
}

/** Put a reward on (or take an accessory off). The character itself is always one of them. */
export function toggleWear(w: Wear, r: Reward): Wear {
  if (r.slot === 'who') return { ...w, who: isWorn(w, r) ? BASE_TEACHER : r.emoji };
  const next: Wear = { ...w };
  if (isWorn(w, r)) delete next[r.slot];
  else next[r.slot] = r.emoji;
  return next;
}

function num(v: unknown, lo: number, hi: number, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 && v.length <= 16 ? v : undefined;
}

const TOPIC_IDS: readonly string[] = [
  'letters',
  'numbers',
  'colors',
  'shapes',
  'sizes',
  'animals',
  'shadows',
  'pattern',
  'sorting',
  'family',
];

const SPEC: VersionedSpec<LearnState> = {
  current: 1,
  validate(data) {
    const state = freshState();
    const rawM = data.mastery;
    if (typeof rawM === 'object' && rawM !== null) {
      for (const [id, v] of Object.entries(rawM as Record<string, unknown>)) {
        if (typeof v !== 'object' || v === null || id.length > 40) continue;
        const o = v as Record<string, unknown>;
        const stat: ConceptStat = {
          l: num(o.l, 0, MAX_LEVEL),
          s: num(o.s, 0, 99),
          w: num(o.w, 0, 99),
          a: num(o.a, 0, 100000),
          t: num(o.t, 0, 100000000),
        };
        state.mastery[id] = stat;
      }
    }
    state.turn = num(data.turn, 0, 100000000);
    const rawR = data.runs;
    if (typeof rawR === 'object' && rawR !== null) {
      for (const [k, v] of Object.entries(rawR as Record<string, unknown>)) {
        if (TOPIC_IDS.includes(k)) state.runs[k as TopicId] = num(v, 0, 100000);
      }
    }
    const rawW = data.wear;
    if (typeof rawW === 'object' && rawW !== null) {
      const o = rawW as Record<string, unknown>;
      state.wear = { who: str(o.who) ?? BASE_TEACHER };
      for (const slot of ['head', 'face', 'neck'] as const) {
        const v = str(o[slot]);
        if (v) state.wear[slot] = v;
      }
    }
    // The clock never runs behind what has been asked.
    for (const s of Object.values(state.mastery)) state.turn = Math.max(state.turn, s.t);
    return state;
  },
};

export function loadState(storage?: Backend | null): LearnState {
  return (storage === undefined ? loadVersioned(SAVE_KEY, SPEC) : loadVersioned(SAVE_KEY, SPEC, storage)) ?? freshState();
}

export function saveState(s: LearnState, storage?: Backend | null): boolean {
  return storage === undefined ? saveVersioned(SAVE_KEY, s, SPEC) : saveVersioned(SAVE_KEY, s, SPEC, storage);
}
