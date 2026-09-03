/**
 * Câu cá, with no DOM in sight: the line, the bait on the end of it, and the
 * rule that decides when a fish takes it.
 *
 * The fish themselves are the aquarium's fish — the same species, the same
 * bodies, the same hunger and fright — because a fish caught here swims into
 * that tank afterwards, and a child would notice at once if it changed on the
 * way. `index.ts` only draws what this file has decided.
 */
import { Creature, SPECIES, type Species, type Tank } from '../aquarium/logic';

/** Where the line hangs from, as a fraction across the top of the water. */
export const ROD_X = 0.5;

/** The bait on the end of the line. */
export interface Hook {
  x: number;
  y: number;
  /** How fast it is being dragged, in px per second, smoothed. */
  speed: number;
  /** The fish on the line, if any. */
  caught: Creature | null;
  /**
   * Is there a bait on the hook? A landed catch takes it with it, and the line
   * fishes for nothing until the child casts again. Without this the line goes
   * on catching fish while it dangles in the air with nobody holding it.
   */
  baited: boolean;
  /** Seconds the bait has been sitting quietly. Fish will not come to a jumpy one. */
  steady: number;
}

export function makeHook(tank: Tank): Hook {
  return { x: tank.w * ROD_X, y: tank.h * 0.3, speed: 0, caught: null, baited: true, steady: 0 };
}

/**
 * How long the bait must sit quietly before a fish will risk it. Short enough
 * that a patient child is rewarded within a few seconds, long enough that the
 * lake is not simply a magnet.
 */
export const STEADY_SECONDS = 1.6;

/** Count the quiet seconds, and start again the moment the line is snatched. */
export function tickSteady(hook: Hook, dt: number, tank: Tank): void {
  hook.steady = isJerking(hook, tank) ? 0 : hook.steady + dt;
}

/**
 * Drag the hook to `(x, y)` over `dt` seconds, keeping it in the water and
 * remembering how fast it moved — which is the whole game.
 */
export function moveHook(hook: Hook, x: number, y: number, dt: number, tank: Tank): void {
  const edge = tank.unit * 0.35;
  const nextX = Math.min(tank.w - edge, Math.max(edge, x));
  const nextY = Math.min(tank.floor - edge, Math.max(tank.h * 0.06, y));
  const moved = Math.hypot(nextX - hook.x, nextY - hook.y);
  const rate = dt > 0 ? moved / dt : 0;
  // Smoothed, so one twitchy frame does not read as a yank.
  hook.speed += (rate - hook.speed) * Math.min(1, dt * 8);
  hook.x = nextX;
  hook.y = nextY;
}

/** Let the remembered speed fall away while the finger is off the screen. */
export function settleHook(hook: Hook, dt: number): void {
  hook.speed = Math.max(0, hook.speed - hook.speed * Math.min(1, dt * 4));
}

/**
 * Faster than this, in tank units per second, and the bait is being yanked about.
 * Set so that walking the bait around the lake is fine and flicking it is not:
 * too strict and a child cannot move the line at all without emptying the water.
 */
export const JERK_SPEED = 5;
/** How close a mouth must come to the bait to take it, in tank units. */
export const BITE_REACH = 0.42;
/** A jerk this close frightens a fish, in tank units. */
export const JERK_REACH = 2.4;
/** Fish are drawn to bait from this far, in tank units — further than a flake. */
export const BAIT_SMELL = 5;
/** Catches before the celebration and the star. */
export const CATCH_FOR_STAR = 3;
/** How many fish swim in the lake at once. */
export const LAKE_MIN = 5;
export const LAKE_MAX = 8;

/** Is the bait being moved too fast to be worth trusting? */
export function isJerking(hook: Hook, tank: Tank): boolean {
  return hook.speed > JERK_SPEED * tank.unit;
}

/**
 * Who is on the end of the line now. A fish takes the bait when it is hungry,
 * unafraid, and its mouth reaches a bait that is being held reasonably still.
 * Anything else is just a fish looking at a hook.
 */
export function biter(hook: Hook, fish: readonly Creature[], tank: Tank): Creature | null {
  // A bait held in the air catches nothing, an empty hook catches nothing, and a
  // bait that has only just stopped moving has not settled yet.
  if (hook.caught || !hook.baited || isJerking(hook, tank) || isOutOfWater(hook, tank)) return null;
  if (hook.steady < STEADY_SECONDS) return null;
  for (const cr of fish) {
    if (cr.fear > 0 || cr.mood !== 'hungry') continue;
    const mouthX = cr.x + Math.cos(cr.heading) * cr.length * 0.15;
    const mouthY = cr.y + Math.sin(cr.heading) * cr.length * 0.15;
    if (Math.hypot(hook.x - mouthX, hook.y - mouthY) < BITE_REACH * tank.unit) return cr;
  }
  return null;
}

/** The water starts here: above this line the bait is dangling in the air. */
export const WATERLINE = 0.14;

/** Is the bait out of the water, where no fish can reach it? */
export function isOutOfWater(hook: Hook, tank: Tank): boolean {
  return hook.y <= tank.h * WATERLINE;
}

/** High enough out of the water to count as landed. */
export function isLanded(hook: Hook, tank: Tank): boolean {
  return hook.caught !== null && hook.y <= tank.h * 0.12;
}

/**
 * Who can be caught. A jellyfish cannot steer to a bait, so it would only ever
 * be an animal the child could not catch — but a crab will come along the sand
 * for one, which gives the bottom of the lake a reason to be visited.
 */
export const CATCHABLE: readonly Species[] = SPECIES.filter(
  (s) => s.kind === 'fish' || s.kind === 'ray' || s.kind === 'crab',
);

/** Which fish live in this lake: a handful, never two of anything unusual. */
export function lakeStock(tank: Tank, rng: () => number = Math.random): Species[] {
  const room = (tank.w * tank.h) / (520 * 820);
  const n = Math.round(Math.max(LAKE_MIN, Math.min(LAKE_MAX, LAKE_MIN + room * 2)));
  const pool = CATCHABLE;
  return Array.from({ length: n }, () => pool[Math.floor(rng() * pool.length)] ?? pool[0]!);
}

/** A fish to take the place of one that has just been lifted out. */
export function replacement(rng: () => number = Math.random): Species {
  return CATCHABLE[Math.floor(rng() * CATCHABLE.length)] ?? CATCHABLE[0]!;
}

/** How fast the reel button hauls the line up, in tank units per second. */
export const REEL_SPEED = 5.5;

/** Where a fresh cast drops the bait to, as a fraction of the water's depth. */
export const CAST_DEPTH = 0.45;

/** Is the line out of the water with nothing on it, waiting to be cast again? */
export function needsCast(hook: Hook, tank: Tank): boolean {
  return hook.caught === null && (!hook.baited || isOutOfWater(hook, tank));
}

/** Drop the line back in, straight down from the rod. */
export function cast(hook: Hook, dt: number, tank: Tank): boolean {
  const target = tank.h * CAST_DEPTH;
  const step = REEL_SPEED * tank.unit * dt;
  hook.y = Math.min(target, hook.y + step);
  hook.x += Math.sign(tank.w * ROD_X - hook.x) * Math.min(step, Math.abs(tank.w * ROD_X - hook.x));
  hook.speed = 0;
  // A fresh bait goes on as the line goes out, and has to settle like any other.
  hook.baited = true;
  hook.steady = 0;
  return hook.y >= target - 0.5;
}

/** Wind the line in on its own, towards the rod at the surface. */
export function reel(hook: Hook, dt: number, tank: Tank): void {
  const step = REEL_SPEED * tank.unit * dt;
  hook.y = Math.max(tank.h * 0.08, hook.y - step);
  hook.x += Math.sign(tank.w * ROD_X - hook.x) * Math.min(step, Math.abs(tank.w * ROD_X - hook.x));
  // Winding in is the child's own doing, so it never counts as a scare.
  hook.speed = 0;
}
