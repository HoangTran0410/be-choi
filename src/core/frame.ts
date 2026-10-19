/**
 * One shared requestAnimationFrame loop for every game.
 *
 * - A single rAF drives all subscribers, so a game that adds a second animation
 *   does not add a second loop.
 * - It stops by itself while the tab is hidden and when nobody is subscribed;
 *   after a hidden spell the first frame reports `dt = 0` so nothing jumps.
 * - `startLoop(ctx, fn)` unsubscribes through `ctx.onCleanup`, so leaving the game
 *   cleans up with no bookkeeping in the game.
 * - It watches the frame rate: `perf.low` turns on when the device keeps dropping
 *   under ~40 fps and off again once it holds ~55 fps. Games may check it to draw
 *   less (fewer particles, no blur); `onPerfChange` tells them when it flips.
 */

/** Called every frame with the rAF timestamp and ms since the previous frame (0 on the first). Return `false` to stop. */
export type FrameFn = (now: number, dt: number) => void | boolean;

export interface FrameOptions {
  /** Cap on the reported `dt` in ms, so a stall is not one huge step. Default 250. */
  maxDt?: number;
  /** Run at most this many times a second (e.g. 30 for a slow ambient scene). Default: every frame. */
  maxFps?: number;
}

export interface Perf {
  /** Frames per second over the last full second (60 until measured). */
  fps: number;
  /** The device is struggling: draw less. */
  low: boolean;
}

const WINDOW_MS = 1000;
const LOW_BELOW = 40;
const OK_ABOVE = 55;
/** Windows in a row before the quality flips: one slow second is not a trend. */
const LOW_WINDOWS = 2;
const OK_WINDOWS = 3;

interface Sub {
  fn: FrameFn;
  maxDt: number;
  minGap: number;
  lastRun: number;
  alive: boolean;
}

const subs = new Set<Sub>();
const perfListeners = new Set<(low: boolean) => void>();
export const perf: Perf = { fps: 60, low: false };

let rafId = 0;
let rafFn: typeof requestAnimationFrame | null = null;
let lastNow = 0;
let winStart = 0;
let winFrames = 0;
let badWindows = 0;
let goodWindows = 0;
let watching = false;

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function resetClock(): void {
  lastNow = 0;
  winStart = 0;
  winFrames = 0;
}

function measure(now: number): void {
  if (!winStart) {
    winStart = now;
    winFrames = 0;
    return;
  }
  winFrames++;
  const span = now - winStart;
  if (span < WINDOW_MS) return;
  perf.fps = Math.round((winFrames * 1000) / span);
  winStart = now;
  winFrames = 0;
  if (perf.fps < LOW_BELOW) {
    badWindows++;
    goodWindows = 0;
  } else if (perf.fps >= OK_ABOVE) {
    goodWindows++;
    badWindows = 0;
  } else {
    badWindows = 0;
    goodWindows = 0;
  }
  const was = perf.low;
  if (!perf.low && badWindows >= LOW_WINDOWS) perf.low = true;
  else if (perf.low && goodWindows >= OK_WINDOWS) perf.low = false;
  if (perf.low !== was) {
    for (const cb of [...perfListeners]) cb(perf.low);
  }
}

function tick(now: number): void {
  rafId = 0;
  const raw = lastNow ? now - lastNow : 0;
  lastNow = now;
  measure(now);
  for (const s of [...subs]) {
    if (!s.alive) continue;
    if (s.minGap && s.lastRun && now - s.lastRun < s.minGap) continue;
    const dt = s.lastRun && s.minGap ? now - s.lastRun : raw;
    s.lastRun = now;
    let keep: void | boolean = true;
    try {
      keep = s.fn(now, Math.min(dt, s.maxDt));
    } catch (err) {
      // One game's bug must not freeze every other animation.
      console.error(err);
    }
    if (keep === false) remove(s);
  }
  schedule();
}

function schedule(): void {
  if (subs.size === 0 || hidden() || typeof requestAnimationFrame !== 'function') return;
  // A rAF that came from another stub (tests) or a cancelled one is not coming back.
  if (rafId && rafFn === requestAnimationFrame) return;
  rafFn = requestAnimationFrame;
  rafId = requestAnimationFrame(tick);
}

function halt(): void {
  if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
  rafId = 0;
}

function onVisibility(): void {
  if (hidden()) {
    halt();
  } else {
    resetClock();
    for (const s of subs) s.lastRun = 0;
    schedule();
  }
}

function remove(s: Sub): void {
  s.alive = false;
  subs.delete(s);
  if (subs.size === 0) {
    halt();
    resetClock();
    if (watching && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
      watching = false;
    }
  }
}

/** Subscribe to the shared loop. Returns an unsubscribe function (safe to call twice). */
export function onFrame(fn: FrameFn, opts: FrameOptions = {}): () => void {
  const s: Sub = {
    fn,
    maxDt: opts.maxDt ?? 250,
    minGap: opts.maxFps && opts.maxFps > 0 ? 1000 / opts.maxFps - 2 : 0,
    lastRun: 0,
    alive: true,
  };
  subs.add(s);
  if (!watching && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    watching = true;
  }
  schedule();
  return () => remove(s);
}

/** Like `onFrame`, and unsubscribes by itself when the child leaves the game. */
export function startLoop(ctx: { onCleanup(fn: () => void): void }, fn: FrameFn, opts?: FrameOptions): () => void {
  const stop = onFrame(fn, opts);
  ctx.onCleanup(stop);
  return stop;
}

/** Hear when the device starts (or stops) struggling. Returns an unsubscribe function. */
export function onPerfChange(cb: (low: boolean) => void): () => void {
  perfListeners.add(cb);
  return () => {
    perfListeners.delete(cb);
  };
}

/** Test hook: forget every subscriber and the measured frame rate. */
export function resetFrameLoop(): void {
  for (const s of [...subs]) remove(s);
  halt();
  resetClock();
  perfListeners.clear();
  perf.fps = 60;
  perf.low = false;
  badWindows = 0;
  goodWindows = 0;
}
