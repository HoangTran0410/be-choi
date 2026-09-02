import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
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

/**
 * jsdom has no canvas backend, so stand one in: every method is a no-op, every
 * property keeps what was written to it, and the two calls whose return value
 * the game actually uses hand back something shaped right. That is enough to run
 * the whole draw path and catch anything that would throw in a browser.
 */
function fake2d(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'createImageData') {
        return (w: number, hgt: number) => ({ data: new Uint8ClampedArray(w * hgt * 4), width: w, height: hgt });
      }
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Give the tank a size: jsdom lays nothing out, so every client box is zero. */
function size(el: HTMLElement, w: number, hgt: number): void {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: hgt, configurable: true });
}

/**
 * Run the game's animation frames off the fake timer clock, with a frame stamp
 * this file owns. Whether vitest fakes rAF and `performance` varies; the
 * simulation's step size must not.
 */
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

describe('aquarium game', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('mounts a tank and a food button, and survives with no canvas at all', () => {
    vi.useFakeTimers();
    driveFrames();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    expect(() => game.start(ctx)).not.toThrow();
    const canvas = ctx.stage.querySelector('canvas.aquarium-canvas');
    const feed = ctx.stage.querySelector<HTMLElement>('.aquarium-feed');
    expect(canvas).not.toBeNull();
    expect(feed).not.toBeNull();
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    getContext.mockRestore();
  });

  it('runs frames and draws the whole tank once it has a size', () => {
    vi.useFakeTimers();
    driveFrames();
    const g = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
    const ctx = fakeContext();
    game.start(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.aquarium')!;
    const canvas = ctx.stage.querySelector<HTMLCanvasElement>('.aquarium-canvas')!;
    size(root, 420, 760);

    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    // The tank was built from the laid-out box, not left at jsdom's default 300x150.
    expect(canvas.width).toBe(420);
    expect(canvas.height).toBe(760);
    ctx.cleanup();
  });

  it('bubbles where the finger goes and never throws on a poke', () => {
    vi.useFakeTimers();
    driveFrames();
    const g = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
    const ctx = fakeContext();
    game.start(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.aquarium')!;
    const canvas = ctx.stage.querySelector<HTMLCanvasElement>('.aquarium-canvas')!;
    size(root, 420, 760);
    vi.advanceTimersByTime(100);

    expect(() => {
      canvas.dispatchEvent(ptr('pointerdown', 40, 60));
      canvas.dispatchEvent(ptr('pointermove', 80, 90));
      canvas.dispatchEvent(ptr('pointerup', 80, 90));
      vi.advanceTimersByTime(200);
    }).not.toThrow();
    ctx.cleanup();
  });

  it('feeds the fish and celebrates once every flake is gone', async () => {
    vi.useFakeTimers();
    driveFrames();
    const g = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
    const ctx = fakeContext();
    game.start(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.aquarium')!;
    size(root, 420, 760);
    vi.advanceTimersByTime(100);

    ctx.stage.querySelector<HTMLElement>('.aquarium-feed')?.dispatchEvent(ptr('pointerdown'));
    expect(ctx.spoken).toContain('Cho cá ăn nào!');
    // Flakes are eaten by the fish or land on the sand; either way the feed ends.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });
});
