import { FRUITS, NUMBERS_VI, type Item } from '../../core/content';
import { randInt } from '../../core/dom';

export interface Point {
  x: number;
  y: number;
}

export interface CountRound {
  item: Item;
  /** 1 … `maxCount(roundIndex)`. */
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

/** Round 0 counts up to 2, round 1 up to 3, later rounds up to 5. */
export function maxCount(roundIndex: number): number {
  if (roundIndex <= 0) return 2;
  if (roundIndex === 1) return 3;
  return 5;
}

/** Vietnamese number word; `''` when out of range. */
export function numberWord(n: number): string {
  return NUMBERS_VI[n] ?? '';
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Cell-centred grid with ⌈√n⌉ columns: always `n` points, ≥ 0.25 apart for n ≤ 9. */
function grid(n: number): Point[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const span = POS_MAX - POS_MIN;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({ x: POS_MIN + span * ((c + 0.5) / cols), y: POS_MIN + span * ((r + 0.5) / rows) });
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
): CountRound {
  const count = randInt(1, maxCount(roundIndex), rng);
  const pool = FRUITS.filter((f) => f.emoji !== excludeEmoji);
  const item = pool[randInt(0, pool.length - 1, rng)];
  if (!item) throw new Error('count: no fruit available');
  return { item, count, positions: scatter(count, rng, minDist) };
}
