import { randInt } from '../../core/dom';
import { BLOW_THRESHOLD } from '../birthday/logic';

/**
 * Đêm hè: a meadow after dark, with nothing to finish. The numbers here are
 * picked for how the field looks while it runs, not for any difficulty curve.
 */

/** Fireflies on the wing at once: enough that the field is alive, few enough to chase one. */
export const FIREFLIES = 7;
/** Stars in the sky. They only twinkle, so each costs a keyframe and nothing else. */
export const SKY_STARS = 40;
/** Blades in the grass along the bottom. Enough to read as a meadow, not a comb. */
export const BLADES = 44;
/** A star for the child every this many happy touches. */
export const STAR_EVERY = 12;

/** Fireflies keep out of the very top and off the grass, in fractions of the field. */
export const FLY_TOP = 0.05;
export const FLY_BOTTOM = 0.84;

/** Hardest the scene is ever blown sideways, in fractions of the field per second. */
export const MAX_WIND = 0.5;

/**
 * A breath the grass can feel. Well below the blow that puts the candle out, so
 * a child who cannot manage a hard puff still gets a field that moves for them.
 */
export const BREEZE_THRESHOLD = BLOW_THRESHOLD / 3;

/**
 * A firefly, in fractions of the field so nothing needs recomputing when the
 * tablet is turned. `phase` is what keeps them from pulsing in unison.
 */
export interface Firefly {
  x: number;
  y: number;
  /** The firefly's own drift, in fractions of the field per second. */
  vx: number;
  vy: number;
  phase: number;
  /** Diameter as a fraction of the field's short side. */
  size: number;
}

export interface SkyStar {
  x: number;
  y: number;
  /** Diameter in vmin. */
  size: number;
  /** Twinkle timing, in seconds. A negative delay starts mid-cycle. */
  delay: number;
  dur: number;
}

export interface Blade {
  x: number;
  /** Height as a fraction of the grass strip. */
  height: number;
  /** Width in vmin. Blades of one width read as a fence. */
  width: number;
  delay: number;
  dur: number;
}

export function makeFirefly(rng: () => number = Math.random): Firefly {
  return {
    x: rng(),
    y: FLY_TOP + rng() * (FLY_BOTTOM - FLY_TOP),
    vx: (rng() - 0.5) * 0.06,
    vy: (rng() - 0.5) * 0.04,
    phase: rng() * Math.PI * 2,
    size: 0.05 + rng() * 0.02,
  };
}

export function makeSkyStar(rng: () => number = Math.random): SkyStar {
  return {
    x: rng(),
    // Stars stop above the grass line; below it they would be underground.
    y: rng() * 0.62,
    size: 0.6 + rng() * 1.1,
    delay: -rng() * 4,
    dur: 2.2 + rng() * 2.6,
  };
}

export function makeBlade(i: number, n: number, rng: () => number = Math.random): Blade {
  return {
    // Spread evenly, then jitter: grass is neither a comb nor a clump.
    x: (i + 0.5) / n + (rng() - 0.5) / n,
    height: 0.45 + rng() * 0.55,
    width: 0.7 + rng() * 1.1,
    delay: -rng() * 3,
    dur: 2.4 + rng() * 1.8,
  };
}

/**
 * A firefly a moment later. Its own drift is slow and wandering; `wind` is the
 * child's breath, which only ever pushes right. At an edge it turns its drift
 * around instead of bouncing, so a long blow cannot pin the field to one wall.
 */
export function stepFirefly(f: Firefly, dt: number, t: number, wind: number): Firefly {
  const vx = f.vx + Math.sin(t * 0.7 + f.phase) * 0.02 + wind;
  const vy = f.vy + Math.cos(t * 0.53 + f.phase * 1.3) * 0.015;
  let x = f.x + vx * dt;
  let y = f.y + vy * dt;
  let ownVx = f.vx;
  let ownVy = f.vy;
  if (x < 0) {
    x = 0;
    ownVx = Math.abs(ownVx);
  } else if (x > 1) {
    x = 1;
    ownVx = -Math.abs(ownVx);
  }
  if (y < FLY_TOP) {
    y = FLY_TOP;
    ownVy = Math.abs(ownVy);
  } else if (y > FLY_BOTTOM) {
    y = FLY_BOTTOM;
    ownVy = -Math.abs(ownVy);
  }
  return { ...f, x, y, vx: ownVx, vy: ownVy };
}

/** How bright a firefly is right now, 0 … 1. Never fully dark: a firefly that vanishes is a lost toy. */
export function glow(f: Firefly, t: number): number {
  return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.1 + f.phase));
}

/** Microphone loudness → how hard the whole scene is blown. Under a breath, nothing moves. */
export function windFrom(level: number): number {
  if (level <= BREEZE_THRESHOLD) return 0;
  const span = BLOW_THRESHOLD * 2 - BREEZE_THRESHOLD;
  return Math.min(MAX_WIND, ((level - BREEZE_THRESHOLD) / span) * MAX_WIND);
}

/** How far the grass leans, in degrees, for a given wind. */
export function leanDeg(wind: number): number {
  return (wind / MAX_WIND) * 32;
}

export const CHIRP_MIN_MS = 3500;
export const CHIRP_MAX_MS = 9000;

/** Crickets do not keep time. This is the gap before the next one. */
export function nextChirpMs(rng: () => number = Math.random): number {
  return randInt(CHIRP_MIN_MS, CHIRP_MAX_MS, rng);
}
