import { FRUITS, NUMBERS_VI, type Item } from '../../core/content';
import { randInt } from '../../core/dom';

export interface Point {
  x: number;
  y: number;
}

export interface CountRound {
  item: Item;
  /** 1 … `maxCount(roundIndex, bonus)`. */
  count: number;
  /** Normalized board positions (POS_MIN … POS_MAX), pairwise ≥ `MIN_DIST` apart. */
  positions: Point[];
}

/** Minimum normalized distance between two fruit centres. */
export const MIN_DIST = 0.22;
/** Fruits stay inside this band so they never touch the board edge. */
export const POS_MIN = 0.12;
export const POS_MAX = 0.88;

/** Rejection-sampling attempts per point before falling back to the grid. */
const ATTEMPTS = 60;

/** The most a child can be asked to count. */
export const CEILING = 10;
/** Most extra fruit `bonus` can add on top of the usual 5. */
export const MAX_BONUS = CEILING - 5;

/**
 * Round 0 counts up to 2, round 1 up to 3, later rounds up to 5. `bonus` (earned by counting
 * rounds without needing a hint, see `nextBonus`) lifts the later rounds up to 10; the first two
 * rounds stay easy whatever it is.
 */
export function maxCount(roundIndex: number, bonus = 0): number {
  if (roundIndex <= 0) return 2;
  if (roundIndex === 1) return 3;
  return 5 + Math.max(0, Math.min(MAX_BONUS, Math.floor(bonus)));
}

/** After a round: one more fruit next time if the child counted without a hint, one fewer if they needed help. */
export function nextBonus(bonus: number, neededHelp: boolean): number {
  return Math.max(0, Math.min(MAX_BONUS, bonus + (neededHelp ? -1 : 1)));
}

/** Vietnamese number word; `''` when out of range. */
export function numberWord(n: number): string {
  return NUMBERS_VI[n] ?? '';
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Grid with ⌈√n⌉ columns spread edge to edge: always `n` points, ≥ MIN_DIST apart for n ≤ 10.
 * A short last row is centred.
 */
function grid(n: number): Point[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const span = POS_MAX - POS_MIN;
  const at = (i: number, count: number): number => (count <= 1 ? POS_MIN + span / 2 : POS_MIN + (span * i) / (count - 1));
  const out: Point[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols);
    for (let c = 0; c < inRow; c++) {
      const x = inRow === cols ? at(c, cols) : POS_MIN + span / 2 + (c - (inRow - 1) / 2) * (span / (cols - 1));
      out.push({ x, y: at(r, rows) });
    }
  }
  return out;
}

/**
 * `n` random points inside the POS_MIN…POS_MAX square, pairwise at least
 * `minDist` apart. Rejection sampling; when that fails (spacing too large for
 * `n`) the deterministic grid is returned so the caller always gets `n` points.
 */
export function scatter(n: number, rng: () => number, minDist: number = MIN_DIST): Point[] {
  const span = POS_MAX - POS_MIN;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let a = 0; a < ATTEMPTS && !placed; a++) {
      const p = { x: POS_MIN + rng() * span, y: POS_MIN + rng() * span };
      if (out.every((q) => dist(p, q) >= minDist)) {
        out.push(p);
        placed = true;
      }
    }
    if (!placed) return grid(n);
  }
  return out;
}

/**
 * Normalized spacing that keeps `itemPx`-wide fruits from overlapping on a
 * `width`×`height` board: a normalized distance `d` is at least
 * `d · min(width, height)` px on screen. Never below `MIN_DIST`; returns
 * `MIN_DIST` when the board is unmeasured (e.g. jsdom).
 */
export function minDistFor(width: number, height: number, itemPx: number): number {
  const short = Math.min(width, height);
  if (!(short > 0) || !(itemPx > 0)) return MIN_DIST;
  return Math.min(0.3, Math.max(MIN_DIST, (itemPx * 1.15) / short));
}

/** A fruit other than `excludeEmoji`, `count` copies of it, and where to put them. */
export function makeCountRound(
  roundIndex: number,
  rng: () => number = Math.random,
  excludeEmoji?: string,
  minDist: number = MIN_DIST,
  bonus = 0,
): CountRound {
  const count = randInt(1, maxCount(roundIndex, bonus), rng);
  const pool = FRUITS.filter((f) => f.emoji !== excludeEmoji);
  const item = pool[randInt(0, pool.length - 1, rng)];
  if (!item) throw new Error('count: no fruit available');
  return { item, count, positions: scatter(count, rng, minDist) };
}
