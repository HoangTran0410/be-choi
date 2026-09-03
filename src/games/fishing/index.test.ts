import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { fakeContext } from '../../core/testing';
import { SAVE_KEY, readSave } from '../aquarium/logic';
import game from './index';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
    }
  };
}

const ptr = (type: string, x = 0, y = 0): PointerEvent =>
  new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true });

/** jsdom has no canvas backend: stand one in so the whole draw path still runs. */
function fake2d(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function size(el: HTMLElement, w: number, hgt: number): void {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: hgt, configurable: true });
}

function driveFrames(): void {
  let stamp = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => {
      stamp += 16;
      cb(stamp);
    }, 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
}

function mount() {
  vi.useFakeTimers();
  driveFrames();
  // A lake full of fish is a simulation: seed it, or the same test passes on one
  // run and fails on the next depending on where the fish happened to start.
  const dice = mulberry32(11);
  vi.spyOn(Math, 'random').mockImplementation(dice);
  const g = fake2d();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
  const ctx = fakeContext();
  game.start(ctx);
  const root = ctx.stage.querySelector<HTMLElement>('.fishing')!;
  const canvas = ctx.stage.querySelector<HTMLCanvasElement>('.fishing-canvas')!;
  size(root, 420, 760);
  vi.advanceTimersByTime(100);
  return { ctx, root, canvas };
}

/**
 * Play the game the way a patient child does: ease the bait around the water
 * until something takes it, then lift it out. Returns false if nothing bit.
 */
function fishPatiently(canvas: HTMLCanvasElement, ctx: ReturnType<typeof fakeContext>): boolean {
  const root = document.querySelector<HTMLElement>('.fishing')!;
  const reel = root.querySelector<HTMLElement>('.fishing-reel')!;
  const landedFish = (): boolean => ctx.spoken.some((line) => line.includes('về bể rồi'));

  let x = 210;
  let y = 300;
  const ease = (dx: number, dy: number): void => {
    x = Math.min(400, Math.max(25, x + dx));
    y = Math.min(600, Math.max(140, y + dy));
    canvas.dispatchEvent(ptr('pointermove', x, y));
    vi.advanceTimersByTime(40);
  };
  /** Hold the line still, which is the whole skill of the game. */
  const wait = (ms: number): void => {
    vi.advanceTimersByTime(ms);
  };

  canvas.dispatchEvent(ptr('pointerdown', x, y));
  for (let go = 0; go < 150 && !landedFish(); go++) {
    if (reel.hidden) {
      // Move a little, then let the bait settle: fish will not come to a jumpy one.
      const dir = go % 2 === 0 ? 1 : -1;
      for (let i = 0; i < 8; i++) ease(8 * dir, i % 3 === 0 ? 8 : 0);
      wait(3500);
      continue;
    }
    // Something is on the line, or the line wants casting again.
    canvas.dispatchEvent(ptr('pointerup', x, y));
    if (reel.textContent === '⬇️') {
      reel.dispatchEvent(ptr('pointerdown'));
      wait(2500);
      canvas.dispatchEvent(ptr('pointerdown', x, y));
      continue;
    }
    // Hauling is tug after tug: stop and the fish takes the line back.
    for (let heave = 0; heave < 60 && reel.textContent === '🎣'; heave++) {
      reel.dispatchEvent(ptr('pointerdown'));
      wait(300);
    }
    // The catch is held up and named before anything else can happen.
    wait(3200);
    if (landedFish()) return true;
    // A boot, or it got away. Drop the line again and carry on.
    if (!reel.hidden && reel.textContent === '⬇️') {
      reel.dispatchEvent(ptr('pointerdown'));
      wait(2500);
    }
    canvas.dispatchEvent(ptr('pointerdown', x, y));
  }
  canvas.dispatchEvent(ptr('pointerup', x, y));
  return landedFish();
}

describe('fishing game', () => {
  beforeEach(() => {
    localStorage.removeItem(SAVE_KEY);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('mounts a lake and an empty bucket, and survives with no canvas at all', () => {
    vi.useFakeTimers();
    driveFrames();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    expect(() => game.start(ctx)).not.toThrow();
    expect(ctx.stage.querySelector('.fishing-canvas')).not.toBeNull();
    expect(ctx.stage.querySelector('.fishing-tally')?.textContent).toBe('🪣 0');
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    getContext.mockRestore();
  });

  it('runs frames and fills the stage once it has a size', () => {
    const { ctx, canvas } = mount();
    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
    expect(canvas.width).toBe(420);
    expect(canvas.height).toBe(760);
    ctx.cleanup();
  });

  it('lands a fish for a patient child and sends it to the aquarium', () => {
    const { ctx, canvas } = mount();
    const bit = fishPatiently(canvas, ctx);
    expect(bit, 'nothing took the bait').toBe(true);
    vi.advanceTimersByTime(200);
    expect(ctx.stage.querySelector('.fishing-catch')).not.toBeNull();

    expect(ctx.stage.querySelector('.fishing-tally')?.textContent).toBe('🪣 1');
    expect(ctx.spoken.some((s) => s.includes('về bể rồi'))).toBe(true);

    // The catch is waiting in the tank the child keeps in Bể cá.
    const save = readSave(localStorage.getItem(SAVE_KEY));
    expect(save).not.toBeNull();
    expect(save!.fish.length).toBe(1);
    ctx.cleanup();
  });

  it('offers to drop the line again once the catch is in, and does', () => {
    const { ctx, canvas } = mount();
    expect(fishPatiently(canvas, ctx)).toBe(true);
    // The catch is held up for a look first; nothing may be cast over the top of it.
    const shown = ctx.stage.querySelector<HTMLElement>('.fishing-catch')!;
    vi.advanceTimersByTime(3200);
    expect(shown.hidden).toBe(true);

    const reel = ctx.stage.querySelector<HTMLElement>('.fishing-reel')!;
    // The line is out of the water and empty: the button now casts.
    expect(reel.hidden).toBe(false);
    expect(reel.textContent).toBe('⬇️');
    ctx.spoken.length = 0;
    reel.dispatchEvent(ptr('pointerdown'));
    expect(ctx.spoken).toContain('Thả câu nào!');
    vi.advanceTimersByTime(2000);
    // Back in the water, and the button has nothing to offer until the next bite.
    expect(reel.hidden).toBe(true);
    ctx.cleanup();
  });

  it('sends another fish in so the lake never runs out', () => {
    const { ctx, canvas } = mount();
    expect(fishPatiently(canvas, ctx)).toBe(true);
    // The replacement arrives on a timer; nothing may throw while it does.
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
    ctx.cleanup();
  });

  it('adds to a tank that already has fish in it rather than replacing it', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, fish: ['koi'], decor: [0.5], plants: [0.25] }));
    const { ctx, canvas } = mount();
    expect(fishPatiently(canvas, ctx)).toBe(true);
    vi.advanceTimersByTime(200);
    const save = readSave(localStorage.getItem(SAVE_KEY))!;
    expect(save.fish[0]).toBe('koi');
    expect(save.fish.length).toBe(2);
    // The child's furniture is left exactly where it was.
    expect(save.decor).toEqual([0.5]);
    expect(save.plants).toEqual([0.25]);
    ctx.cleanup();
  });

  it('plays on when storage is not available', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { ctx, canvas } = mount();
    expect(() => fishPatiently(canvas, ctx)).not.toThrow();
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    ctx.cleanup();
    set.mockRestore();
  });

  it('ignores the water entirely while something is on the line', () => {
    const { ctx, root, canvas } = mount();
    const reel = ctx.stage.querySelector<HTMLElement>('.fishing-reel')!;
    // Fish until something is hooked, then stop.
    canvas.dispatchEvent(ptr('pointerdown', 210, 300));
    for (let go = 0; go < 40 && reel.textContent !== '🎣'; go++) {
      for (let i = 0; i < 8; i++) {
        canvas.dispatchEvent(ptr('pointermove', 200 + i * 8, 300));
        vi.advanceTimersByTime(40);
      }
      vi.advanceTimersByTime(3500);
    }
    expect(reel.textContent, 'nothing ever took the line').toBe('🎣');
    expect(root.classList.contains('fishing-fighting')).toBe(true);

    // A hand on the glass must not take the catch off the hook.
    canvas.dispatchEvent(ptr('pointerup', 210, 300));
    canvas.dispatchEvent(ptr('pointerdown', 40, 600));
    canvas.dispatchEvent(ptr('pointermove', 380, 200));
    canvas.dispatchEvent(ptr('pointerup', 380, 200));
    vi.advanceTimersByTime(120);
    expect(reel.textContent).toBe('🎣');
    ctx.cleanup();
  });

  it('leaves no timers or frames behind', () => {
    const { ctx, canvas } = mount();
    canvas.dispatchEvent(ptr('pointerdown', 200, 300));
    canvas.dispatchEvent(ptr('pointermove', 220, 320));
    vi.advanceTimersByTime(200);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });
});
