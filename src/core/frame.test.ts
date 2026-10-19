import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onFrame, startLoop, onPerfChange, perf, resetFrameLoop } from './frame';

/** A hand-cranked requestAnimationFrame. */
let queue: Map<number, FrameRequestCallback>;
let nextId: number;
let now: number;

function step(ms = 16): void {
  now += ms;
  const run = [...queue.entries()];
  queue.clear();
  for (const [, cb] of run) cb(now);
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  queue = new Map();
  nextId = 1;
  now = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue.delete(id);
  });
  setVisibility('visible');
});

afterEach(() => {
  resetFrameLoop();
  vi.unstubAllGlobals();
});

describe('frame loop', () => {
  it('drives many subscribers from one requestAnimationFrame', () => {
    const a = vi.fn();
    const b = vi.fn();
    onFrame(a);
    onFrame(b);
    expect(queue.size).toBe(1);
    step();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(1);
  });

  it('reports dt = 0 first, then the gap, capped by maxDt', () => {
    const dts: number[] = [];
    onFrame((_n, dt) => void dts.push(dt), { maxDt: 100 });
    step(16);
    step(16);
    step(500);
    expect(dts).toEqual([0, 16, 100]);
  });

  it('stops asking for frames when the last subscriber leaves', () => {
    const stop = onFrame(() => undefined);
    expect(queue.size).toBe(1);
    stop();
    expect(queue.size).toBe(0);
    stop(); // twice is fine
  });

  it('a callback returning false unsubscribes itself', () => {
    const fn = vi.fn(() => false as const);
    onFrame(fn);
    step();
    step();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  it('a subscriber removed mid-frame does not run that frame', () => {
    const b = vi.fn();
    let stopB = () => undefined as void;
    onFrame(() => stopB());
    stopB = onFrame(b);
    step();
    expect(b).not.toHaveBeenCalled();
  });

  it('a throwing subscriber does not stop the others', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok = vi.fn();
    onFrame(() => {
      throw new Error('boom');
    });
    onFrame(ok);
    step();
    step();
    expect(ok).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it('pauses while the tab is hidden and resumes with dt = 0', () => {
    const dts: number[] = [];
    onFrame((_n, dt) => void dts.push(dt));
    step();
    step();
    setVisibility('hidden');
    expect(queue.size).toBe(0);
    now += 60_000;
    setVisibility('visible');
    expect(queue.size).toBe(1);
    step();
    expect(dts).toEqual([0, 16, 0]);
  });

  it('does not start a frame for a subscriber added while hidden', () => {
    setVisibility('hidden');
    onFrame(() => undefined);
    expect(queue.size).toBe(0);
    setVisibility('visible');
    expect(queue.size).toBe(1);
  });

  it('startLoop cleans up through ctx.onCleanup', () => {
    const cleanups: Array<() => void> = [];
    const fn = vi.fn();
    startLoop({ onCleanup: (f) => void cleanups.push(f) }, fn);
    step();
    expect(fn).toHaveBeenCalledTimes(1);
    for (const c of cleanups) c();
    step();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  it('maxFps skips frames', () => {
    const fn = vi.fn();
    onFrame(fn, { maxFps: 30 });
    for (let i = 0; i < 6; i++) step(16);
    expect(fn.mock.calls.length).toBe(3);
  });

  it('survives a new rAF stub (a fresh test) after an old one was abandoned', () => {
    onFrame(() => undefined);
    resetFrameLoop();
    queue.clear();
    const fn = vi.fn();
    onFrame(fn);
    step();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('frame rate watch', () => {
  /** Run `seconds` of frames `gap` ms apart. */
  function run(seconds: number, gap: number): void {
    const end = now + seconds * 1000;
    while (now < end) step(gap);
  }

  it('flags low quality after two slow seconds and recovers after three good ones', () => {
    const flips: boolean[] = [];
    onPerfChange((low) => flips.push(low));
    onFrame(() => undefined);
    run(1.2, 16); // first window starts
    expect(perf.low).toBe(false);
    run(3, 50); // ~20 fps
    expect(perf.low).toBe(true);
    expect(perf.fps).toBeLessThan(40);
    run(5, 16);
    expect(perf.low).toBe(false);
    expect(flips).toEqual([true, false]);
  });

  it('one slow second is not enough', () => {
    onFrame(() => undefined);
    run(1.2, 16);
    run(1, 50);
    run(2, 16);
    expect(perf.low).toBe(false);
  });
});
