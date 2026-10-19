/**
 * The shared state of one ambience scene, passed to every drawing function in
 * place of a closure: the canvas, its size, the eased level of each effect and
 * sky, the sprite caches, particle pools and the little helpers that read them.
 */
import { decorCount, decorRate, pickDpr } from '../../core/quality';
import { perf } from '../../core/frame';
import type { Sky } from './logic';
import { pick, rand, type P } from './scene-data';
import type { Rocket, Star } from './fireworks';
import type { Drawn } from './drawing';

export interface Traveller {
  x: number;
  dir: number;
  speed: number;
  y: number;
}

export interface Ctx {
  readonly g: CanvasRenderingContext2D | null;
  W: number;
  H: number;
  alive: boolean;
  time: number;
  /** Pixels per CSS pixel. */
  dpr: number;
  /** Target (0/1) and eased level of every effect, and of every sky. */
  want: Map<string, number>;
  level: Map<string, number>;
  skyWant: Record<Sky, number>;
  sky: Record<Sky, number>;
  L(id: string): number;
  U(): number;
  groundY(): number;
  wind(): number;
  emo(ch: string, size: number): HTMLCanvasElement | null;
  drawEmoji(ch: string, x: number, y: number, size: number, opts?: { rot?: number; alpha?: number; flip?: boolean; sy?: number }): void;
  glow(color: string): HTMLCanvasElement | null;
  sprites: Map<string, HTMLCanvasElement>;
  pool(id: string): P[];
  step(ps: P[], dt: number, gravity?: number): void;
  spawn(id: string, rate: number, dt: number, make: () => P): void;
  /** True once every `every` seconds (jittered) while `id` is on. */
  every(id: string, dt: number, lo: number, hi: number): boolean;
  traveller(id: string, dt: number, speed: number, y: number, dir?: number): Traveller;
  /** x positions from the left edge to the right one, always ending exactly on W. */
  across(step: number): number[];
  /** The photograph behind everything, if one was chosen, and how far it has faded in. */
  photo: HTMLImageElement | null;
  photoIn: number;
  // ---- one-off moments ----
  flash: number;
  bolt: { pts: [number, number][]; life: number } | null;
  nextBolt: number;
  hero: { emoji: string; life: number } | null;
  timers: Map<string, number>;
  // ---- per-effect scenery and state ----
  stars: { x: number; y: number; t: number }[];
  clouds: { x: number; y: number; s: number; v: number }[];
  weeds: { x: number; h: number; c: string }[];
  buildings: { x: number; w: number; h: number; lit: boolean[] }[];
  rockets: Rocket[];
  burstStars: Star[];
  flashes: { x: number; y: number; life: number; hue: number }[];
  drawings: Drawn[];
  lastBeat: number;
  lastDoodle: string | undefined;
}

export function createCtx(canvas: HTMLCanvasElement): Ctx {
  const g = canvas.getContext('2d');
  const want = new Map<string, number>();
  const level = new Map<string, number>();
  const sky: Record<Sky, number> = { night: 0, storm: 0, dawn: 0, deep: 0, space: 0, winter: 0 };
  const L = (id: string): number => level.get(id) ?? 0;
  const U = (): number => Math.min(ctx.W, ctx.H);
  const groundY = (): number => ctx.H * 0.68;
  const wind = (): number => L('wind') + L('fan') * 0.3;

  // ---- emoji, drawn once per size and reused ----
  const sprites = new Map<string, HTMLCanvasElement>();
  function emo(ch: string, size: number): HTMLCanvasElement | null {
    const s = Math.max(8, Math.round(size / 4) * 4);
    const key = `${ch}@${s}`;
    let c = sprites.get(key);
    if (!c) {
      // Drawn at the canvas's own resolution, so it is not stretched blurry onto it.
      const px = Math.max(8, Math.round(s * ctx.dpr));
      c = document.createElement('canvas');
      c.width = c.height = Math.ceil(px * 1.3);
      const cg = c.getContext('2d');
      if (!cg) return null;
      cg.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      cg.fillText(ch, c.width / 2, c.height / 2 + px * 0.05);
      sprites.set(key, c);
    }
    return c;
  }
  function drawEmoji(
    ch: string,
    x: number,
    y: number,
    size: number,
    opts: { rot?: number; alpha?: number; flip?: boolean; sy?: number } = {},
  ): void {
    const c = emo(ch, size);
    if (!c || !g) return;
    g.save();
    g.globalAlpha *= opts.alpha ?? 1;
    g.translate(x, y);
    if (opts.rot) g.rotate(opts.rot);
    g.scale(opts.flip ? -1 : 1, opts.sy ?? 1);
    const w = c.width / ctx.dpr;
    g.drawImage(c, -w / 2, -w / 2, w, w);
    g.restore();
  }

  /**
   * A soft round glow, drawn once per colour and stamped wherever it is needed. A
   * radial gradient made fresh for every firefly on every frame was the single
   * most expensive thing in the picture.
   */
  const glows = new Map<string, HTMLCanvasElement>();
  function glow(color: string): HTMLCanvasElement | null {
    let c = glows.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const cg = c.getContext('2d');
      if (!cg) return null;
      const grad = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${color},1)`);
      grad.addColorStop(0.35, `rgba(${color},0.45)`);
      grad.addColorStop(1, `rgba(${color},0)`);
      cg.fillStyle = grad;
      cg.fillRect(0, 0, 64, 64);
      glows.set(color, c);
    }
    return c;
  }

  // ---- particles, one pool per effect ----
  const pools = new Map<string, P[]>();
  const pool = (id: string) => {
    let p = pools.get(id);
    if (!p) pools.set(id, (p = []));
    return p;
  };
  function step(ps: P[], dt: number, gravity = 0): void {
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i] as P;
      p.life += dt;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.a = (p.a ?? 0) + p.spin * dt;
      if (p.life >= p.max) ps.splice(i, 1);
    }
  }
  /** Spawn at `rate` per second, scaled by how far faded in the effect is. */
  const spawnAcc = new Map<string, number>();
  function spawn(id: string, rate: number, dt: number, make: () => P): void {
    let acc = (spawnAcc.get(id) ?? 0) + decorRate(rate, perf.low) * L(id) * dt;
    const ps = pool(id);
    while (acc >= 1) {
      acc -= 1;
      if (ps.length < decorCount(600, perf.low, 60)) ps.push(make());
    }
    spawnAcc.set(id, acc);
  }

  const timers = new Map<string, number>();
  /** True once every `every` seconds (jittered) while `id` is on. */
  function every(id: string, dt: number, lo: number, hi: number): boolean {
    if (L(id) < 0.5) return false;
    const t = (timers.get(id) ?? rand(0, lo)) - dt;
    if (t > 0) {
      timers.set(id, t);
      return false;
    }
    timers.set(id, rand(lo, hi));
    return true;
  }

  // ---- things that travel across, one per effect ----
  const travellers = new Map<string, { x: number; dir: number; speed: number; y: number }>();
  function traveller(id: string, dt: number, speed: number, y: number, dir = 1): Traveller {
    let t = travellers.get(id);
    const margin = ctx.W * 0.3;
    if (!t) {
      // The first pass starts on screen: switching the whale on and waiting ten
      // seconds for it to swim in feels like nothing happened.
      t = { x: rand(0.15, 0.85) * ctx.W, dir, speed, y };
      travellers.set(id, t);
    }
    t.x += t.dir * t.speed * ctx.W * dt;
    if ((t.dir > 0 && t.x > ctx.W + margin) || (t.dir < 0 && t.x < -margin)) {
      t.dir = Math.random() < 0.5 ? 1 : -1;
      t.x = t.dir > 0 ? -margin : ctx.W + margin;
      t.y = y;
    }
    return t;
  }

  /**
   * x positions every `step` px from the left edge to the right one — always ending
   * exactly on W. A plain `x <= W; x += step` stops short whenever the width is not a
   * multiple of the step, and a filled outline drawn from it drops straight down from
   * there, cutting a notch out of the right-hand corner.
   */
  function across(step: number): number[] {
    const xs: number[] = [];
    for (let x = 0; x < ctx.W; x += step) xs.push(x);
    xs.push(ctx.W);
    return xs;
  }

  const ctx: Ctx = {
    g,
    W: 1,
    H: 1,
    alive: true,
    time: 0,
    dpr: pickDpr(window.devicePixelRatio || 1, 1.5, perf.low),
    want,
    level,
    skyWant: { night: 0, storm: 0, dawn: 0, deep: 0, space: 0, winter: 0 },
    sky,
    L,
    U,
    groundY,
    wind,
    emo,
    drawEmoji,
    glow,
    sprites,
    pool,
    step,
    spawn,
    every,
    traveller,
    across,
    photo: null,
    photoIn: 0,
    flash: 0,
    bolt: null,
    nextBolt: 2,
    hero: null,
    timers,
    stars: Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.6, t: Math.random() * 6 })),
    clouds: Array.from({ length: 7 }, (_, i) => ({
      x: Math.random(),
      y: 0.05 + (i % 4) * 0.07,
      s: rand(0.7, 1.3),
      v: rand(0.004, 0.012),
    })),
    weeds: Array.from({ length: 9 }, (_, i) => ({
      x: (i + 0.5) / 9 + rand(-0.03, 0.03),
      h: rand(0.15, 0.3),
      c: pick(['#16a34a', '#15803d', '#65a30d']),
    })),
    buildings: Array.from({ length: 14 }, (_, i) => ({
      x: i / 14,
      w: rand(0.05, 0.08),
      h: rand(0.1, 0.28),
      lit: Array.from({ length: 12 }, () => Math.random() < 0.5),
    })),
    rockets: [],
    burstStars: [],
    flashes: [],
    drawings: [],
    lastBeat: -1,
    lastDoodle: undefined,
  };
  return ctx;
}
