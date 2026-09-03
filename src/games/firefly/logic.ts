import { randInt } from '../../core/dom';
import { BLOW_THRESHOLD } from '../birthday/logic';

/**
 * Đêm hè: a meadow after dark, with nothing to finish. The numbers here are
 * picked for how the field looks while it runs, not for any difficulty curve.
 */

/** Fireflies on the wing at once: enough that the field is alive, few enough to chase one. */
export const FIREFLIES = 9;
/** Stars in the sky. They only twinkle, so each costs a keyframe and nothing else. */
export const SKY_STARS = 40;
/** Blades in the grass along the bottom. Enough to read as a meadow, not a comb. */
export const BLADES = 44;
/** A star for the child every this many happy touches. */
export const STAR_EVERY = 12;

/** Candles standing in the grass — a whole row to light, not one lonely stick. */
export const CANDLES = 6;
/** Gap between candles when a single breath blows the whole row out. */
export const BLOW_GAP_MS = 140;

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

export interface Candle {
  /** Where it stands, as a fraction of the field width. */
  x: number;
  /** Multiplier on the drawn height: a row of identical candles reads as a fence. */
  height: number;
  /** Hue of the wax stripes. */
  hue: number;
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

/** The microphone button sits bottom right in both orientations; the row stops short of it. */
export const CANDLE_LEFT = 0.08;
export const CANDLE_SPAN = 0.72;

export function makeCandle(i: number, n: number, rng: () => number = Math.random): Candle {
  return {
    // Across the meadow, jittered: a row set out on a ruler looks planted.
    x: CANDLE_LEFT + ((i + 0.5) / n) * CANDLE_SPAN + (rng() - 0.5) * 0.04,
    height: 0.78 + rng() * 0.5,
    hue: Math.round(rng() * 360),
  };
}

/**
 * How warm the meadow looks with `lit` candles alight, 0 … 1. Half the glow
 * arrives with the very first flame, so lighting one is visibly worth doing;
 * the rest of the row fills in the other half.
 */
export function warmth(lit: number, n = CANDLES): number {
  if (lit <= 0 || n <= 0) return 0;
  return Math.min(1, 0.5 + (0.5 * (lit - 1)) / Math.max(1, n - 1));
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

export const SHOOT_MIN_MS = 11000;
export const SHOOT_MAX_MS = 25000;

/**
 * Gap before the next shooting star that nobody asked for. The sky is worth
 * watching on its own, not only when a finger lands on it.
 */
export function nextShootMs(rng: () => number = Math.random): number {
  return randInt(SHOOT_MIN_MS, SHOOT_MAX_MS, rng);
}

/* ---- fireworks ---- */

/**
 * The shapes a rocket opens into. Every one of them is the same handful of sparks
 * thrown outwards; what differs is where they are aimed, so the shape a child sees
 * is drawn by the sparks' own paths rather than painted anywhere.
 */
export type Burst = 'burst' | 'ring' | 'heart' | 'star' | 'willow' | 'spiral';

export const BURSTS: readonly Burst[] = ['burst', 'ring', 'heart', 'star', 'willow', 'spiral'];

/** Sparks in the sky at once, over every firework. A cap, not a target. */
export const MAX_SPARKS = 320;
/** Past this many sparks the drawing sheds its widest layer to keep the frame rate. */
export const BUSY_SKY = 170;
/** Pull downwards, in field fractions per second squared. */
export const SPARK_GRAVITY = 0.3;
/** Air, as a fraction of speed shed per second: what turns a ring into a flower. */
export const SPARK_DRAG = 0.9;
/** Seconds a spark spends fading out at the end of its life. */
export const SPARK_FADE = 0.5;
/**
 * How much of a spark's path is drawn behind it, in seconds. Drawing only the
 * step it took last frame ties the length of the streak to the frame rate, and
 * on a fast screen that is a dot.
 */
export const SPARK_TAIL = 0.075;

/** The white-hot blink at the moment a rocket opens. */
export interface Flash {
  x: number;
  y: number;
  hue: number;
  life: number;
}
/** Seconds the blink lasts. Long enough to be seen, short enough not to be a lamp. */
export const FLASH_LIFE = 0.4;

export function stepFlash(f: Flash, dt: number): Flash {
  return { ...f, life: f.life - dt };
}

/** 0 … 1, and how wide the blink has spread by now. */
export function flashAt(life: number): { alpha: number; spread: number } {
  const gone = Math.max(0, Math.min(1, 1 - life / FLASH_LIFE));
  return { alpha: (1 - gone) ** 1.6, spread: 0.25 + gone * 0.75 };
}

export interface Spark {
  x: number;
  y: number;
  /** Where it was a frame ago, so it can be drawn as a streak and not a dot. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  /** Seconds left. */
  life: number;
  hue: number;
  /** Line width as a fraction of the field's short side. */
  size: number;
}

/** A rocket on its way up, before it becomes a shape. */
export interface Rocket {
  x: number;
  y: number;
  py: number;
  vy: number;
  /** Height it opens at, as a fraction of the field. */
  top: number;
  hue: number;
  shape: Burst;
}

/**
 * Where spark `i` of `n` is aimed, as a vector whose length is part of the shape:
 * a spark flies roughly along its own aim, so a ring of aims draws a ring and a
 * heart of aims draws a heart. Lengths are 0 … 1 of the burst's reach.
 */
export function sparkAim(kind: Burst, i: number, n: number, rng: () => number = Math.random): { x: number; y: number } {
  const turn = (i / n) * Math.PI * 2;
  switch (kind) {
    case 'ring':
      return { x: Math.cos(turn), y: Math.sin(turn) };
    case 'heart': {
      // The usual heart curve, scaled to fit the same reach as the ring.
      const t = turn;
      const hx = 16 * Math.sin(t) ** 3;
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return { x: hx / 17, y: hy / 17 };
    }
    case 'star': {
      // Five points: the radius alternates as the angle goes round.
      const spikes = 5;
      const wave = Math.cos(turn * spikes);
      const r = 0.5 + 0.5 * ((wave + 1) / 2) ** 0.4;
      return { x: Math.cos(turn - Math.PI / 2) * r, y: Math.sin(turn - Math.PI / 2) * r };
    }
    case 'spiral': {
      const spin = turn * 2.2;
      const r = 0.25 + 0.75 * (i / Math.max(1, n - 1));
      return { x: Math.cos(spin) * r, y: Math.sin(spin) * r };
    }
    case 'willow': {
      // Thrown upwards and outwards; gravity does the drooping.
      const up = -Math.PI / 2 + (rng() - 0.5) * 2.2;
      const r = 0.55 + rng() * 0.45;
      return { x: Math.cos(up) * r, y: Math.sin(up) * r };
    }
    default: {
      // A filled ball: every direction, at every distance.
      const a = turn + (rng() - 0.5) * 0.5;
      const r = 0.35 + rng() * 0.65;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }
  }
}

/** How many sparks a shape is drawn with, and how far and long they fly. */
export function burstStyle(kind: Burst): { sparks: number; reach: number; life: number; size: number } {
  switch (kind) {
    case 'ring':
      return { sparks: 34, reach: 0.34, life: 1.5, size: 0.006 };
    case 'heart':
      return { sparks: 40, reach: 0.32, life: 1.6, size: 0.007 };
    case 'star':
      return { sparks: 44, reach: 0.34, life: 1.5, size: 0.006 };
    case 'spiral':
      return { sparks: 40, reach: 0.32, life: 1.5, size: 0.006 };
    case 'willow':
      return { sparks: 28, reach: 0.26, life: 2.4, size: 0.009 };
    default:
      return { sparks: 46, reach: 0.36, life: 1.4, size: 0.007 };
  }
}

/**
 * A whole firework, as the sparks it opens into. `hue` colours the shape; the
 * plain burst ignores it and takes every colour at once, which is the one every
 * child points at.
 */
export function makeBurst(kind: Burst, x: number, y: number, hue: number, rng: () => number = Math.random): Spark[] {
  const { sparks, reach, life, size } = burstStyle(kind);
  const out: Spark[] = [];
  for (let i = 0; i < sparks; i++) {
    const aim = sparkAim(kind, i, sparks, rng);
    const speed = reach / life;
    out.push({
      x,
      y,
      px: x,
      py: y,
      vx: aim.x * speed * (0.85 + rng() * 0.3),
      vy: aim.y * speed * (0.85 + rng() * 0.3),
      life: life * (0.8 + rng() * 0.4),
      hue: kind === 'burst' ? Math.round(rng() * 360) : (hue + (rng() - 0.5) * 40 + 360) % 360,
      size,
    });
  }
  return out;
}

/**
 * A cinder falling off a rocket on its way up. Short-lived and slow, so the climb
 * leaves a trail of its own rather than a bare line.
 */
export function makeEmber(x: number, y: number, hue: number, rng: () => number = Math.random): Spark {
  return {
    x,
    y,
    px: x,
    py: y,
    vx: (rng() - 0.5) * 0.06,
    vy: 0.02 + rng() * 0.06,
    life: 0.3 + rng() * 0.35,
    hue: (hue + (rng() - 0.5) * 30 + 360) % 360,
    size: 0.004,
  };
}

/**
 * A spark a moment later, in place: air slows it, gravity takes it down, and it
 * burns out. Written as a mutation because there can be hundreds of these on a
 * frame, and a new object each is a bag of rubbish for a tablet to collect.
 */
export function advanceSpark(s: Spark, dt: number): void {
  const drag = Math.max(0, 1 - SPARK_DRAG * dt);
  s.vx *= drag;
  s.vy = s.vy * drag + SPARK_GRAVITY * dt;
  s.px = s.x;
  s.py = s.y;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.life -= dt;
}

/** The same step, on a copy. The physics lives in one place; this is for reading and testing. */
export function stepSpark(s: Spark, dt: number): Spark {
  const next = { ...s };
  advanceSpark(next, dt);
  return next;
}

/** 0 … 1: full brightness until the last moments, then out. */
export function sparkFade(life: number): number {
  if (life <= 0) return 0;
  return life >= SPARK_FADE ? 1 : life / SPARK_FADE;
}

/** A rocket climbing, slowing as it goes, until it reaches the height it opens at. */
export function stepRocket(r: Rocket, dt: number): Rocket {
  const vy = r.vy + SPARK_GRAVITY * 0.6 * dt;
  return { ...r, py: r.y, y: r.y + vy * dt, vy };
}

/** A rocket aimed at a patch of sky worth looking at: high, but not in the top corner. */
export function makeRocket(rng: () => number = Math.random): Rocket {
  const top = 0.16 + rng() * 0.28;
  const from = 0.86;
  // Fast enough to arrive in about a second, slowing all the way up.
  return {
    x: 0.15 + rng() * 0.7,
    y: from,
    py: from,
    vy: -(from - top) / 0.8,
    top,
    hue: Math.round(rng() * 360),
    shape: BURSTS[Math.floor(rng() * BURSTS.length)] ?? 'burst',
  };
}
