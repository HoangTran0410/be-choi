import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { HARVEST_FOR_STAR, SEEDS, WATER_STEPS } from './logic';
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

const ptr = (type: string, x = 0, y = 0): PointerEvent => new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true });

/** A canvas that records nothing and refuses nothing, so the draw path really runs. */
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

const W = 420;
const H = 620;

function size(el: HTMLElement, w: number, hgt: number): void {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: hgt, configurable: true });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: hgt, width: w, height: hgt, toJSON: () => ({}) }) as DOMRect;
}

/** Frames off the fake clock, with a stamp this file owns. */
function driveFrames(): void {
  let stamp = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: FrameRequestCallback) =>
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fake2d());
  const ctx = fakeContext();
  game.start(ctx);
  const canvas = ctx.stage.querySelector<HTMLCanvasElement>('.garden-canvas')!;
  size(canvas, W, H);
  vi.advanceTimersByTime(100);
  return { ctx, canvas };
}

/** Tap the bed nearest `at` (a fraction across the field). */
const tapBed = (canvas: HTMLCanvasElement, at: number): void => {
  canvas.dispatchEvent(ptr('pointerdown', W * at, H * 0.85));
};

describe('garden game', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('mounts a field and one button per seed, and survives with no canvas', () => {
    vi.useFakeTimers();
    driveFrames();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    expect(() => game.start(ctx)).not.toThrow();
    expect(ctx.stage.querySelector('canvas.garden-canvas')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.garden-seed').length).toBe(SEEDS.length);
    // The first seed is ready to plant without choosing anything.
    expect(ctx.stage.querySelector('.garden-seed.selected')?.getAttribute('data-seed')).toBe(SEEDS[0]?.id);
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    getContext.mockRestore();
  });

  it('moves the ring when another seed is picked', () => {
    const { ctx } = mount();
    const buttons = [...ctx.stage.querySelectorAll<HTMLElement>('.garden-seed')];
    buttons[3]?.dispatchEvent(ptr('pointerdown'));
    expect(buttons[3]?.classList.contains('selected')).toBe(true);
    expect(buttons.filter((b) => b.classList.contains('selected')).length).toBe(1);
    expect(ctx.spoken.at(-1)).toBe(SEEDS[3]?.name);
    ctx.cleanup();
  });

  it('plants, waters and picks with the same tap', () => {
    const { ctx, canvas } = mount();
    tapBed(canvas, 0.24);
    expect(ctx.spoken.at(-1)).toBe(`Trồng ${SEEDS[0]?.name}`);

    for (let i = 1; i < WATER_STEPS; i++) {
      tapBed(canvas, 0.24);
      // Watering says nothing until the plant is ready.
      expect(ctx.spoken.at(-1)).toBe(`Trồng ${SEEDS[0]?.name}`);
    }
    tapBed(canvas, 0.24);
    expect(ctx.spoken.at(-1)).toBe(SEEDS[0]?.ripe);

    tapBed(canvas, 0.24);
    expect(ctx.spoken.at(-1)).toBe(SEEDS[0]?.name);
    // Bare soil again: the next tap plants.
    tapBed(canvas, 0.24);
    expect(ctx.spoken.at(-1)).toBe(`Trồng ${SEEDS[0]?.name}`);
    ctx.cleanup();
  });

  it('celebrates every HARVEST_FOR_STAR pickings', async () => {
    const { ctx, canvas } = mount();
    const grow = (at: number): void => {
      for (let i = 0; i <= WATER_STEPS; i++) tapBed(canvas, at);
    };
    for (let n = 0; n < HARVEST_FOR_STAR; n++) {
      grow(0.24);
      expect(ctx.celebrations).toBe(0);
      tapBed(canvas, 0.24); // harvest
    }
    await vi.advanceTimersByTimeAsync(50);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('ignores a tap up in the sky', () => {
    const { ctx, canvas } = mount();
    canvas.dispatchEvent(ptr('pointerdown', W * 0.24, H * 0.02));
    expect(ctx.spoken).toEqual([]);
    ctx.cleanup();
  });

  it('keeps drawing frame after frame', () => {
    const { ctx, canvas } = mount();
    tapBed(canvas, 0.45);
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    expect(canvas.width).toBe(W);
    expect(canvas.height).toBe(H);
    ctx.cleanup();
  });
});
