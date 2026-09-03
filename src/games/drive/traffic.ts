import { SLOT_UNITS, roadY, type Road } from './logic';
import type { Shape } from './vehicle';

/**
 * The road is not the child's alone. Vans and tractors trundle along in front,
 * others come the other way, ducks stroll across without looking, and now and
 * then a train comes through. All of it can be got past by leaning on the horn.
 */

/** The other traffic is built from the same shapes the child drives. */
export type TravellerKind = Shape;

export interface Traveller {
  /** World x of the middle. */
  x: number;
  /** Units per second along the road; negative for the ones coming the other way. */
  v: number;
  /** The near lane the child drives in, or the far one across the road. */
  lane: 'same' | 'opposite';
  kind: TravellerKind;
  body: string;
  roof: string;
  /** Wheel rotation. */
  spin: number;
  /** Seconds left of getting a move on because somebody honked. */
  hurry: number;
  /** Seconds left of being stuck in a jam. */
  stuck: number;
}

const BODIES: readonly [string, string][] = [
  ['#f472b6', '#be185d'],
  ['#a78bfa', '#6d28d9'],
  ['#34d399', '#047857'],
  ['#fbbf24', '#b45309'],
  ['#60a5fa', '#1d4ed8'],
  ['#f87171', '#b91c1c'],
  ['#e2e8f0', '#94a3b8'],
];

// Weighted: most of what goes by is an ordinary car.
const KINDS: readonly TravellerKind[] = ['car', 'car', 'car', 'truck', 'bus', 'tractor'];

/** Slowest thing on the road, as a fraction of the child's top speed. */
export const DAWDLE_MIN = 0.32;
export const DAWDLE_MAX = 0.7;
/** A honked-at vehicle goes this much faster while it gets out of the way. */
export const HURRY_BOOST = 1.9;
export const HURRY_SECONDS = 2.6;
/** How close the child's bumper gets to the car in front. */
export const TAILGATE_UNITS = 1.5;
/** Far enough ahead that one honk clears a whole jam, not just the front of it. */
export const HONK_REACH_UNITS = SLOT_UNITS * 1.8;
/** A jam clears by itself after this long, honk or no honk. */
export const JAM_SECONDS = 5;
/** Cars in a jam stand this far apart. */
export const JAM_GAP = 1.7;
/** How far ahead of the screen new traffic appears. */
export const SPAWN_AHEAD = 4;

export function makeTraveller(x: number, lane: 'same' | 'opposite', top: number, rng: () => number): Traveller {
  const [body, roof] = BODIES[Math.floor(rng() * BODIES.length)] ?? BODIES[0]!;
  const kind = KINDS[Math.floor(rng() * KINDS.length)] ?? 'car';
  const pace = DAWDLE_MIN + rng() * (DAWDLE_MAX - DAWDLE_MIN);
  return {
    x,
    v: top * pace * (lane === 'same' ? 1 : -1.1),
    lane,
    kind,
    body,
    roof,
    spin: 0,
    hurry: 0,
    stuck: 0,
  };
}

/** A row of cars stopped dead. The child honks, or waits, and they move off. */
export function makeJam(x: number, top: number, rng: () => number, road: Road): Traveller[] {
  return [0, 1, 2].map((i) => {
    const t = makeTraveller(x + i * JAM_GAP * road.unit, 'same', top, rng);
    t.stuck = JAM_SECONDS;
    t.v = 0;
    return t;
  });
}

/**
 * Somewhere on the road that everything has to stop short of: a herd halfway
 * across, a barrier down, a light on red. The child's car and the traffic are
 * held by the same list, because a road where only the child has to wait is a
 * road a child will ask questions about.
 */
export interface Halt {
  /** World x of the thing in the way. */
  x: number;
  /** How far short of it to stop, in units. */
  gap: number;
}

/** Where `x` may not pass, going in direction `dir`, or null when the way is clear. */
export function lineFor(x: number, dir: number, halts: readonly Halt[], road: Road): number | null {
  let line: number | null = null;
  for (const halt of halts) {
    const stop = halt.x - dir * road.unit * halt.gap;
    // Only what is in front matters, and only within a screen or two of it.
    const ahead = (halt.x - x) * dir;
    if (ahead < -road.unit * 0.4 || ahead > road.unit * SLOT_UNITS * 2) continue;
    if (line === null || (stop - line) * dir < 0) line = stop;
  }
  return line;
}

export function stepTraveller(t: Traveller, dt: number, road: Road, top: number, halts: readonly Halt[] = []): void {
  t.hurry = Math.max(0, t.hurry - dt);
  if (t.stuck > 0) {
    t.stuck = Math.max(0, t.stuck - dt);
    t.v = 0;
    return;
  }
  const dir = t.lane === 'same' ? 1 : -1;
  const want = top * (DAWDLE_MIN + DAWDLE_MAX) * 0.5 * dir * 1.05 * (t.hurry > 0 ? HURRY_BOOST : 1);
  t.v += (want - t.v) * Math.min(1, dt * 2.2);
  t.x += t.v * dt;
  const line = lineFor(t.x, dir, halts, road);
  if (line !== null && (t.x - line) * dir > 0) {
    t.x = line;
    t.v = 0;
  }
  t.spin += (t.v * dt) / (road.unit * 0.18);
}

/**
 * The back of the nearest vehicle the child cannot drive through, as a world x
 * to stop at — or null when the way ahead is clear. Only the near lane counts.
 */
export function tailOf(carX: number, travellers: readonly Traveller[], road: Road): number | null {
  let line: number | null = null;
  for (const t of travellers) {
    if (t.lane !== 'same') continue;
    const back = t.x - road.unit * TAILGATE_UNITS;
    if (back < carX) continue;
    if (back > carX + road.unit * SLOT_UNITS) continue;
    if (line === null || back < line) line = back;
  }
  return line;
}

/** Lean on the horn: everything in front gets a move on. Returns how many heard it. */
export function honkAt(carX: number, travellers: readonly Traveller[], road: Road): number {
  let heard = 0;
  for (const t of travellers) {
    if (t.x < carX - road.unit || t.x > carX + road.unit * HONK_REACH_UNITS) continue;
    t.hurry = HURRY_SECONDS;
    t.stuck = 0;
    heard++;
  }
  return heard;
}

// ---- who is crossing ----

/** A family of ducks (or cows, or ducklings) walking across without looking. */
export interface Crosser {
  x: number;
  /** 0 at the near verge, 1 safely across. */
  t: number;
  emoji: string;
  name: string;
  count: number;
  hurried: boolean;
  /** How big one of them is, in units — a cow is not the size of a duckling. */
  size: number;
}

const HERDS: readonly { emoji: string; name: string; size: number }[] = [
  { emoji: '🦆', name: 'đàn vịt', size: 0.52 },
  { emoji: '🐤', name: 'đàn gà con', size: 0.44 },
  { emoji: '🐄', name: 'đàn bò', size: 0.98 },
  { emoji: '🐑', name: 'đàn cừu', size: 0.74 },
  { emoji: '🦢', name: 'đàn ngỗng', size: 0.62 },
];

/** How long a herd takes to get across, dawdling. */
export const CROSS_SECONDS = 5.5;
/** They keep walking into the field after that, and are gone by here. */
export const CROSS_GONE = 1.6;
/** How much faster they go once somebody honks. */
export const SCURRY = 2.8;
/** The car waits this far short of them. */
export const CROSS_STOP_UNITS = 1.4;

export function makeCrosser(x: number, rng: () => number): Crosser {
  const herd = HERDS[Math.floor(rng() * HERDS.length)] ?? HERDS[0]!;
  return { x, t: 0, ...herd, count: 2 + Math.floor(rng() * 3), hurried: false };
}

export function stepCrosser(c: Crosser, dt: number): void {
  c.t = Math.min(CROSS_GONE, c.t + (dt / CROSS_SECONDS) * (c.hurried ? SCURRY : 1));
}

/** Clear of the tarmac: the road is open again. */
export function crossed(c: Crosser): boolean {
  return c.t >= 1;
}

/** Far enough into the field to stop drawing. */
export function crosserGone(c: Crosser): boolean {
  return c.t >= CROSS_GONE;
}

/** They fade out as they wander off, rather than blinking out of existence. */
export function crosserFade(c: Crosser): number {
  return c.t <= 1 ? 1 : Math.max(0, 1 - (c.t - 1) / (CROSS_GONE - 1));
}

/** And shrink a little, because they are walking away from the road. */
export function crosserScale(c: Crosser): number {
  return c.t <= 1 ? 1 : 1 - (c.t - 1) * 0.3;
}

/**
 * Where the herd walks: from the verge in front of the road to the far side. The
 * bigger the animal the higher its middle sits, so every one of them has its feet
 * on the tarmac rather than its belly in it.
 */
export function crosserY(c: Crosser, road: Road): number {
  return roadY(road, c.x) + road.unit * (0.72 - c.t * 0.95 - c.size * 0.34);
}

// ---- the level crossing ----

export const BARRIER_SECONDS = 0.8;
export const TRAIN_SECONDS = 3.4;
export const CLEAR_SECONDS = 0.8;
/** The car waits this far short of the rails. */
export const RAIL_STOP_UNITS = 1.6;
/** How far off a crossing the barrier starts coming down. */
export const RAIL_WAKE_UNITS = 6;

export type RailPhase = 'down' | 'passing' | 'up' | 'clear';

/** A level crossing the car has woken up, `t` seconds into its cycle. */
export interface Crossing {
  slot: number;
  t: number;
}

export function railPhase(t: number): RailPhase {
  if (t < BARRIER_SECONDS) return 'down';
  if (t < BARRIER_SECONDS + TRAIN_SECONDS) return 'passing';
  if (t < BARRIER_SECONDS + TRAIN_SECONDS + CLEAR_SECONDS) return 'up';
  return 'clear';
}

/** 0 with the barrier up, 1 with it down across the road. */
export function barrierDown(t: number): number {
  const phase = railPhase(t);
  if (phase === 'down') return Math.min(1, t / BARRIER_SECONDS);
  if (phase === 'passing') return 1;
  if (phase === 'up') return Math.max(0, 1 - (t - BARRIER_SECONDS - TRAIN_SECONDS) / CLEAR_SECONDS);
  return 0;
}

/** Where the engine is, from -1 (off the left) to 2 (gone right), or null when there is no train. */
export function trainAcross(t: number): number | null {
  if (railPhase(t) !== 'passing') return null;
  return -1 + ((t - BARRIER_SECONDS) / TRAIN_SECONDS) * 3;
}

export function railBlocks(t: number): boolean {
  return barrierDown(t) > 0.35;
}
