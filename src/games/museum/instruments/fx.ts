/**
 * What a touch looks like, instrument by instrument (see index.ts for who calls it).
 *
 *  - a skin dips and wobbles, a bar bounces and rings, a tine springs back, a chime
 *    swings, a gong sways and sends out waves, a key sinks and rises again;
 *  - strings really vibrate (a sine that dies away, bigger for a harder touch, and
 *    from the spot that was touched), a bow lies across the violin and rubs the string;
 *  - a finger that slides leaves one smooth tapering ribbon, not a scatter of dots;
 *  - wind instruments breathe out notes.
 *
 * Everything moves with `transform` and `opacity` (or the `d` of a string, which
 * never changes layout) and runs on core/frame's single loop. On a struggling
 * device (`perf.low`) the extras (glow, dust, extra rings) are skipped.
 */
import { perf } from '../../../core/frame';
import {
  alongSegment,
  clamp,
  easeK,
  newString,
  pluckString,
  ribbonPath,
  stepString,
  stringOffset,
  stringPath,
  wobbleFrames,
  type StringState,
  type TrailPt,
} from './fxmath';
import { shapeCenter, shapeSize } from './svg';
import type { Board, Family, Shape, Zone } from './types';

const NS = 'http://www.w3.org/2000/svg';
const canAnimate = typeof Element !== 'undefined' && typeof (Element.prototype as { animate?: unknown }).animate === 'function';
const reducedMotion = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const r1 = (n: number): number => Math.round(n * 10) / 10;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

// ---- how each kind of zone moves when struck ----

interface Motion {
  /** CSS transform for oscillation `u` (about -1…1) at strength `v` (0…1); `i` numbers the elements of one zone. */
  make: (u: number, v: number, i: number) => string;
  cycles: number;
  decay: number;
  dur: number;
  origin?: string;
  /** Starts from rest and swings (hanging things, cymbals); otherwise it starts at the dip, the instant of the hit. */
  swing?: boolean;
  /** Other zones that move along with this one (a gong's boss and rim, the chimes either side). */
  along?: Array<{ id: string; k: number; delay: number }>;
}
/** Rings that spread from the spot touched. `clip`: stay inside the zone's own shape. */
interface Rings {
  n: number;
  from: number;
  to: number;
  clip: boolean;
  color: string;
  w: number;
  ms: number;
  gap: number;
}
/** A zone that stays pressed while the finger is on it. */
interface Sink {
  /** Scale along the two axes of the press. */
  s: number;
  glow?: string;
}

/** The struck part moves this much more than the first version did: it has to be seen across a room. */
const ZONE_AMP = 1.6;
const sc = (n: number): number => Math.round(n * 1000) / 1000;
const SKIN: Rings = { n: 2, from: 0.12, to: 0.95, clip: true, color: '#64748b', w: 4, ms: 620, gap: 110 };
const WATER: Rings = { n: 3, from: 0.15, to: 1.8, clip: false, color: '#0ea5e9', w: 3, ms: 900, gap: 150 };
const WAVE: Rings = { n: 1, from: 0.3, to: 1.2, clip: false, color: '#d97706', w: 5, ms: 1300, gap: 300 };
const SHINE: Rings = { n: 1, from: 0.5, to: 1.3, clip: false, color: '#f59e0b', w: 3, ms: 900, gap: 0 };

function motionFor(board: Board, zone: Zone): Motion | null {
  const id = zone.id;
  switch (board.family) {
    case 'bars': {
      const long = board.kind === 'vibraphone';
      return {
        make: (u, v) => `scale(${sc(1 - 0.05 * v * u)}, ${sc(1 + 0.04 * v * u)}) rotate(${sc(u * 1.8 * v)}deg)`,
        cycles: long ? 4.5 : 3,
        decay: long ? 2.2 : 4,
        dur: long ? 1000 : 560,
      };
    }
    case 'tines':
      return { make: (u, v) => `rotate(${sc(u * 5.5 * v)}deg)`, cycles: 4.5, decay: 3.2, dur: 650, origin: '50% 100%' };
    case 'chimes': {
      const i = board.zones.findIndex((z) => z.id === id);
      const along: Motion['along'] = [];
      for (const [d, k] of [
        [-1, 0.4],
        [1, 0.4],
      ] as const) {
        const nb = board.zones[i + d];
        if (nb) along.push({ id: nb.id, k, delay: 90 });
      }
      return { make: (u, v) => `rotate(${sc(u * 9 * v)}deg)`, cycles: 2.3, decay: 1.9, dur: 1500, origin: '50% 0%', along };
    }
    case 'gong':
      return null; // the whole gong swings as one group (see bodyFor)
    case 'pan':
      return { make: (u, v) => `scale(${sc(1 - 0.07 * v * u)})`, cycles: 2.6, decay: 3, dur: 600 };
    case 'kit': {
      if (id === 'd:crash' || id === 'd:ride')
        return {
          make: (u, v) => `rotate(${sc(u * 4 * v)}deg) scale(${sc(1 - 0.03 * v * Math.abs(u))})`,
          cycles: 4,
          decay: 2,
          dur: 1500,
          swing: true,
        };
      if (id === 'd:hat') return { make: (u, v) => `scale(1, ${sc(1 - 0.1 * v * Math.abs(u))})`, cycles: 3, decay: 5, dur: 360 };
      if (id === 'd:kick') return { make: (u, v) => `scale(${sc(1 - 0.09 * v * u)})`, cycles: 2, decay: 3, dur: 560 };
      return { make: (u, v) => `scale(${sc(1 - 0.07 * v * u)}, ${sc(1 - 0.05 * v * u)})`, cycles: 2.6, decay: 3.2, dur: 560 };
    }
    case 'djembe':
      if (id === 'djembe:bass')
        return { make: (u, v) => `scale(${sc(1 - 0.05 * v * u)}, ${sc(1 + 0.03 * v * u)})`, cycles: 2, decay: 3, dur: 620 };
      return {
        make: (u, v) => `scale(${sc(1 - 0.07 * v * u)}, ${sc(1 - 0.06 * v * u)})`,
        cycles: 2.8,
        decay: 3.2,
        dur: 560,
        along: id === 'djembe:center' ? [{ id: 'djembe:edge', k: 0.6, delay: 0 }] : undefined,
      };
    case 'rack': {
      switch (id) {
        case 'r:cowbell':
          return { make: (u, v) => `rotate(${sc(u * 10 * v)}deg)`, cycles: 2.2, decay: 2.2, dur: 1000, origin: '50% 20%' };
        case 'r:triangle':
          return { make: (u, v) => `rotate(${sc(u * 7 * v)}deg)`, cycles: 5, decay: 2.4, dur: 1200, origin: '50% 10%' };
        case 'r:wood':
          return {
            make: (u, v) => `translate(0px, ${sc(-4 * v * Math.abs(u))}px) scale(${sc(1 - 0.06 * v * u)})`,
            cycles: 3,
            decay: 5,
            dur: 360,
          };
        case 'r:shaker':
          return { make: (u, v) => `translate(${sc(u * 9 * v)}px, 0px) rotate(${sc(u * 10 * v)}deg)`, cycles: 3.5, decay: 3, dur: 600 };
        default:
          return {
            make: (u, v) => `scale(${sc(1 - 0.16 * v * Math.abs(u))}, ${sc(1 + 0.04 * v * Math.abs(u))})`,
            cycles: 3,
            decay: 5,
            dur: 400,
          };
      }
    }
    case 'shake':
      if (id === 'tamb:head')
        return {
          make: (u, v) => `scale(${sc(1 - 0.06 * v * u)})`,
          cycles: 2.6,
          decay: 3,
          dur: 560,
          along: [{ id: 'tamb:rim', k: 0.5, delay: 0 }],
        };
      if (id === 'tamb:rim')
        return {
          make: (u, v, i) => `rotate(${sc(u * (i ? 22 : 4) * v * (i % 2 ? 1 : -1))}deg) translate(${sc(u * 2 * v)}px, 0px)`,
          cycles: 4,
          decay: 2.5,
          dur: 800,
          swing: true,
        };
      if (id.startsWith('cast:'))
        return {
          make: (u, v) => `scale(${sc(1 - 0.15 * v * Math.abs(u))}, ${sc(1 + 0.07 * v * Math.abs(u))})`,
          cycles: 4,
          decay: 6,
          dur: 380,
        };
      return {
        make: (u, v) => `translate(${sc(u * 9 * v)}px, 0px) rotate(${sc(u * (id === 'maraca:left' ? 15 : -15) * v)}deg)`,
        cycles: 3.5,
        decay: 2.8,
        dur: 650,
      };
    case 'fret':
      return zone.role === 'chord' ? { make: (u, v) => `scale(${sc(1 - 0.06 * v * Math.abs(u))})`, cycles: 2, decay: 4, dur: 300 } : null;
    case 'panflute':
      return { make: (u, v) => `translate(0px, ${sc(u * 4 * v)}px)`, cycles: 2, decay: 3.5, dur: 420 };
    default:
      return null;
  }
}

/**
 * The whole instrument answers a touch: it squashes and springs, shakes or hums the way
 * its material does (metal rings long and fast, wood bounces short, skin dips, strings buzz).
 * One animation on the drawing itself, restarted on every touch, never stacked.
 */
function bodyFor(board: Board, zone: Zone): Motion | null {
  const id = zone.id;
  switch (board.family) {
    case 'keyboard':
      return { make: (u, v) => `scale(${sc(1 - 0.03 * v * u)}, ${sc(1 + 0.02 * v * u)})`, cycles: 2, decay: 4, dur: 380, origin: '50% 100%' };
    case 'bars':
      return {
        make: (u, v) => `scale(${sc(1 - 0.06 * v * u)}, ${sc(1 + 0.07 * v * u)})`,
        cycles: board.kind === 'vibraphone' ? 4 : 2.5,
        decay: board.kind === 'vibraphone' ? 2.5 : 4,
        dur: board.kind === 'vibraphone' ? 1000 : 560,
        origin: '50% 75%',
      };
    case 'tines':
      return { make: (u, v) => `scale(${sc(1 - 0.05 * v * u)}, ${sc(1 + 0.06 * v * u)}) rotate(${sc(u * 1.6 * v)}deg)`, cycles: 4, decay: 3, dur: 650, origin: '50% 80%' };
    case 'chimes':
      return { make: (u, v) => `rotate(${sc(u * 1.8 * v)}deg)`, cycles: 2.3, decay: 1.9, dur: 1500, swing: true, origin: '50% 0%' };
    case 'gong':
      return { make: (u, v) => `rotate(${sc(u * 3.4 * v)}deg)`, cycles: 2.4, decay: 1.3, dur: 2000, swing: true, origin: '50% 4%' };
    case 'fret':
    case 'harp':
    case 'bow':
      return {
        make: (u, v) => `scale(${sc(1 + 0.012 * v * u)}, ${sc(1 - 0.03 * v * u)}) rotate(${sc(u * 0.9 * v)}deg)`,
        cycles: 7,
        decay: 3.2,
        dur: 700,
        swing: true,
        origin: '50% 55%',
      };
    case 'pan':
      return { make: (u, v) => `scale(${sc(1 - 0.06 * v * u)}, ${sc(1 - 0.045 * v * u)})`, cycles: 2.6, decay: 3, dur: 600, origin: '50% 60%' };
    case 'kit':
    case 'djembe':
      return {
        make: (u, v) => `scale(${sc(1 - 0.05 * v * u)}, ${sc(1 - 0.06 * v * u)})`,
        cycles: 2.6,
        decay: 3.2,
        dur: id === 'd:crash' || id === 'd:ride' ? 900 : 520,
        origin: '50% 70%',
      };
    case 'rack':
      return { make: (u, v) => `rotate(${sc(u * 1.6 * v)}deg) scale(${sc(1 - 0.04 * v * Math.abs(u))})`, cycles: 3, decay: 3, dur: 600, swing: true, origin: '50% 20%' };
    case 'shake':
      if (id.startsWith('cast:'))
        return { make: (u, v) => `scale(${sc(1 - 0.09 * v * Math.abs(u))}, ${sc(1 + 0.05 * v * Math.abs(u))})`, cycles: 4, decay: 5, dur: 420, origin: '50% 70%' };
      return {
        make: (u, v) => `translate(${sc(u * 10 * v)}px, 0px) rotate(${sc(u * 4 * v)}deg)`,
        cycles: 4,
        decay: 2.6,
        dur: 720,
        swing: true,
        origin: '50% 60%',
      };
    case 'tube':
    case 'harmonica':
    case 'panflute':
      return { make: (u, v) => `scale(${sc(1 - 0.04 * v * u)}, ${sc(1 + 0.03 * v * u)})`, cycles: 2, decay: 4, dur: 400, origin: '50% 60%' };
    case 'accordion':
      return { make: (u, v) => `scale(${sc(1 + 0.05 * v * u)}, ${sc(1 - 0.05 * v * u)})`, cycles: 2, decay: 3.5, dur: 480, origin: '50% 60%' };
    default:
      return null;
  }
}

function ringsFor(board: Board, zone: Zone): Rings | null {
  switch (board.family) {
    case 'kit':
      if (zone.id === 'd:crash' || zone.id === 'd:ride') return SHINE;
      return zone.id === 'd:hat' ? null : SKIN;
    case 'djembe':
      return SKIN;
    case 'pan':
      return WATER;
    case 'gong':
      return WAVE;
    case 'rack':
      return zone.id === 'r:triangle' || zone.id === 'r:cowbell' ? SHINE : null;
    case 'shake':
      return zone.id === 'tamb:head' ? SKIN : null;
    default:
      return null;
  }
}

/** Zones that stay pressed while a finger is on them. */
function sinkFor(board: Board, zone: Zone): Sink | null {
  switch (board.family) {
    case 'keyboard':
      return { s: zone.small ? 0.93 : 0.955 };
    case 'harmonica':
      return { s: 0.9, glow: '#ffffff' };
    case 'accordion':
      return { s: 0.9 };
    case 'tube':
      return zone.role === 'hole' || zone.role === 'blow' ? { s: 0.9 } : null;
    case 'fret':
      return null;
    default:
      return null;
  }
}

// ---- trails ----

interface TrailSpec {
  outer: string;
  inner: string;
  w: number;
  head: boolean;
  life: number;
}
const TRAIL_DEFAULT: TrailSpec = { outer: '#ffffff', inner: '#ffffff', w: 16, head: false, life: 340 };
const TRAILS: Partial<Record<Family, TrailSpec>> = {
  keyboard: { outer: '#8b5cf6', inner: '#ede9fe', w: 22, head: false, life: 420 },
  harp: { outer: '#ec4899', inner: '#fdf2f8', w: 16, head: true, life: 380 },
  fret: { outer: '#f59e0b', inner: '#fffbeb', w: 16, head: true, life: 380 },
  harmonica: { outer: '#38bdf8', inner: '#f0f9ff', w: 24, head: false, life: 420 },
};

interface Trail {
  id: number;
  spec: TrailSpec;
  g: SVGGElement;
  outer: SVGPathElement;
  inner: SVGPathElement;
  head: SVGCircleElement | null;
  pts: TrailPt[];
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  started: boolean;
  live: boolean;
}

interface Str {
  idx: number;
  path: SVGPathElement;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  st: StringState;
  glow: SVGPathElement | null;
  maxAmp: number;
  active: boolean;
}

interface Bow {
  id: number;
  g: SVGGElement;
  x: number;
  y: number;
  tx: number;
  ty: number;
  a: number;
  live: boolean;
  speed: number;
  lastDust: number;
}

export interface FxEnv {
  svg(): SVGSVGElement | null;
  board(): Board;
  later(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  /** Elements of a zone (a zone can be drawn in several pieces). */
  zoneEls(id: string): SVGElement[];
}

export interface HitOptions {
  /** A finger sliding across: no rings, nothing that would pile up. */
  swipe?: boolean;
}

export interface Fx {
  /** Call after the drawing was (re)made. */
  rebuild(): void;
  hit(zone: Zone, x: number, y: number, vel: number, opts?: HitOptions): void;
  /** A mallet swings in to the spot. */
  mallet(x: number, y: number): void;
  /** A finger came onto / left a zone. */
  press(zoneId: string): void;
  release(zoneId: string): void;
  /** Pluck string `idx` as hard as `vel` at the spot (x, y). */
  pluck(idx: number, vel: number, at?: { x: number; y: number }): void;
  /** A sweep of a pick across the strings of a strummed instrument, one string every `gap` ms. */
  sweep(from: number, to: number, gap: number): void;
  trailMove(id: number, x: number, y: number): void;
  trailEnd(id: number): void;
  bowMove(id: number, x: number, y: number): void;
  bowEnd(id: number): void;
  /** Wind: notes and breath while `on`. */
  breath(on: boolean): void;
  tick(now: number, dt: number): void;
  destroy(): void;
}

export function createFx(env: FxEnv): Fx {
  const animations = new WeakMap<Element, Animation>();
  const strings = new Map<number, Str>();
  const stringOfZone = new Map<string, number>();
  const trails = new Map<number, Trail>();
  const bows = new Map<number, Bow>();
  const pressedAt = new Map<string, number>();
  /** Throwaway sprites (rings, notes, dust): trimmed to a few. */
  let layer: SVGGElement | null = null;
  /** Sparks and notes that fly out of the spot touched: kept apart so they never push the rings out. */
  let burstG: SVGGElement | null = null;
  let lastBody = 0;
  let lastBuzz = 0;
  let lastBurst = 0;
  /** Things that last while a finger is down: string glow, trails, the bow. */
  let glows: SVGGElement | null = null;
  let trailG: SVGGElement | null = null;
  let bowG: SVGGElement | null = null;
  let clipDefs: SVGDefsElement | null = null;
  const clips = new Set<string>();
  let breathTimer: ReturnType<typeof setInterval> | null = null;
  let breathN = 0;
  let dead = false;

  const ani = (target: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null => {
    if (!canAnimate || reducedMotion()) return null;
    try {
      animations.get(target)?.cancel();
      const a = target.animate(frames, opts);
      animations.set(target, a);
      return a;
    } catch {
      return null;
    }
  };

  /** One-shot animation on a throwaway sprite. */
  const fly = (target: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): void => {
    if (!canAnimate || reducedMotion()) {
      target.remove();
      return;
    }
    try {
      const a = target.animate(frames, opts);
      a.onfinish = () => target.remove();
      a.oncancel = () => target.remove();
    } catch {
      target.remove();
    }
  };

  // ---- layers and strings ----

  function rebuild(): void {
    const svg = env.svg();
    strings.clear();
    stringOfZone.clear();
    trails.clear();
    bows.clear();
    clips.clear();
    layer = burstG = glows = trailG = bowG = null;
    clipDefs = null;
    if (!svg) return;
    clipDefs = el('defs');
    layer = el('g', { class: 'fx', 'pointer-events': 'none' });
    glows = el('g', { class: 'fx-glow', 'pointer-events': 'none' });
    trailG = el('g', { class: 'fx-trail', 'pointer-events': 'none' });
    bowG = el('g', { class: 'fx-bow', 'pointer-events': 'none' });
    burstG = el('g', { class: 'fx-burst', 'pointer-events': 'none' });
    svg.append(clipDefs, glows, layer, burstG, trailG, bowG);

    const board = env.board();
    // origins for the zones that swing or spring
    for (const z of board.zones) {
      const m = motionFor(board, z);
      if (m?.origin) for (const e of env.zoneEls(z.id)) e.style.transformOrigin = m.origin;
      const sink = sinkFor(board, z);
      if (sink)
        for (const e of env.zoneEls(z.id)) {
          e.classList.add('sinkable');
          e.style.setProperty('--sink', String(sink.s));
          if (board.family === 'keyboard') e.style.transformOrigin = board.portrait ? '0% 50%' : '50% 0%';
        }
    }

    const found: Str[] = [];
    svg.querySelectorAll<SVGPathElement>('path.str').forEach((p) => {
      const idx = Number(p.dataset.s);
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = (p.dataset.p ?? '').split(',').map(Number);
      found.push({
        idx,
        path: p,
        x1,
        y1,
        x2,
        y2,
        st: newString(0),
        glow: null,
        maxAmp: 10,
        active: false,
      });
      const zid = p.closest<SVGElement>('[data-z]')?.dataset.z;
      if (zid) stringOfZone.set(zid, idx);
    });
    // thin strings buzz faster; the gap between neighbours caps how far one may swing
    let gap = Infinity;
    for (let i = 0; i < found.length; i++)
      for (let j = i + 1; j < found.length; j++) {
        const a = found[i]!;
        const b = found[j]!;
        gap = Math.min(gap, Math.hypot((a.x1 + a.x2 - b.x1 - b.x2) / 2, (a.y1 + a.y2 - b.y1 - b.y2) / 2));
      }
    const n = found.length;
    found.forEach((s, i) => {
      s.st = newString(150 - (n > 1 ? (i / (n - 1)) * 65 : 0), env.board().family === 'harp' ? 950 : 700);
      s.maxAmp = clamp(Number.isFinite(gap) ? gap * 0.6 : 12, 5, 26);
      strings.set(s.idx, s);
    });
  }

  // ---- hits ----

  function clipFor(zone: Zone, k: number): string | null {
    if (!clipDefs) return null;
    const id = `fxc-${zone.id.replace(/[^a-z0-9]/gi, '_')}-${Math.round(k * 100)}`;
    if (!clips.has(id)) {
      clips.add(id);
      const cp = el('clipPath', { id });
      cp.append(shapeNode(zone.shape, k));
      clipDefs.append(cp);
    }
    return id;
  }

  function shapeNode(s: Shape, k: number): SVGElement {
    if (s.t === 'rect') return el('rect', { x: r1(s.x), y: r1(s.y), width: r1(s.w), height: r1(s.h), rx: 8 });
    return el('ellipse', { cx: r1(s.cx), cy: r1(s.cy), rx: r1(s.rx * k), ry: r1(s.ry * k) });
  }

  function rings(zone: Zone, spec: Rings, x: number, y: number, vel: number, swipe: boolean): void {
    if (!layer || reducedMotion() || !canAnimate) return;
    // a big ring repaints a lot of pixels each frame: never more than three alive at once
    if (spec === WAVE && layer.querySelectorAll('.wave').length >= 3) return;
    const n = swipe ? 1 : perf.low ? 1 : spec.n;
    const size = spec === WAVE ? Math.min(env.board().w, env.board().h) * 0.32 : shapeSize(zone.shape) / 2;
    const host = el('g', spec === WAVE ? { class: 'wave' } : {});
    if (spec.clip) {
      const id = clipFor(zone, 0.97);
      if (id) host.setAttribute('clip-path', `url(#${id})`);
    }
    for (let i = 0; i < n; i++) {
      // a pale ring under a coloured one, so it shows on a light skin and on a dark one
      const c = el('g', { opacity: 0 });
      const common = { cx: r1(x), cy: r1(y), r: r1(size * spec.to), fill: 'none' };
      c.append(
        el('circle', { ...common, stroke: '#ffffff', 'stroke-width': spec.w + 4 }),
        el('circle', { ...common, stroke: spec.color, 'stroke-width': spec.w }),
      );
      c.style.transformBox = 'fill-box';
      c.style.transformOrigin = 'center';
      host.append(c);
      const from = spec.from / spec.to;
      c.animate(
        [
          { transform: `scale(${r1(from)})`, opacity: 0.45 + 0.5 * vel },
          { transform: 'scale(1)', opacity: 0 },
        ],
        { duration: spec.ms, delay: i * spec.gap, easing: 'cubic-bezier(.15,.6,.3,1)', fill: 'both' },
      );
    }
    trim(layer, 18);
    layer.append(host);
    env.later(() => host.remove(), spec.ms + n * spec.gap + 60);
  }

  function trim(g: Element, max: number): void {
    while (g.childElementCount > max) g.firstElementChild?.remove();
  }

  function wobble(zoneId: string, m: Motion, vel: number, k: number): void {
    const v = clamp(0.45 + vel * 0.7, 0.3, 1.1) * k * ZONE_AMP;
    env.zoneEls(zoneId).forEach((e, i) => {
      ani(
        e,
        wobbleFrames((u) => m.make(u, v, i), m.cycles, m.decay, 22, m.swing || m.origin ? 0 : Math.PI / 2),
        { duration: m.dur, easing: 'linear' },
      );
    });
  }

  function hit(zone: Zone, x: number, y: number, vel: number, opts: HitOptions = {}): void {
    if (dead) return;
    const board = env.board();
    const swipe = !!opts.swipe;
    const sink = sinkFor(board, zone);
    if (sink) press(zone.id);
    else {
      const m = motionFor(board, zone);
      if (m) {
        wobble(zone.id, m, vel, 1);
        for (const a of m.along ?? []) {
          const other = board.zones.find((q) => q.id === a.id);
          const om = (other && motionFor(board, other)) || m;
          env.later(() => wobble(a.id, om, vel, a.k), a.delay);
        }
      }
    }
    const rg = ringsFor(board, zone);
    if (rg) rings(zone, rg, x, y, vel, swipe);
    body(zone, vel, swipe);
    if (zone.role !== 'blow') burst(x, y, vel, swipe);
    if (!swipe) buzz(vel);
    if (board.family === 'harp') {
      const idx = stringOfZone.get(zone.id);
      if (idx !== undefined) pluck(idx, vel, { x, y });
    }
    if (sink?.glow) glowZone(zone);
    if (board.family === 'panflute' || (board.family === 'tube' && zone.role !== 'blow')) {
      const c = shapeCenter(zone.shape);
      if (board.family === 'panflute') note(c.x, (zone.shape.t === 'rect' ? zone.shape.y : c.y) + 6, 0, -1);
      else if (!swipe) note(c.x, c.y, board.portrait ? 1 : 0, board.portrait ? 0 : -1);
    }
  }

  /** The whole drawing squashes / shakes / hums; one animation, restarted by the next touch. */
  function body(zone: Zone, vel: number, swipe: boolean): void {
    const svg = env.svg();
    const board = env.board();
    const m = bodyFor(board, zone);
    if (!svg || !m) return;
    const now = performance.now();
    if (now - lastBody < (swipe ? 120 : 40)) return;
    lastBody = now;
    const v = clamp(0.5 + vel * 0.7, 0.35, 1.2) * (swipe ? 0.6 : 1);
    svg.style.transformOrigin = m.origin ?? '50% 60%';
    ani(svg, wobbleFrames((u) => m.make(u, v, 0), m.cycles, m.decay, 22, m.swing ? 0 : Math.PI / 2), { duration: m.dur, easing: 'linear' });
  }

  /** A few sparks and a note fly out of the spot touched. */
  function burst(x: number, y: number, vel: number, swipe: boolean): void {
    if (!burstG || !canAnimate || reducedMotion()) return;
    if (swipe && perf.low) return;
    const n = swipe ? 1 : perf.low ? 2 : 4;
    const g = el('g', { transform: `translate(${r1(x)} ${r1(y)})` });
    for (let i = 0; i < n; i++) {
      const inner = el('g');
      const color = NOTE_COLORS[breathN++ % NOTE_COLORS.length]!;
      if (i === 0) inner.innerHTML = `<g transform="scale(.8)">${noteGlyph(color)}</g>`;
      else inner.innerHTML = `<circle r="${r1(3.5 + Math.random() * 2.5)}" fill="#fffbeb" stroke="${color}" stroke-width="2"/>`;
      g.append(inner);
      const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.8 + (Math.random() - 0.5) * 0.4;
      const dist = 46 + 64 * vel + Math.random() * 22;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      inner.animate(
        [
          { transform: 'translate(0px,0px) scale(.4)', opacity: 0, offset: 0 },
          { transform: `translate(${r1(dx * 0.4)}px,${r1(dy * 0.4)}px) scale(1.1)`, opacity: 1, offset: 0.22 },
          { transform: `translate(${r1(dx)}px,${r1(dy)}px) scale(.8)`, opacity: 0, offset: 1 },
        ],
        { duration: 760, easing: 'ease-out', fill: 'both' },
      );
    }
    burstG.append(g);
    trim(burstG, 4);
    env.later(() => g.remove(), 820);
  }

  /** A short buzz where the device has one (some Android phones); nothing depends on it. */
  function buzz(vel: number): void {
    const now = performance.now();
    if (now - lastBuzz < 60) return;
    lastBuzz = now;
    try {
      navigator.vibrate?.(Math.round(6 + vel * 10));
    } catch {
      /* no vibration motor */
    }
  }

  function mallet(x: number, y: number): void {
    if (!layer || !canAnimate || reducedMotion() || perf.low) return;
    const g = el('g', { transform: `translate(${r1(x)} ${r1(y)})` });
    const inner = el('g');
    inner.innerHTML =
      '<line x1="0" y1="0" x2="46" y2="-70" stroke="#92400e" stroke-width="7" stroke-linecap="round"/><circle cx="0" cy="0" r="12" fill="#f97316" stroke="#7c2d12" stroke-width="3"/>';
    g.append(inner);
    layer.append(g);
    trim(layer, 18);
    inner.animate(
      [
        { transform: 'translate(22px,-34px) rotate(16deg)', opacity: 0, offset: 0 },
        { transform: 'translate(0px,0px) rotate(0deg)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-4px,-8px) rotate(0deg)', opacity: 0, offset: 1 },
      ],
      { duration: 420, easing: 'ease-out', fill: 'both' },
    );
    env.later(() => g.remove(), 460);
  }

  function glowZone(zone: Zone): void {
    if (!layer || !canAnimate || reducedMotion() || perf.low) return;
    const g = shapeNode(zone.shape, 0.9);
    g.setAttribute('fill', '#ffffff');
    g.setAttribute('opacity', '0');
    layer.append(g);
    trim(layer, 18);
    fly(g, [{ opacity: 0.6 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
  }

  function press(zoneId: string): void {
    pressedAt.set(zoneId, performance.now());
    for (const e of env.zoneEls(zoneId)) e.classList.add('down');
  }

  function release(zoneId: string): void {
    const t0 = pressedAt.get(zoneId);
    if (t0 === undefined) return;
    // a very quick tap still shows its press
    const wait = Math.max(0, 90 - (performance.now() - t0));
    const done = (): void => {
      pressedAt.delete(zoneId);
      for (const e of env.zoneEls(zoneId)) e.classList.remove('down');
    };
    if (wait > 0) env.later(done, wait);
    else done();
  }

  // ---- strings ----

  function pluck(idx: number, vel: number, at?: { x: number; y: number }): void {
    const s = strings.get(idx);
    if (!s || dead || reducedMotion()) return;
    const pos = at ? alongSegment(s.x1, s.y1, s.x2, s.y2, at.x, at.y) : 0.5;
    pluckString(s.st, s.maxAmp * (0.4 + 0.6 * clamp(vel, 0, 1)), pos);
    s.active = true;
    // the body of the instrument hums with the string, and a spark leaves the spot plucked
    const z = { id: 'string' } as Zone;
    body(z, vel, false);
    const now = performance.now();
    if (at && now - lastBurst > 90) {
      lastBurst = now;
      burst(at.x, at.y, vel, false);
      buzz(vel);
    }
  }

  function sweep(from: number, to: number, gap: number): void {
    // a thin pick-shaped streak that crosses the strings in the time they take to sound
    if (!layer || !canAnimate || reducedMotion()) return;
    const a = strings.get(from);
    const b = strings.get(to);
    if (!a || !b) return;
    const mx = (s: Str): number => (s.x1 + s.x2) / 2;
    const my = (s: Str): number => (s.y1 + s.y2) / 2;
    const line = el('line', {
      x1: r1(mx(a)),
      y1: r1(my(a)),
      x2: r1(mx(b)),
      y2: r1(my(b)),
      stroke: '#fffbeb',
      'stroke-width': 10,
      'stroke-linecap': 'round',
      opacity: 0,
    });
    const dist = Math.hypot(mx(b) - mx(a), my(b) - my(a)) || 1;
    line.setAttribute('stroke-dasharray', `${r1(dist * 0.35)} ${r1(dist * 2)}`);
    layer.append(line);
    trim(layer, 18);
    const ms = Math.abs(to - from) * gap + 140;
    fly(
      line,
      [
        { strokeDashoffset: `${r1(dist * 0.35)}`, opacity: 0.85 },
        { strokeDashoffset: `${-r1(dist * 0.9)}`, opacity: 0 },
      ],
      { duration: ms, easing: 'ease-out' },
    );
  }

  function writeString(s: Str): void {
    const offset = (u: number): number => stringOffset(s.st, u);
    const d = stringPath(s.x1, s.y1, s.x2, s.y2, offset, 18);
    s.path.setAttribute('d', d);
    const env_ = Math.max(s.st.amp * Math.exp(-s.st.age / s.st.ring), s.st.bow);
    if (perf.low) return;
    if (!s.glow && glows) {
      const f = env.board().family;
      s.glow = el('path', {
        fill: 'none',
        stroke: f === 'harp' ? '#ec4899' : f === 'bow' ? '#fbbf24' : '#f59e0b',
        'stroke-linecap': 'round',
        opacity: 0,
      });
      glows.append(s.glow);
    }
    if (s.glow) {
      s.glow.setAttribute('d', d);
      s.glow.setAttribute('stroke-width', String(r1(Number(s.path.getAttribute('stroke-width') ?? 3) * 3.2)));
      s.glow.setAttribute('opacity', String(r1(clamp(env_ / s.maxAmp, 0, 1) * 0.28 * 100) / 100));
    }
  }

  function settleString(s: Str): void {
    s.path.setAttribute('d', `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`);
    s.glow?.setAttribute('opacity', '0');
    s.active = false;
  }

  // ---- trails ----

  function trailMove(id: number, x: number, y: number): void {
    if (!trailG || dead) return;
    let t = trails.get(id);
    if (!t || !t.live) {
      const spec = TRAILS[env.board().family] ?? TRAIL_DEFAULT;
      const g = el('g');
      const outer = el('path', { fill: spec.outer, opacity: perf.low ? 0 : 0.32 });
      const inner = el('path', { fill: spec.inner, opacity: 0.85 });
      const head = spec.head
        ? el('circle', { r: spec.w * 0.42, fill: spec.inner, stroke: spec.outer, 'stroke-width': 2, opacity: 0.9 })
        : null;
      g.append(outer, inner);
      if (head) g.append(head);
      trailG.append(g);
      t = { id, spec, g, outer, inner, head, pts: [], hx: x, hy: y, tx: x, ty: y, started: false, live: true };
      trails.set(id, t);
    }
    t.tx = x;
    t.ty = y;
  }

  function trailEnd(id: number): void {
    const t = trails.get(id);
    if (t) t.live = false;
  }

  function tickTrail(t: Trail, now: number, dt: number): boolean {
    if (t.live) {
      if (!t.started) {
        t.hx = t.tx;
        t.hy = t.ty;
        t.started = true;
      } else {
        const k = easeK(dt, 26);
        t.hx += (t.tx - t.hx) * k;
        t.hy += (t.ty - t.hy) * k;
      }
      const last = t.pts[t.pts.length - 1];
      if (!last || Math.hypot(t.hx - last.x, t.hy - last.y) >= 2.2) t.pts.push({ x: t.hx, y: t.hy, t: now });
    }
    const life = perf.low ? t.spec.life * 0.6 : t.spec.life;
    while (t.pts.length && now - t.pts[0]!.t > life) t.pts.shift();
    if (!t.live && t.pts.length < 2) return false;
    const pts = t.live ? [...t.pts, { x: t.hx, y: t.hy, t: now }] : t.pts;
    t.inner.setAttribute('d', ribbonPath(pts, now, t.spec.w * 0.5, life));
    if (!perf.low) t.outer.setAttribute('d', ribbonPath(pts, now, t.spec.w, life));
    if (t.head) {
      t.head.setAttribute('cx', String(r1(t.hx)));
      t.head.setAttribute('cy', String(r1(t.hy)));
      t.head.setAttribute('opacity', t.live ? '0.9' : '0');
    }
    return true;
  }

  // ---- the bow ----

  function makeBow(): SVGGElement {
    const board = env.board();
    const V = board.portrait ? board.w : board.h;
    const L = clamp(V * 0.8, 140, 380);
    const g = el('g', { opacity: 0.4 });
    // shadow on the strings, the stick (tapering to the tip) with its frog, and the hair that touches the string
    const inner = el('g', { transform: `rotate(${board.portrait ? 7 : 97})` });
    const tip = -L / 2;
    const frog = L / 2;
    inner.innerHTML =
      `<line x1="${tip + 8}" y1="11" x2="${frog - 14}" y2="12" stroke="rgba(0,0,0,.2)" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M${tip} -11 L${frog - 34} -16.5 L${frog - 34} -7.5 L${tip} -9 Z" fill="#b45309" stroke="#431407" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M${tip + 6} -10.6 L${frog - 36} -14.5" stroke="rgba(255,255,255,.4)" stroke-width="1.6" stroke-linecap="round"/>` +
      `<rect x="${frog - 40}" y="-20" width="40" height="18" rx="5" fill="#1c1917" stroke="#44403c" stroke-width="1.4"/>` +
      `<rect x="${frog - 34}" y="-17" width="6" height="12" rx="2" fill="#e7e5e4"/>` +
      `<line x1="${tip + 8}" y1="0" x2="${frog - 40}" y2="0" stroke="#fffbeb" stroke-width="6" stroke-linecap="round"/>` +
      `<line x1="${tip + 8}" y1="2.4" x2="${frog - 40}" y2="2.4" stroke="#d6c9a6" stroke-width="1.6" stroke-linecap="round"/>`;
    g.append(inner);
    return g;
  }

  function bowMove(id: number, x: number, y: number): void {
    if (!bowG || dead) return;
    let b = bows.get(id);
    if (!b) {
      const g = makeBow();
      bowG.append(g);
      b = { id, g, x, y, tx: x, ty: y, a: 0.4, live: true, speed: 0, lastDust: 0 };
      bows.set(id, b);
    }
    b.live = true;
    b.tx = x;
    b.ty = y;
  }

  function bowEnd(id: number): void {
    const b = bows.get(id);
    if (b) b.live = false;
  }

  function tickBow(b: Bow, now: number, dt: number): boolean {
    const board = env.board();
    const px = b.x;
    const py = b.y;
    const k = easeK(dt, 34);
    b.x += (b.tx - b.x) * k;
    b.y += (b.ty - b.y) * k;
    const inst = dt > 0 ? Math.hypot(b.x - px, b.y - py) / dt : 0;
    b.speed += (inst - b.speed) * easeK(dt, 90);
    b.a += ((b.live ? 1 : 0) - b.a) * easeK(dt, b.live ? 60 : 110);
    b.g.setAttribute('transform', `translate(${r1(b.x)} ${r1(b.y)})`);
    b.g.setAttribute('opacity', String(Math.round(b.a * 100) / 100));
    // the string under the hair sings while the bow moves on it
    const V = board.portrait ? board.w : board.h;
    const n = strings.size || 4;
    const across = board.portrait ? b.x : b.y;
    const idx = clamp(Math.floor((across / V) * n), 0, n - 1);
    const strength = b.live && b.speed > 0.03 ? clamp(0.35 + b.speed * 0.8, 0.35, 1) : 0;
    for (const s of strings.values()) {
      s.st.bowTo = s.idx === idx ? s.maxAmp * 0.95 * strength : 0;
      if (s.st.bowTo > 0) s.active = true;
    }
    // a little rosin dust where the hair meets the string
    if (!perf.low && b.live && b.speed > 0.25 && now - b.lastDust > 140) {
      b.lastDust = now;
      dust(b.x, b.y);
    }
    return b.live || b.a > 0.02;
  }

  function dust(x: number, y: number): void {
    if (!layer || !canAnimate || reducedMotion()) return;
    const c = el('circle', {
      cx: r1(x + (Math.random() - 0.5) * 16),
      cy: r1(y + (Math.random() - 0.5) * 16),
      r: r1(1.4 + Math.random() * 1.4),
      fill: '#fffbeb',
      opacity: 0,
    });
    layer.append(c);
    trim(layer, 18);
    const dx = (Math.random() - 0.5) * 30;
    fly(
      c,
      [
        { transform: 'translate(0px,0px)', opacity: 0.85 },
        { transform: `translate(${r1(dx)}px,${r1(-14 - Math.random() * 16)}px)`, opacity: 0 },
      ],
      { duration: 750, easing: 'ease-out' },
    );
  }

  // ---- wind ----

  function noteGlyph(color: string): string {
    return `<ellipse cx="0" cy="0" rx="7" ry="5" transform="rotate(-22)" fill="${color}" stroke="rgba(0,0,0,.25)" stroke-width="1.2"/><path d="M6 -2 V-24 q1 7 9 9" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
  }
  const NOTE_COLORS = ['#ef4444', '#3b82f6', '#16a34a', '#a855f7', '#f97316'];

  function note(x: number, y: number, sx: number, sy: number): void {
    if (!layer || !canAnimate || reducedMotion()) return;
    const g = el('g', { opacity: 0 });
    g.setAttribute('transform', `translate(${r1(x)} ${r1(y)})`);
    const inner = el('g');
    inner.innerHTML = noteGlyph(NOTE_COLORS[breathN++ % NOTE_COLORS.length]!);
    g.append(inner);
    layer.append(g);
    trim(layer, 18);
    const drift = 70 + Math.random() * 40;
    const side = (Math.random() - 0.5) * 36;
    const dx = sx * drift + (sx === 0 ? side : 0);
    const dy = sy * drift + (sy === 0 ? side : 0);
    g.removeAttribute('opacity');
    fly(
      inner,
      [
        { transform: 'translate(0px,0px) scale(.5) rotate(-8deg)', opacity: 0, offset: 0 },
        { transform: `translate(${r1(dx * 0.35)}px,${r1(dy * 0.35)}px) scale(1) rotate(6deg)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${r1(dx * 0.7)}px,${r1(dy * 0.7)}px) scale(1.05) rotate(-6deg)`, opacity: 0.9, offset: 0.65 },
        { transform: `translate(${r1(dx)}px,${r1(dy)}px) scale(.9) rotate(8deg)`, opacity: 0, offset: 1 },
      ],
      { duration: 1500, easing: 'ease-out' },
    );
    env.later(() => g.remove(), 1600);
  }

  function puff(x: number, y: number, ux: number, uy: number): void {
    if (!layer || !canAnimate || reducedMotion()) return;
    const ang = (Math.atan2(uy, ux) * 180) / Math.PI;
    const g = el('g', { transform: `translate(${r1(x)} ${r1(y)}) rotate(${r1(ang)})`, opacity: 0.9 });
    const p = el('path', {
      d: 'M0 -13 Q9 0 0 13',
      fill: 'none',
      stroke: '#ffffff',
      'stroke-width': 4,
      'stroke-linecap': 'round',
      opacity: 0,
    });
    g.append(p);
    layer.append(g);
    trim(layer, 18);
    fly(
      p,
      [
        { transform: 'translate(0px,0px)', opacity: 0.9 },
        { transform: 'translate(46px,0px)', opacity: 0 },
      ],
      { duration: 650, easing: 'ease-out' },
    );
    env.later(() => g.remove(), 700);
  }

  function breath(on: boolean): void {
    if (breathTimer) clearInterval(breathTimer);
    breathTimer = null;
    if (!on || dead) return;
    const board = env.board();
    const blow = board.zones.find((z) => z.role === 'blow');
    if (!blow) return;
    const c = shapeCenter(blow.shape);
    const ux = board.portrait ? 0 : 1;
    const uy = board.portrait ? 1 : 0;
    const tube = board.zones.filter((z) => z.role === 'hole');
    const emit = (): void => {
      puff(c.x + ux * 52, c.y + uy * 52, ux, uy);
      const z = tube[Math.floor(Math.random() * tube.length)];
      const at = z ? shapeCenter(z.shape) : c;
      note(at.x, at.y, board.portrait ? 1 : 0.25, board.portrait ? -0.3 : -1);
    };
    emit();
    breathTimer = setInterval(emit, perf.low ? 900 : 520);
  }

  // ---- the frame ----

  function tick(now: number, dt: number): void {
    if (dead) return;
    if (strings.size) {
      for (const s of strings.values()) {
        if (!s.active) continue;
        if (stepString(s.st, dt)) writeString(s);
        else settleString(s);
      }
    }
    if (trails.size) {
      for (const [id, t] of trails) {
        if (!tickTrail(t, now, dt)) {
          t.g.remove();
          trails.delete(id);
        }
      }
    }
    if (bows.size) {
      for (const [id, b] of bows) {
        if (!tickBow(b, now, dt)) {
          b.g.remove();
          bows.delete(id);
        }
      }
    }
  }

  function destroy(): void {
    dead = true;
    if (breathTimer) clearInterval(breathTimer);
    breathTimer = null;
    trails.clear();
    bows.clear();
    strings.clear();
  }

  return { rebuild, hit, mallet, press, release, pluck, sweep, trailMove, trailEnd, bowMove, bowEnd, breath, tick, destroy };
}

/** Does this family draw its own finger trail while a finger slides? */
export function hasTrail(board: Board): boolean {
  if (board.family === 'bow') return false;
  return board.glide || !!board.strum;
}

/** Does a finger rest on this zone as a pressed key / hole / string position (so it shows as held until the finger leaves)? */
export function holdsPress(board: Board, zone: Zone): boolean {
  return zone.role === 'bow' || sinkFor(board, zone) !== null;
}
