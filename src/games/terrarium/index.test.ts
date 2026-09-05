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
 * property keeps what was written to it, and the two calls whose return value the
 * game actually uses hand back something shaped right. That is enough to run the
 * whole draw path and catch anything that would throw in a browser.
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

/** Give the box a size: jsdom lays nothing out, so every client box is zero. */
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

describe('terrarium game', () => {
  beforeEach(() => {
    localStorage.removeItem(SAVE_KEY);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('mounts a box and its four buttons, and survives with no canvas at all', () => {
    vi.useFakeTimers();
    driveFrames();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    expect(() => game.start(ctx)).not.toThrow();
    expect(ctx.stage.querySelector('canvas.terrarium-canvas')).not.toBeNull();
    for (const cls of ['.terrarium-feed', '.terrarium-add', '.terrarium-mist', '.terrarium-lamp']) {
      expect(ctx.stage.querySelector(cls), cls).not.toBeNull();
    }
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    getContext.mockRestore();
  });

  /** Mount a running box with a laid-out client box. */
  function mount(w = 420, hgt = 760) {
    vi.useFakeTimers();
    driveFrames();
    const g = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g);
    const ctx = fakeContext();
    game.start(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.terrarium')!;
    const canvas = ctx.stage.querySelector<HTMLCanvasElement>('.terrarium-canvas')!;
    size(root, w, hgt);
    vi.advanceTimersByTime(100);
    return { ctx, root, canvas };
  }

  it('runs frames and draws the whole box once it has a size', () => {
    const { ctx, canvas } = mount();
    // The box was built from the laid-out client box, not jsdom's default 300x150.
    expect(canvas.width).toBe(420);
    expect(canvas.height).toBe(760);
    // Long enough for somebody to have got up the glass and back down again.
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    ctx.cleanup();
  });

  it('draws every animal in the game without throwing, in both directions', () => {
    const { ctx } = mount(760, 420);
    for (const s of SPECIES) addPet(ctx, s.id);
    expect(() => vi.advanceTimersByTime(30_000)).not.toThrow();
    ctx.cleanup();
  });

  /**
   * Find an animal by feeling around the box: press, move a little, and see
   * whether the box says one came with it. jsdom lays nothing out, so there is no
   * other way to know where anybody is.
   */
  function grabAnyPet(root: HTMLElement, canvas: HTMLCanvasElement): { x: number; y: number } | null {
    for (let y = 40; y < 740; y += 30) {
      for (let x = 25; x < 410; x += 25) {
        canvas.dispatchEvent(ptr('pointerdown', x, y));
        canvas.dispatchEvent(ptr('pointermove', x + 40, y + 10));
        if (root.classList.contains('terrarium-dragging')) return { x: x + 40, y: y + 10 };
        canvas.dispatchEvent(ptr('pointerup', x + 40, y + 10));
      }
    }
    return null;
  }

  /** Open the picker the way a child does: press, release, then choose. */
  function openPicker(ctx: ReturnType<typeof fakeContext>): void {
    const add = ctx.stage.querySelector<HTMLElement>('.terrarium-add')!;
    add.dispatchEvent(ptr('pointerdown'));
    add.dispatchEvent(ptr('pointerup'));
    // The panel ignores the tap that opened it; give the finger time to lift.
    vi.advanceTimersByTime(300);
  }

  function addPet(ctx: ReturnType<typeof fakeContext>, id?: string): void {
    openPicker(ctx);
    const tile = ctx.stage.querySelector<HTMLElement>(id ? `.terrarium-pick[data-species="${id}"]` : '.terrarium-pick')!;
    tile.dispatchEvent(ptr('pointerup'));
  }

  it('offers every animal behind one button, each drawn as itself', () => {
    const { ctx } = mount();
    expect(ctx.stage.querySelector('.terrarium-picker')).toBeNull();

    openPicker(ctx);
    const tiles = [...ctx.stage.querySelectorAll<HTMLElement>('.terrarium-pick')];
    expect(tiles.length).toBe(SPECIES.length);
    for (const tile of tiles) expect(tile.querySelector('canvas')).not.toBeNull();

    // A second press does not stack a second picker.
    openPicker(ctx);
    expect(ctx.stage.querySelectorAll('.terrarium-picker').length).toBe(1);

    // Choosing closes it, because the point is watching the animal walk in.
    ctx.spoken.length = 0;
    ctx.stage.querySelector<HTMLElement>('.terrarium-pick[data-species="gecko"]')!.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.terrarium-picker')).toBeNull();
    expect(ctx.spoken).toContain('con thạch sùng');
    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    ctx.cleanup();
  });

  it('says the animal, and its own voice first for the ones that have one', () => {
    const { ctx } = mount();
    const fx = vi.spyOn(ctx.audio, 'fx');
    ctx.spoken.length = 0;
    addPet(ctx, 'frog');
    // The croak plays on its own; the name follows, never over the top of it.
    expect(fx).toHaveBeenCalledWith('frog');
    expect(ctx.spoken).not.toContain('con ếch');
    vi.advanceTimersByTime(900);
    expect(ctx.spoken).toContain('con ếch');
    ctx.cleanup();
  });

  it('does not choose an animal with the same tap that opened the picker', () => {
    const { ctx } = mount();
    const add = ctx.stage.querySelector<HTMLElement>('.terrarium-add')!;
    ctx.spoken.length = 0;
    add.dispatchEvent(ptr('pointerdown'));
    add.dispatchEvent(ptr('pointerup'));
    // The release of that same tap lands on whichever tile the panel put there.
    ctx.stage.querySelector<HTMLElement>('.terrarium-pick')!.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.terrarium-picker')).not.toBeNull();
    expect(ctx.spoken).toEqual([]);
    ctx.cleanup();
  });

  it('closes the picker without adding anything, and takes it with it on the way out', () => {
    const { ctx } = mount();
    openPicker(ctx);
    ctx.spoken.length = 0;
    ctx.stage.querySelector<HTMLElement>('.terrarium-picker .pp-close')!.dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.terrarium-picker')).toBeNull();
    expect(ctx.spoken).toEqual([]);
    openPicker(ctx);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('always takes the animal the child asked for, and keeps the box runnable', () => {
    const { ctx } = mount();
    // Far more than the box can draw: it makes room rather than refusing them.
    for (let i = 0; i < MAX_CREATURES + 8; i++) addPet(ctx, 'ant');
    addPet(ctx, 'snake');
    const save = readSave(localStorage.getItem(SAVE_KEY))!;
    expect(save.pets.length).toBeLessThanOrEqual(MAX_CREATURES);
    // The odd one out survives a box full of ants.
    expect(save.pets).toContain('snake');
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    ctx.cleanup();
  });

  it('tells a hello from a lift, and shows the jar only while one is held', () => {
    const { ctx, root, canvas } = mount();
    expect(root.classList.contains('terrarium-dragging')).toBe(false);

    const at = grabAnyPet(root, canvas);
    expect(at, 'no animal found to pick up').not.toBeNull();
    expect(root.classList.contains('terrarium-dragging')).toBe(true);

    // Put it back down: the jar goes away and the animal stays in the box.
    canvas.dispatchEvent(ptr('pointerup', at!.x, at!.y));
    expect(root.classList.contains('terrarium-dragging')).toBe(false);
    expect(ctx.spoken).not.toContain('Tạm biệt!');
    expect(() => vi.advanceTimersByTime(4000)).not.toThrow();
    ctx.cleanup();
  });

  it('takes an animal out of the box when it is dropped in the jar', () => {
    const { ctx, root, canvas } = mount();
    const jar = ctx.stage.querySelector<HTMLElement>('.terrarium-jar')!;
    // jsdom lays nothing out, so give the jar a box to be dropped on.
    vi.spyOn(jar, 'getBoundingClientRect').mockReturnValue({
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

    expect(grabAnyPet(root, canvas)).not.toBeNull();
    canvas.dispatchEvent(ptr('pointermove', 340, 60));
    expect(jar.classList.contains('terrarium-jar-over')).toBe(true);
    canvas.dispatchEvent(ptr('pointerup', 340, 60));
    expect(ctx.spoken).toContain('Tạm biệt!');
    expect(root.classList.contains('terrarium-dragging')).toBe(false);
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    ctx.cleanup();
  });

  it('turns the lamp out and remembers that it did', () => {
    const { ctx } = mount();
    const lamp = ctx.stage.querySelector<HTMLElement>('.terrarium-lamp')!;
    expect(lamp.textContent).toBe('🌙');

    lamp.dispatchEvent(ptr('pointerdown'));
    expect(lamp.textContent).toBe('☀️');
    expect(ctx.spoken).toContain('Tắt đèn, ngủ ngon nhé!');
    expect(readSave(localStorage.getItem(SAVE_KEY))!.night).toBe(true);
    // After dark the night animals come out and the day ones doze; either way
    // several thousand frames of it must not throw.
    expect(() => vi.advanceTimersByTime(20_000)).not.toThrow();

    lamp.dispatchEvent(ptr('pointerdown'));
    expect(lamp.textContent).toBe('🌙');
    expect(ctx.spoken).toContain('Trời sáng rồi!');
    expect(readSave(localStorage.getItem(SAVE_KEY))!.night).toBe(false);
    ctx.cleanup();
  });

  it('opens dark if that is how the child left it', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, pets: ['gecko'], decor: [], plants: [], night: true }));
    const { ctx } = mount();
    expect(ctx.stage.querySelector('.terrarium-lamp')?.textContent).toBe('☀️');
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    ctx.cleanup();
    localStorage.removeItem(SAVE_KEY);
  });

  it('mists the glass, and only once per press', () => {
    const { ctx } = mount();
    const mist = ctx.stage.querySelector<HTMLElement>('.terrarium-mist')!;
    const puff = vi.spyOn(ctx.audio, 'puff');

    // One press held a moment too long, or a small hand bouncing on the button,
    // is one spray and not three.
    mist.dispatchEvent(ptr('pointerdown'));
    mist.dispatchEvent(ptr('pointerdown'));
    mist.dispatchEvent(ptr('pointerdown'));
    expect(puff).toHaveBeenCalledTimes(1);
    expect(ctx.spoken).toContain('Xịt nước cho mát nào!');

    vi.advanceTimersByTime(1000);
    mist.dispatchEvent(ptr('pointerdown'));
    expect(puff).toHaveBeenCalledTimes(2);
    // …but it does not say the same sentence over the top of itself.
    expect(ctx.spoken.filter((t) => t === 'Xịt nước cho mát nào!')).toHaveLength(1);
    // Wet glass is slippery for the climbers; running it dry must not throw.
    expect(() => vi.advanceTimersByTime(15_000)).not.toThrow();
    ctx.cleanup();
  });

  it('reacts to a poke anywhere in the box without ever throwing', () => {
    const { ctx, canvas } = mount();
    const tick = vi.spyOn(ctx.audio, 'tick');
    const puff = vi.spyOn(ctx.audio, 'puff');
    const pop = vi.spyOn(ctx.audio, 'pop');
    expect(() => {
      // Along the soil, where the planting and the ornaments are.
      for (let x = 20; x < 410; x += 25) {
        canvas.dispatchEvent(ptr('pointerdown', x, 700));
        canvas.dispatchEvent(ptr('pointerup', x, 700));
      }
      // And up in the air, where there is nothing at all.
      canvas.dispatchEvent(ptr('pointerdown', 200, 120));
      canvas.dispatchEvent(ptr('pointerup', 200, 120));
      vi.advanceTimersByTime(400);
    }).not.toThrow();
    // The soil, the planting and the ornaments all answer; something must have.
    expect(tick.mock.calls.length + puff.mock.calls.length + pop.mock.calls.length).toBeGreaterThan(0);
    ctx.cleanup();
  });

  it('slides an ornament along the soil and remembers where it was left', () => {
    const { ctx, root, canvas } = mount();

    // Feel along the soil for something that can be moved.
    let moved = false;
    for (let x = 30; x < 400 && !moved; x += 20) {
      canvas.dispatchEvent(ptr('pointerdown', x, 690));
      canvas.dispatchEvent(ptr('pointermove', x + 60, 690));
      moved = root.classList.contains('terrarium-moving');
      canvas.dispatchEvent(ptr('pointerup', x + 60, 690));
    }
    expect(moved, 'nothing on the soil could be moved').toBe(true);
    expect(root.classList.contains('terrarium-moving')).toBe(false);

    const saved = readSave(localStorage.getItem(SAVE_KEY));
    expect(saved).not.toBeNull();
    expect(saved!.decor.length + saved!.plants.length).toBeGreaterThan(0);
    ctx.cleanup();
  });

  it('opens the box the child left behind', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, pets: ['gecko', 'gecko', 'turtle'], decor: [0.5], plants: [0.5] }));
    const { ctx } = mount();
    // The saved animals are the ones in the box: adding one more makes four.
    addPet(ctx, 'snail');
    const after = readSave(localStorage.getItem(SAVE_KEY))!;
    expect(after.pets).toEqual(['gecko', 'gecko', 'turtle', 'snail']);
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
    expect(() => addPet(ctx)).not.toThrow();
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    ctx.cleanup();
    get.mockRestore();
    set.mockRestore();
  });

  it('drops more food whenever it is asked to, and earns a star once it is all gone', async () => {
    const { ctx } = mount();
    const feed = ctx.stage.querySelector<HTMLElement>('.terrarium-feed')!;
    const tick = vi.spyOn(ctx.audio, 'tick');
    const ding = vi.spyOn(ctx.audio, 'ding');

    feed.dispatchEvent(ptr('pointerdown'));
    feed.dispatchEvent(ptr('pointerdown'));
    feed.dispatchEvent(ptr('pointerdown'));
    expect(tick).toHaveBeenCalledTimes(1);
    expect(ctx.spoken).toContain('Cho các bạn ăn nào!');

    // A moment later it works again, with the last crickets still on the soil:
    // waiting for a clear box before the button does anything reads as broken.
    vi.advanceTimersByTime(700);
    feed.dispatchEvent(ptr('pointerdown'));
    expect(tick).toHaveBeenCalledTimes(2);
    expect(ctx.spoken.filter((t) => t === 'Cho các bạn ăn nào!')).toHaveLength(1);

    // Eaten or burrowed away, the helping ends — and it is one star for the lot.
    await vi.advanceTimersByTimeAsync(60_000);
    // A quiet bell, not confetti: the box is something to watch, and the child
    // presses 🐛 again and again.
    expect(ding).toHaveBeenCalled();
    expect(ctx.celebrations).toBe(0);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });
});
