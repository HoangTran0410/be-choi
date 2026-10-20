/**
 * The maths behind the touch effects, kept free of the DOM so it can be tested:
 * damped wobbles, a vibrating string, a smooth ribbon for a finger trail, and
 * how to walk a finger's path across a board without skipping anything.
 */
import { inShape } from './svg';
import type { Zone } from './types';

export const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** How far to move toward a target this frame so the result looks the same at 30 and 60 fps (`tau` = ms to cover ~63%). */
export const easeK = (dt: number, tau: number): number => 1 - Math.exp(-Math.max(0, dt) / tau);

/**
 * A damped oscillation dying away by t=1. With `phase` 0 it starts at rest and swings to +1 first
 * (a chime, a cymbal); with `phase` PI/2 it starts at its peak, as a skin does the instant it is hit.
 */
export const osc = (t: number, cycles: number, decay: number, phase = 0): number =>
  Math.sin(Math.PI * 2 * cycles * t + phase) * Math.exp(-decay * t);

/**
 * Keyframes for a wobble: `make(u)` turns the oscillation value `u` (about -1…1)
 * into a CSS transform. `steps` samples are enough: the browser joins them smoothly.
 */
export function wobbleFrames(make: (u: number) => string, cycles: number, decay: number, steps = 22, phase = 0): Keyframe[] {
  const out: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({ transform: make(osc(t, cycles, decay, phase)), offset: t });
  }
  return out;
}

// ---- a vibrating string ----

export interface StringState {
  /** Pluck: height of the pull (px), where along the string (0…1), and ms since. */
  amp: number;
  at: number;
  age: number;
  /** Bow: current and wanted strength of the sustained vibration (px). */
  bow: number;
  bowTo: number;
  /** Phase clock for the bowed vibration, ms. */
  clock: number;
  /** One swing of the fundamental takes this long (ms): thin strings are quicker. */
  period: number;
  /** How long a pluck takes to die away (ms). */
  ring: number;
}

export const newString = (period: number, ring = 520): StringState => ({
  amp: 0,
  at: 0.5,
  age: 0,
  bow: 0,
  bowTo: 0,
  clock: 0,
  period,
  ring,
});

/** Pull a string at `at` (0…1 along it) by `amp` px: it will ring down by itself. */
export function pluckString(st: StringState, amp: number, at: number): void {
  st.amp = amp;
  st.at = clamp(at, 0.1, 0.9);
  st.age = 0;
}

/** Sideways displacement (px) at `s` (0…1 along the string): the first few modes of a plucked string plus a bowed one. */
export function stringOffset(st: StringState, s: number): number {
  let d = 0;
  if (st.amp > 0.01) {
    const w = (Math.PI * 2) / st.period;
    const p = st.at;
    const norm = (2 * st.amp) / (Math.PI * Math.PI * p * (1 - p));
    for (let k = 1; k <= 4; k++) {
      const ak = (norm * Math.sin(k * Math.PI * p)) / (k * k);
      d += ak * Math.sin(k * Math.PI * s) * Math.cos(k * w * st.age) * Math.exp(-st.age / (st.ring / Math.pow(k, 0.55)));
    }
  }
  if (st.bow > 0.01) {
    const w = (Math.PI * 2) / st.period;
    d += st.bow * (Math.sin(Math.PI * s) * Math.cos(w * st.clock) + 0.22 * Math.sin(2 * Math.PI * s) * Math.cos(2 * w * st.clock + 0.8));
  }
  return d;
}

/** Move a string's clocks on by `dt` ms; false once it has settled completely. */
export function stepString(st: StringState, dt: number): boolean {
  st.age += dt;
  st.clock += dt;
  st.bow = lerp(st.bow, st.bowTo, easeK(dt, st.bowTo > st.bow ? 70 : 140));
  if (st.amp > 0 && st.amp * Math.exp(-st.age / st.ring) < 0.25) st.amp = 0;
  if (st.bowTo === 0 && st.bow < 0.25) st.bow = 0;
  return st.amp > 0 || st.bow > 0;
}

/** Path data for a string from (x1,y1) to (x2,y2) bent sideways by `offset(s)`. */
export function stringPath(x1: number, y1: number, x2: number, y2: number, offset: (s: number) => number, n = 18): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const o = offset(s);
    d += `${i ? 'L' : 'M'}${r2(x1 + (x2 - x1) * s + nx * o)} ${r2(y1 + (y2 - y1) * s + ny * o)}`;
  }
  return d;
}

/** Where along a segment (0…1) the point (x, y) falls, by projection. */
export function alongSegment(x1: number, y1: number, x2: number, y2: number, x: number, y: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  return clamp(((x - x1) * dx + (y - y1) * dy) / l2, 0, 1);
}

// ---- a smooth trail ----

export interface Pt {
  x: number;
  y: number;
}
export interface TrailPt extends Pt {
  t: number;
}

/** Quadratic chain through the points, via midpoints: smooth, with no kinks. Starts with `M` or `L`. */
function chain(ps: Pt[], first: 'M' | 'L'): string {
  if (!ps.length) return '';
  let d = `${first}${r2(ps[0]!.x)} ${r2(ps[0]!.y)}`;
  for (let i = 1; i < ps.length - 1; i++) {
    const a = ps[i]!;
    const b = ps[i + 1]!;
    d += `Q${r2(a.x)} ${r2(a.y)} ${r2((a.x + b.x) / 2)} ${r2((a.y + b.y) / 2)}`;
  }
  const last = ps[ps.length - 1]!;
  if (ps.length > 1) d += `L${r2(last.x)} ${r2(last.y)}`;
  return d;
}

/**
 * A tapered ribbon along `pts` (oldest first): thin and faint at the tail, `width`
 * wide at the head. One closed path, so a trail is a single smooth shape.
 * `life` is how old (ms) a point may be before its width reaches zero.
 */
export function ribbonPath(pts: readonly TrailPt[], now: number, width: number, life: number): string {
  if (pts.length < 2) return '';
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const age = clamp((now - pts[i]!.t) / life, 0, 1);
    const w = (width / 2) * Math.pow(1 - age, 0.8);
    const nx = -dy / l;
    const ny = dx / l;
    left.push({ x: pts[i]!.x + nx * w, y: pts[i]!.y + ny * w });
    right.push({ x: pts[i]!.x - nx * w, y: pts[i]!.y - ny * w });
  }
  return `${chain(left, 'M')}${chain(right.reverse(), 'L')}Z`;
}

// ---- walking a finger's path ----

export interface Crossing {
  zone: Zone;
  /** Where the path first enters the zone. */
  x: number;
  y: number;
}

/**
 * Every zone a finger passes through going from (ax, ay) to (bx, by), in order,
 * each once in a row. `skip` (the zone the finger is already in) is left out of
 * the front of the list. A fast flick that jumps over several keys or strings
 * still reports them all, which is what makes a glissando continuous.
 */
export function zonesAlong(
  zones: readonly Zone[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  skip: string | null,
  step = 5,
): Crossing[] {
  const dist = Math.hypot(bx - ax, by - ay);
  const n = Math.min(120, Math.max(1, Math.ceil(dist / step)));
  const out: Crossing[] = [];
  let prev: string | null = skip;
  for (let i = 1; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const y = ay + ((by - ay) * i) / n;
    const z = zones.find((q) => inShape(q.shape, x, y)) ?? null;
    const id = z ? z.id : null;
    if (id !== prev) {
      if (z) out.push({ zone: z, x, y });
      prev = id;
    }
  }
  return out;
}

/** Keep at most `max` items, always the first and the last, the rest spread evenly. */
export function thin<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]!);
  return out;
}
