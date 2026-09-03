import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { MAX_CREATURES, SAVE_KEY, SPECIES, readSave } from './logic';
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

describe('aquarium game', () => {
  beforeEach(() => {
    localStorage.removeItem(SAVE_KEY);
  });
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

  /** Open the picker the way a child does: press, release, then choose. */
  function openPicker(ctx: ReturnType<typeof fakeContext>): void {
    const add = ctx.stage.querySelector<HTMLElement>('.aquarium-add')!;
    add.dispatchEvent(ptr('pointerdown'));
    add.dispatchEvent(ptr('pointerup'));
    // The panel ignores the tap that opened it; give the finger time to lift.
    vi.advanceTimersByTime(300);
  }

  function addFish(ctx: ReturnType<typeof fakeContext>, id?: string): void {
    openPicker(ctx);
    const tile = ctx.stage.querySelector<HTMLElement>(id ? `.aquarium-pick[data-species="${id}"]` : '.aquarium-pick')!;
    tile.dispatchEvent(ptr('pointerup'));
  }

  it('does not choose a fish with the same tap that opened the picker', () => {
    const { ctx } = mount();
    const add = ctx.stage.querySelector<HTMLElement>('.aquarium-add')!;
    ctx.spoken.length = 0;
    add.dispatchEvent(ptr('pointerdown'));
    add.dispatchEvent(ptr('pointerup'));
    // The release of that same tap lands on whichever tile the panel put there.
    ctx.stage.querySelector<HTMLElement>('.aquarium-pick')!.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.aquarium-picker')).not.toBeNull();
    expect(ctx.spoken).toEqual([]);
    ctx.cleanup();
  });

  it('keeps the bottom of the tank clear, and offers every fish behind one button', () => {
    const { ctx } = mount();
    // Nothing but the two round buttons sits over the water.
    expect(ctx.stage.querySelector('.aquarium-tray')).toBeNull();
    expect(ctx.stage.querySelector('.aquarium-add')).not.toBeNull();
    expect(ctx.stage.querySelector('.aquarium-picker')).toBeNull();

    openPicker(ctx);
    const tiles = [...ctx.stage.querySelectorAll<HTMLElement>('.aquarium-pick')];
    expect(tiles.length).toBe(SPECIES.length);
    for (const tile of tiles) expect(tile.querySelector('canvas')).not.toBeNull();

    // A second press does not stack a second picker.
    openPicker(ctx);
    expect(ctx.stage.querySelectorAll('.aquarium-picker').length).toBe(1);

    // Choosing closes it, because the point is watching the fish swim in.
    ctx.spoken.length = 0;
    ctx.stage.querySelector<HTMLElement>('.aquarium-pick[data-species="goldfish"]')!.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.aquarium-picker')).toBeNull();
    expect(ctx.spoken).toContain('cá vàng');
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    ctx.cleanup();
  });

  it('closes the picker without adding anything', () => {
    const { ctx } = mount();
    openPicker(ctx);
    ctx.spoken.length = 0;
    ctx.stage.querySelector<HTMLElement>('.aquarium-picker .pp-close')!.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.aquarium-picker')).toBeNull();
    expect(ctx.spoken).toEqual([]);
    ctx.cleanup();
  });

  it('takes the picker with it when the child leaves the game', () => {
    const { ctx } = mount();
    openPicker(ctx);
    expect(ctx.stage.querySelector('.aquarium-picker')).not.toBeNull();
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('always takes the fish the child asked for, and keeps the tank runnable', () => {
    localStorage.removeItem(SAVE_KEY);
    const { ctx } = mount();
    // Far more than the tank can draw: it makes room rather than refusing them.
    for (let i = 0; i < MAX_CREATURES + 8; i++) addFish(ctx, 'goldfish');
    addFish(ctx, 'shark');
    const save = readSave(localStorage.getItem(SAVE_KEY))!;
    expect(save.fish.length).toBeLessThanOrEqual(MAX_CREATURES);
    // The odd one out survives a tank full of goldfish.
    expect(save.fish).toContain('shark');
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
      x: 300,
      y: 20,
      left: 300,
      top: 20,
      right: 380,
      bottom: 100,
      width: 80,
      height: 80,
      toJSON: () => ({}),
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

  it('turns the lights out and remembers that it did', () => {
    localStorage.removeItem(SAVE_KEY);
    const { ctx } = mount();
    const lamp = ctx.stage.querySelector<HTMLElement>('.aquarium-lamp')!;
    expect(lamp.textContent).toBe('🌙');

    lamp.dispatchEvent(ptr('pointerdown'));
    expect(lamp.textContent).toBe('☀️');
    expect(ctx.spoken).toContain('Tắt đèn, ngủ ngon nhé!');
    expect(readSave(localStorage.getItem(SAVE_KEY))!.night).toBe(true);
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();

    lamp.dispatchEvent(ptr('pointerdown'));
    expect(lamp.textContent).toBe('🌙');
    expect(ctx.spoken).toContain('Trời sáng rồi!');
    expect(readSave(localStorage.getItem(SAVE_KEY))!.night).toBe(false);
    ctx.cleanup();
  });

  it('opens dark if that is how the child left it', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, fish: ['koi'], decor: [], plants: [], night: true }));
    const { ctx } = mount();
    expect(ctx.stage.querySelector('.aquarium-lamp')?.textContent).toBe('☀️');
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    ctx.cleanup();
    localStorage.removeItem(SAVE_KEY);
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

  it('slides an ornament along the sand and remembers where it was left', () => {
    localStorage.removeItem(SAVE_KEY);
    const { ctx, root, canvas } = mount();

    // Feel along the sand for something that can be moved.
    let moved = false;
    for (let x = 30; x < 400 && !moved; x += 20) {
      canvas.dispatchEvent(ptr('pointerdown', x, 690));
      canvas.dispatchEvent(ptr('pointermove', x + 60, 690));
      if (root.classList.contains('aquarium-moving')) {
        canvas.dispatchEvent(ptr('pointerup', x + 60, 690));
        moved = true;
      } else {
        canvas.dispatchEvent(ptr('pointerup', x + 60, 690));
      }
    }
    expect(moved, 'nothing on the sand could be moved').toBe(true);
    expect(root.classList.contains('aquarium-moving')).toBe(false);

    const saved = readSave(localStorage.getItem(SAVE_KEY));
    expect(saved).not.toBeNull();
    expect(saved!.decor.length + saved!.plants.length).toBeGreaterThan(0);
    ctx.cleanup();
  });

  it('opens the tank the child left behind', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, fish: ['koi', 'koi', 'crab'], decor: [0.5], plants: [0.5] }));
    const { ctx } = mount();
    // The saved animals are the ones in the water: adding one more makes four.
    addFish(ctx, 'goldfish');
    const after = readSave(localStorage.getItem(SAVE_KEY))!;
    expect(after.fish).toEqual(['koi', 'koi', 'crab', 'goldfish']);
    ctx.cleanup();
    localStorage.removeItem(SAVE_KEY);
  });

  it('plays on when storage is not available', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { ctx } = mount();
    expect(() => addFish(ctx)).not.toThrow();
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    ctx.cleanup();
    get.mockRestore();
    set.mockRestore();
  });

  it('drops more food whenever it is asked to, and only once per press', async () => {
    vi.useFakeTimers();
    driveFrames();
    const g = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
    const ctx = fakeContext();
    game.start(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.aquarium')!;
    size(root, 420, 760);
    vi.advanceTimersByTime(100);
    const feed = ctx.stage.querySelector<HTMLElement>('.aquarium-feed')!;
    const tick = vi.spyOn(ctx.audio, 'tick');

    // One press held a moment too long, or a small hand bouncing on the button,
    // is one helping of food and not three.
    feed.dispatchEvent(ptr('pointerdown'));
    feed.dispatchEvent(ptr('pointerdown'));
    feed.dispatchEvent(ptr('pointerdown'));
    expect(tick).toHaveBeenCalledTimes(1);

    // A moment later it works again, with the last flakes still in the water:
    // waiting for a clear tank before the button does anything reads as broken.
    vi.advanceTimersByTime(700);
    feed.dispatchEvent(ptr('pointerdown'));
    expect(tick).toHaveBeenCalledTimes(2);
    // But it does not say the same sentence over the top of itself.
    expect(ctx.spoken.filter((t) => t === 'Cho cá ăn nào!')).toHaveLength(1);

    // Still one star for the tank being fed until nothing is left, not one each.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ctx.stars).toBe(1);
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
