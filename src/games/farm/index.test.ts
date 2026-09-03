import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { EGGS_FOR_STAR, TAPS_FOR_STAR, makeYard, pondY, stocking } from './logic';
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
const YARD = makeYard(W, H);

function size(el: HTMLElement, w: number, hgt: number): void {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: hgt, configurable: true });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: w, bottom: hgt, width: w, height: hgt, toJSON: () => ({}) }) as DOMRect;
}

/** Frames off the fake clock, with a stamp this file owns. */
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fake2d());
  const ctx = fakeContext();
  game.start(ctx);
  const canvas = ctx.stage.querySelector<HTMLCanvasElement>('.farm-canvas')!;
  const root = ctx.stage.querySelector<HTMLElement>('.farm')!;
  size(root, W, H);
  size(canvas, W, H);
  vi.advanceTimersByTime(100);
  return { ctx, canvas, root };
}

describe('farm game', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('mounts a yard, a feed bucket and an egg basket, and survives with no canvas', () => {
    vi.useFakeTimers();
    driveFrames();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    expect(() => game.start(ctx)).not.toThrow();
    expect(ctx.stage.querySelector('canvas.farm-canvas')).not.toBeNull();
    expect(ctx.stage.querySelector('.farm-feed')).not.toBeNull();
    expect(ctx.stage.querySelector('.farm-basket')?.textContent).toBe('🧺 0');
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    getContext.mockRestore();
  });

  it('says what an animal is when it is tapped, and hands out a star for a few of them', () => {
    const { ctx, canvas } = mount();
    const names = stocking().map((s) => s.name);
    let said = 0;
    for (let attempt = 0; attempt < 400 && said < TAPS_FOR_STAR; attempt++) {
      // Sweep the yard until the finger lands on somebody.
      const x = (attempt % 20) * (W / 20);
      const y = YARD.horizon + Math.floor(attempt / 20) * ((YARD.near - YARD.horizon) / 20);
      const before = ctx.spoken.length;
      canvas.dispatchEvent(ptr('pointerdown', x, y));
      if (ctx.spoken.length > before && names.includes(ctx.spoken.at(-1) ?? '')) said++;
    }
    expect(said).toBe(TAPS_FOR_STAR);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('scatters feed and celebrates when the last grain is gone', async () => {
    const { ctx, canvas } = mount();
    ctx.stage.querySelector<HTMLElement>('.farm-feed')!.dispatchEvent(ptr('pointerdown'));
    expect(ctx.spoken.at(-1)).toBe('Cho các bạn ăn nào!');
    await vi.advanceTimersByTimeAsync(60000);
    expect(ctx.spoken).toContain('Các bạn ăn no rồi!');
    expect(ctx.stars).toBeGreaterThan(0);
    expect(canvas.width).toBe(W);
    ctx.cleanup();
  });

  it('lets the hens lay, and picks the eggs up into the basket', async () => {
    const { ctx, canvas } = mount();
    const basket = ctx.stage.querySelector<HTMLElement>('.farm-basket')!;
    // Hens lay on a timer; let the yard run until there are eggs to find.
    await vi.advanceTimersByTimeAsync(40000);
    let picked = 0;
    for (let attempt = 0; attempt < 600 && picked < EGGS_FOR_STAR; attempt++) {
      const x = (attempt % 24) * (W / 24);
      const y = YARD.horizon + Math.floor(attempt / 24) * ((YARD.near - YARD.horizon) / 24);
      const before = basket.textContent;
      canvas.dispatchEvent(ptr('pointerdown', x, y));
      if (basket.textContent !== before) picked++;
      if (attempt % 100 === 99) await vi.advanceTimersByTimeAsync(20000);
    }
    expect(picked).toBe(EGGS_FOR_STAR);
    // The star lands after ctx.celebrate() resolves, which may be the very last pick.
    await vi.advanceTimersByTimeAsync(0);
    expect(basket.textContent).toBe(`🧺 ${EGGS_FOR_STAR}`);
    expect(ctx.spoken).toContain('Quả trứng!');
    expect(ctx.stars).toBeGreaterThan(0);
    ctx.cleanup();
  });

  it('keeps the yard running frame after frame', () => {
    const { ctx, canvas } = mount();
    canvas.dispatchEvent(ptr('pointerdown', W * 0.5, pondY(YARD)));
    expect(() => vi.advanceTimersByTime(4000)).not.toThrow();
    expect(canvas.width).toBe(W);
    expect(canvas.height).toBe(H);
    ctx.cleanup();
  });
});
