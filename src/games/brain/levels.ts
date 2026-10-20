/**
 * Everything about *how hard* and *what comes next* — no DOM, so it can be tested.
 *
 * - Each station has its own skill: a level that climbs after two clean rounds in a
 *   row and eases back one rung after two rough ones. Nothing is ever lost or "failed".
 * - A round is dealt from a seed, so the same (station, level, round) is the same
 *   board every time — tests can pin it, and a bug report can be replayed.
 * - Every `STARS_PER_STEP` stars the island gives something: a new station, a new
 *   island, a new explorer or a new bit of gear (see `REWARDS`).
 */
import { mulberry32 } from '../../core/dom';

export type StationId = 'cards' | 'missing' | 'sequence' | 'tubes' | 'diff';
export const STATION_IDS: readonly StationId[] = ['cards', 'missing', 'sequence', 'tubes', 'diff'];

/** Highest level (0-based) of each station. */
export const MAX_LEVEL: Readonly<Record<StationId, number>> = {
  cards: 4,
  missing: 4,
  sequence: 5,
  tubes: 6,
  diff: 3,
};

export const STARS_PER_STEP = 3;

/* ------------------------------------------------------------------ adaptive */

export interface Skill {
  level: number;
  /** Clean rounds in a row at this level. */
  streak: number;
  /** Rough rounds in a row at this level. */
  slips: number;
}

export const freshSkill = (): Skill => ({ level: 0, streak: 0, slips: 0 });

export type Rating = 'clean' | 'ok' | 'rough';

/** Clean rounds in a row that move a child up one level. */
export const UP_AFTER = 2;
/** Rough rounds in a row that move a child down one level. */
export const DOWN_AFTER = 2;

/**
 * How the round went. `slips` is wrong tries plus nudges the hint had to give;
 * `size` is how many decisions the round asked for, so a big board forgives more.
 */
export function rate(slips: number, size: number): Rating {
  const ratio = slips / Math.max(1, size);
  if (ratio <= 0.25) return 'clean';
  if (ratio >= 1) return 'rough';
  return 'ok';
}

export function adapt(skill: Skill, rating: Rating, max: number): Skill {
  const s = { ...skill };
  if (rating === 'clean') {
    s.slips = 0;
    s.streak++;
    if (s.streak >= UP_AFTER) {
      if (s.level < max) s.level++;
      s.streak = 0;
    }
  } else if (rating === 'rough') {
    s.streak = 0;
    s.slips++;
    if (s.slips >= DOWN_AFTER) {
      if (s.level > 0) s.level--;
      s.slips = 0;
    }
  } else {
    // A middling round: neither a step up nor a step down, but the streaks restart.
    s.streak = 0;
    s.slips = 0;
  }
  return s;
}

/* ---------------------------------------------------------------------- seed */

function hash(text: string): number {
  let a = 2166136261;
  for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 16777619);
  return a >>> 0;
}

/** The random stream of one round: same inputs, same board. */
export function roundRng(station: StationId, level: number, round: number, salt = 0): () => number {
  return mulberry32(hash(`${station}|${level}|${round}|${salt}`));
}

/* ----------------------------------------------------------- station settings */

function clamp(level: number, max: number): number {
  return Math.min(Math.max(Math.floor(level) || 0, 0), max);
}

/** Pairs on the board: 2×2, 2×3, 2×4, 3×4, 4×4. */
export function cardsPairs(level: number): number {
  return [2, 3, 4, 6, 8][clamp(level, MAX_LEVEL.cards)]!;
}

export interface SequenceParams {
  /** How many pictures in the tune. */
  length: number;
  /** How many different pictures to choose from. */
  options: number;
}
export function sequenceParams(level: number): SequenceParams {
  const l = clamp(level, MAX_LEVEL.sequence);
  return { length: [2, 2, 3, 3, 4, 5][l]!, options: [3, 4, 4, 5, 5, 6][l]! };
}

export interface MissingParams {
  /** Things on the table. */
  shown: number;
  /** Answers to choose from. */
  choices: number;
}
export function missingParams(level: number): MissingParams {
  const l = clamp(level, MAX_LEVEL.missing);
  return { shown: [4, 4, 5, 5, 6][l]!, choices: [2, 3, 3, 4, 4][l]! };
}

export interface DiffParams {
  cols: number;
  rows: number;
  /** The odd one out may be a look-alike (🐶 → 🐱) instead of something quite different. */
  similar: boolean;
  /** The odd one out may be missing altogether. */
  mayVanish: boolean;
}
export function diffParams(level: number): DiffParams {
  const l = clamp(level, MAX_LEVEL.diff);
  const grid = [
    [2, 2],
    [2, 3],
    [3, 3],
    [3, 4],
  ][l]!;
  return { cols: grid[0]!, rows: grid[1]!, similar: l >= 3, mayVanish: l >= 1 };
}

/** Tubes: the level is the rung of `tubes/logic.ts`'s ladder. */
export function tubesLevel(level: number): number {
  return clamp(level, MAX_LEVEL.tubes);
}

/* ------------------------------------------------------------------ rewards */

export interface Reward {
  kind: 'station' | 'island' | 'avatar' | 'gear' | 'gem';
  emoji: string;
  /** Spoken and shown: "trạm nhớ dãy", "đảo rừng"… */
  name: string;
  station?: StationId;
}

/** What the 1st, 2nd, 3rd… set of three stars gives. After the last, every set gives a gem. */
export const REWARDS: readonly Reward[] = [
  { kind: 'station', emoji: '🎶', name: 'trạm nhớ dãy', station: 'sequence' },
  { kind: 'avatar', emoji: '🦊', name: 'bạn cáo' },
  { kind: 'station', emoji: '🧪', name: 'trạm xếp bi màu', station: 'tubes' },
  { kind: 'gear', emoji: '🔭', name: 'ống nhòm' },
  { kind: 'station', emoji: '🔍', name: 'trạm tìm khác biệt', station: 'diff' },
  { kind: 'island', emoji: '🌲', name: 'đảo rừng' },
  { kind: 'avatar', emoji: '🐼', name: 'bạn gấu trúc' },
  { kind: 'gear', emoji: '🎒', name: 'ba lô' },
  { kind: 'island', emoji: '🌊', name: 'đảo biển' },
  { kind: 'avatar', emoji: '🦁', name: 'bạn sư tử' },
  { kind: 'gear', emoji: '🧭', name: 'la bàn' },
  { kind: 'avatar', emoji: '🐵', name: 'bạn khỉ' },
];

export const GEM: Reward = { kind: 'gem', emoji: '💎', name: 'viên ngọc' };

export const START_AVATAR = '🧒';

/** Whole sets of three stars earned. */
export function stepOf(stars: number): number {
  return Math.floor(Math.max(0, stars) / STARS_PER_STEP);
}

/** Reward handed out when the `step`-th set of stars (1-based) is completed. */
export function rewardAt(step: number): Reward {
  return REWARDS[step - 1] ?? GEM;
}

/** Rewards already earned with `stars`, in order. */
export function earned(stars: number): Reward[] {
  const out: Reward[] = [];
  for (let s = 1; s <= stepOf(stars); s++) out.push(rewardAt(s));
  return out;
}

/** The two stations a child starts with. */
export const OPEN_STATIONS: readonly StationId[] = ['cards', 'missing'];

export function unlockedStations(stars: number): StationId[] {
  const set = new Set<StationId>(OPEN_STATIONS);
  for (const r of earned(stars)) if (r.station) set.add(r.station);
  return STATION_IDS.filter((id) => set.has(id));
}

/** Stars still needed for `station` to open (0 when it is open). */
export function starsToUnlock(station: StationId, stars: number): number {
  if (unlockedStations(stars).includes(station)) return 0;
  const idx = REWARDS.findIndex((r) => r.station === station);
  return idx < 0 ? 0 : (idx + 1) * STARS_PER_STEP - stars;
}

export const ISLANDS = [
  { name: 'đảo kho báu', emoji: '🏝️' },
  { name: 'đảo rừng', emoji: '🌲' },
  { name: 'đảo biển', emoji: '🌊' },
] as const;

/** Island 0 is always there; the others come from `island` rewards, in order. */
export function islandsOpen(stars: number): number {
  return 1 + earned(stars).filter((r) => r.kind === 'island').length;
}

/** Explorers the child can be: the starting one, then each `avatar` reward. */
export function avatarsOpen(stars: number): string[] {
  return [START_AVATAR, ...earned(stars).filter((r) => r.kind === 'avatar').map((r) => r.emoji)];
}

export function gearOpen(stars: number): string[] {
  return earned(stars)
    .filter((r) => r.kind === 'gear')
    .map((r) => r.emoji);
}

/** Gems from sets of stars beyond the last named reward. */
export function gemsOpen(stars: number): number {
  return Math.max(0, stepOf(stars) - REWARDS.length);
}

/** Stars into the current set of three, 0 … 2. */
export function starsIntoStep(stars: number): number {
  return Math.max(0, stars) % STARS_PER_STEP;
}

/** The open station played least, to wander to next. Only a nudge: every open station stays tappable. */
export function suggestNext(
  open: readonly StationId[],
  rounds: Readonly<Partial<Record<StationId, number>>>,
  last: StationId | null,
): StationId {
  let best = open[0] ?? 'cards';
  let bestN = Infinity;
  for (const id of open) {
    const n = (rounds[id] ?? 0) + (id === last ? 0.5 : 0);
    if (n < bestN) {
      bestN = n;
      best = id;
    }
  }
  return best;
}
