/**
 * The flying bird. Everything is in screen fractions: y 0 is the top, 1 the
 * bottom, and x counts screens travelled. The child's voice is the only lift, so
 * a loud note climbs and silence glides down. There is nothing to lose: the
 * ground bounces the bird back up.
 */
export const BIRD_X = 0.25;
export const CEILING = 0.06;
export const GROUND = 0.8;
/** Downward pull, screens per second². */
export const GRAVITY = 0.62;
/** Upward pull at full voice. */
export const LIFT = 1.5;
export const MAX_RISE = 0.75;
export const MAX_FALL = 0.75;
/** How fast the world scrolls past, screens per second. */
export const SPEED = 0.3;
/** Distance between two things to fly through. */
export const ITEM_GAP = 0.42;
/** How close counts as caught. */
export const CATCH_R = 0.1;
/** Notes to collect before the celebration. */
export const NOTES_PER_ROUND = 8;
/** How far ahead of the screen items are made. */
const AHEAD = 1.4;
/** Bounce sent back up by the ground. */
const BOUNCE = 0.25;
const MAX_STEP = 0.05;

export type ItemKind = 'note' | 'ring';

export interface Item {
  id: number;
  /** World position, in screens from the start. */
  x: number;
  y: number;
  kind: ItemKind;
}

export interface World {
  y: number;
  vy: number;
  distance: number;
  /** Notes collected this round. */
  caught: number;
  items: Item[];
  nextX: number;
  nextId: number;
}

export interface StepResult {
  caught: Item[];
  /** The bird just touched the grass. */
  bumped: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Where the next thing appears: near the height the bird is flying at, so a small
 * child who can only hold one loud note still flies into something.
 */
export function spawnY(birdY: number, rng: () => number): number {
  return clamp(birdY + (rng() - 0.5) * 0.5, CEILING + 0.04, GROUND - 0.08);
}

function fill(w: World, rng: () => number): void {
  while (w.nextX < w.distance + AHEAD) {
    w.items.push({ id: w.nextId++, x: w.nextX, y: spawnY(w.y, rng), kind: rng() < 0.3 ? 'ring' : 'note' });
    w.nextX += ITEM_GAP;
  }
}

export function makeWorld(rng: () => number = Math.random): World {
  const w: World = { y: 0.45, vy: 0, distance: 0, caught: 0, items: [], nextX: 0.9, nextId: 1 };
  fill(w, rng);
  return w;
}

/** One frame: `level` is the voice (0 … 1), `dt` seconds. Mutates and reports what happened. */
export function step(w: World, level: number, dt: number, rng: () => number = Math.random): StepResult {
  const t = clamp(dt, 0, MAX_STEP);
  w.vy = clamp(w.vy + (GRAVITY - LIFT * clamp(level, 0, 1)) * t, -MAX_RISE, MAX_FALL);
  w.y += w.vy * t;
  let bumped = false;
  if (w.y >= GROUND) {
    w.y = GROUND;
    bumped = w.vy > 0.05;
    w.vy = -BOUNCE;
  } else if (w.y < CEILING) {
    w.y = CEILING;
    w.vy = 0;
  }
  w.distance += SPEED * t;
  fill(w, rng);

  const caught: Item[] = [];
  const birdX = w.distance + BIRD_X;
  w.items = w.items.filter((item) => {
    if (Math.abs(item.x - birdX) < CATCH_R && Math.abs(item.y - w.y) < CATCH_R) {
      caught.push(item);
      if (item.kind === 'note') w.caught++;
      return false;
    }
    return item.x > w.distance - 0.2;
  });
  return { caught, bumped };
}

export function roundDone(w: World): boolean {
  return w.caught >= NOTES_PER_ROUND;
}
