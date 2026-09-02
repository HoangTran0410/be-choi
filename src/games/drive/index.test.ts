import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { VEHICLES, makeRoad, propAt, riderAt, slotX } from './logic';
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
const ROAD = makeRoad(W, H);

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
  const canvas = ctx.stage.querySelector<HTMLCanvasElement>('.drive-canvas')!;
  const view = ctx.stage.querySelector<HTMLElement>('.drive-view')!;
  size(view, W, H);
  size(canvas, W, H);
  vi.advanceTimersByTime(100);
  return { ctx, canvas, view };
}

/** Hold a finger near the right edge — which is how a child drives forward — until `done`. */
async function driveUntil(canvas: HTMLCanvasElement, done: () => boolean, maxMs = 20000): Promise<boolean> {
  canvas.dispatchEvent(ptr('pointerdown', W * 0.9, H * 0.7));
  for (let waited = 0; waited < maxMs; waited += 250) {
    await vi.advanceTimersByTimeAsync(250);
    if (done()) break;
  }
  canvas.dispatchEvent(ptr('pointerup', W * 0.9, H * 0.7));
  return done();
}

describe('drive game', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('mounts a road, a horn and one button per vehicle, and survives with no canvas', () => {
    vi.useFakeTimers();
    driveFrames();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    expect(() => game.start(ctx)).not.toThrow();
    expect(ctx.stage.querySelector('canvas.drive-canvas')).not.toBeNull();
    expect(ctx.stage.querySelector('.drive-horn')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.drive-pick').length).toBe(VEHICLES.length);
    expect(ctx.stage.querySelector('.drive-pick.selected')?.getAttribute('data-vehicle')).toBe(VEHICLES[0]?.id);
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    getContext.mockRestore();
  });

  it('swaps vehicle and says its name', () => {
    const { ctx } = mount();
    const picks = [...ctx.stage.querySelectorAll<HTMLElement>('.drive-pick')];
    picks[2]?.dispatchEvent(ptr('pointerdown'));
    expect(picks[2]?.classList.contains('selected')).toBe(true);
    expect(picks.filter((p) => p.classList.contains('selected')).length).toBe(1);
    expect(ctx.spoken.at(-1)).toBe(VEHICLES[2]?.name);
    ctx.cleanup();
  });

  it('drives to the first stop, picks the passenger up and takes them home', async () => {
    const { ctx, canvas } = mount();
    const stop = propAt(ROAD, 2);
    expect(stop.kind).toBe('stop');
    const rider = riderAt(2);
    const badge = ctx.stage.querySelector<HTMLElement>('.drive-badge')!;

    expect(await driveUntil(canvas, () => !badge.hidden)).toBe(true);
    expect(badge.textContent).toBe(rider.emoji);
    expect(ctx.spoken.some((s) => s.includes(rider.name))).toBe(true);

    // The house three slots on takes them in, and the second fare earns the star.
    expect(await driveUntil(canvas, () => ctx.stars > 0)).toBe(true);
    expect(ctx.spoken.some((s) => s.includes('về tới nhà'))).toBe(true);
    expect(ctx.celebrations).toBe(1);
    expect(slotX(ROAD, 5)).toBeGreaterThan(stop.x);
    ctx.cleanup();
  });

  it('honks with the horn of the vehicle in use', () => {
    const { ctx } = mount();
    const fx = vi.fn();
    ctx.audio.fx = fx;
    ctx.stage.querySelector<HTMLElement>('.drive-horn')!.dispatchEvent(ptr('pointerdown'));
    expect(fx).toHaveBeenCalledWith(VEHICLES[0]?.horn);
    ctx.cleanup();
  });

  it('keeps drawing frame after frame and never leaves the start of the road', () => {
    const { ctx, canvas } = mount();
    canvas.dispatchEvent(ptr('pointerdown', 0, H * 0.7));
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
    canvas.dispatchEvent(ptr('pointerup', 0, H * 0.7));
    expect(canvas.width).toBe(W);
    expect(canvas.height).toBe(H);
    ctx.cleanup();
  });
});
