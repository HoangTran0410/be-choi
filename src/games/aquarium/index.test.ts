import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { MAX_CREATURES, SPECIES } from './logic';
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

  /** Mount a running tank with a laid-out box. */
  function mount() {
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
    return { ctx, root, canvas };
  }

  /**
   * Find a fish by feeling around the tank: press, move a little, and see whether
   * the tank says a fish came with it. jsdom lays nothing out, so there is no
   * other way to know where anybody is.
   */
  function grabAnyFish(root: HTMLElement, canvas: HTMLCanvasElement): { x: number; y: number } | null {
    for (let y = 40; y < 720; y += 40) {
      for (let x = 30; x < 400; x += 30) {
        canvas.dispatchEvent(ptr('pointerdown', x, y));
        canvas.dispatchEvent(ptr('pointermove', x + 40, y + 10));
        if (root.classList.contains('aquarium-dragging')) return { x: x + 40, y: y + 10 };
        canvas.dispatchEvent(ptr('pointerup', x + 40, y + 10));
      }
    }
    return null;
  }

  it('offers one of every fish and puts the one that is tapped into the tank', () => {
    const { ctx } = mount();
    const chips = [...ctx.stage.querySelectorAll<HTMLElement>('.aquarium-chip')];
    expect(chips.length).toBe(SPECIES.length);
    for (const chip of chips) expect(chip.querySelector('canvas')).not.toBeNull();

    const goldfish = ctx.stage.querySelector<HTMLElement>('.aquarium-chip[data-species="goldfish"]')!;
    ctx.spoken.length = 0;
    goldfish.dispatchEvent(ptr('pointerdown'));
    expect(ctx.spoken).toContain('cá vàng');
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    ctx.cleanup();
  });

  it('will not let a child fill the tank until it stops running', () => {
    const { ctx } = mount();
    const chip = ctx.stage.querySelector<HTMLElement>('.aquarium-chip')!;
    for (let i = 0; i < MAX_CREATURES + 8; i++) chip.dispatchEvent(ptr('pointerdown'));
    expect(ctx.spoken).toContain('Bể đầy cá rồi!');
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    ctx.cleanup();
  });

  it('tells a hello from a lift, and shows the net only while a fish is held', () => {
    const { ctx, root, canvas } = mount();
    expect(root.classList.contains('aquarium-dragging')).toBe(false);

    const at = grabAnyFish(root, canvas);
    expect(at, 'no fish found to pick up').not.toBeNull();
    expect(root.classList.contains('aquarium-dragging')).toBe(true);

    // Put it back in the water: the net goes away and the fish stays in the tank.
    canvas.dispatchEvent(ptr('pointerup', at!.x, at!.y));
    expect(root.classList.contains('aquarium-dragging')).toBe(false);
    expect(ctx.spoken).not.toContain('Tạm biệt!');
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    ctx.cleanup();
  });

  it('scoops a fish out when it is dropped on the net', () => {
    const { ctx, root, canvas } = mount();
    const net = ctx.stage.querySelector<HTMLElement>('.aquarium-net')!;
    // jsdom lays nothing out, so give the net a box to be dropped on.
    vi.spyOn(net, 'getBoundingClientRect').mockReturnValue({
      x: 300, y: 20, left: 300, top: 20, right: 380, bottom: 100, width: 80, height: 80, toJSON: () => ({}),
    } as DOMRect);

    expect(grabAnyFish(root, canvas)).not.toBeNull();
    canvas.dispatchEvent(ptr('pointermove', 340, 60));
    expect(net.classList.contains('aquarium-net-over')).toBe(true);
    canvas.dispatchEvent(ptr('pointerup', 340, 60));
    expect(ctx.spoken).toContain('Tạm biệt!');
    expect(root.classList.contains('aquarium-dragging')).toBe(false);
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    ctx.cleanup();
  });

  it('reacts to a poke anywhere in the tank without ever throwing', () => {
    const { ctx, canvas } = mount();
    const tick = vi.spyOn(ctx.audio, 'tick');
    const puff = vi.spyOn(ctx.audio, 'puff');
    expect(() => {
      // Along the sand, where the plants and the ornaments are.
      for (let x = 20; x < 410; x += 25) {
        canvas.dispatchEvent(ptr('pointerdown', x, 700));
        canvas.dispatchEvent(ptr('pointerup', x, 700));
      }
      // And out in open water.
      canvas.dispatchEvent(ptr('pointerdown', 200, 200));
      canvas.dispatchEvent(ptr('pointerup', 200, 200));
      vi.advanceTimersByTime(400);
    }).not.toThrow();
    // The sand and the weeds both make a noise; something must have answered.
    expect(tick.mock.calls.length + puff.mock.calls.length).toBeGreaterThan(0);
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
