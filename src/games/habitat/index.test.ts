import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import { writeJson } from '../../core/save';
import { BOOK } from './catalog';
import { defaultSave, BRIDGE_KEY, LEGACY_BOX_KEY, LEGACY_TANK_KEY, SAVE_KEY, WORLD_KEY, type HabitatSave } from './save';
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

const ptr = (type: string, x = 0, y = 0): PointerEvent => new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, cancelable: true });

/** jsdom has no canvas backend: a stand-in that keeps what is written and does nothing else. */
function fake2d(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'getImageData') return (_x: number, _y: number, w: number, hgt: number) => ({ data: new Uint8ClampedArray(w * hgt * 4), width: w, height: hgt });
      if (prop === 'createImageData') return (w: number, hgt: number) => ({ data: new Uint8ClampedArray(w * hgt * 4), width: w, height: hgt });
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

const SETTLE = 300;

function readBook(): HabitatSave {
  return JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') as HabitatSave;
}

/** A child who has already earned everything, so every world is open. */
function richSave(over: Partial<HabitatSave> = {}): HabitatSave {
  const s = defaultSave();
  s.stars = 6;
  s.worlds = ['fresh', 'pond', 'sea', 'forest'];
  s.owned = BOOK.map((k) => k.key);
  s.decor = ['plant', 'weed', 'boulder', 'anemone', 'castle', 'chest', 'arch', 'hoop'];
  s.imported = true;
  return { ...s, ...over };
}

describe('habitat game', () => {
  let ctx: FakeContext;

  beforeEach(() => {
    localStorage.clear();
    // `performance` too: a tap ignores a second press within 120 ms of the first.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    driveFrames();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fake2d());
  });
  afterEach(() => {
    ctx?.cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  /** Start the game and give the world on screen a size so it builds. */
  function mount(): void {
    ctx = fakeContext();
    game.start(ctx);
    for (const el of ctx.stage.querySelectorAll<HTMLElement>('.aquarium, .terrarium, .fishing')) size(el, 420, 760);
    vi.advanceTimersByTime(100);
  }
  const q = <T extends Element = HTMLElement>(sel: string): T => ctx.stage.querySelector<T>(sel)!;
  const press = (el: Element): void => {
    el.dispatchEvent(ptr('pointerdown', 10, 10));
    el.dispatchEvent(ptr('pointerup', 10, 10));
  };
  /** Press a tile in a panel that has just opened. */
  const choose = (sel: string): void => {
    vi.advanceTimersByTime(SETTLE);
    const tile = q(sel);
    expect(tile, sel).not.toBeNull();
    tile.dispatchEvent(ptr('pointerup'));
  };
  const goTo = (world: string): void => {
    press(q('.hb-world-btn'));
    choose(`[data-world="${world}"]`);
    for (const el of ctx.stage.querySelectorAll<HTMLElement>('.aquarium, .terrarium, .fishing')) size(el, 420, 760);
    vi.advanceTimersByTime(100);
  };

  it('opens on the fresh-water tank with the same five buttons, three errands and a book', () => {
    mount();
    expect(q('.aquarium')).not.toBeNull();
    const tools = [...ctx.stage.querySelectorAll<HTMLElement>('.hb-tool')].map((b) => b.dataset.tool);
    expect(tools).toEqual(['add', 'decor', 'feed', 'night', 'special']);
    // Pictures, not words: every button has a name for screen readers and an emoji for the child.
    for (const b of ctx.stage.querySelectorAll<HTMLElement>('.hb-btn')) {
      expect(b.getAttribute('aria-label') ?? '').not.toBe('');
      expect(b.textContent ?? '').not.toMatch(/[a-zA-Z]{3,}/);
    }
    expect(ctx.stage.querySelectorAll('.hb-chip').length).toBe(3);
    expect(q('.hb-badge').textContent).toBe('2/25');
    expect(ctx.stage.querySelector('.hb-egg')?.hasAttribute('hidden')).toBe(true);
  });

  it('puts the older games\' saves in without touching them', () => {
    const tank = JSON.stringify({ v: 1, fish: ['koi', 'ray'], decor: [], plants: [] });
    const box = JSON.stringify({ v: 1, pets: ['gecko'], decor: [], plants: [] });
    localStorage.setItem(LEGACY_TANK_KEY, tank);
    localStorage.setItem(LEGACY_BOX_KEY, box);
    mount();
    expect(localStorage.getItem(LEGACY_TANK_KEY)).toBe(tank);
    expect(localStorage.getItem(LEGACY_BOX_KEY)).toBe(box);
    expect(localStorage.getItem(WORLD_KEY.fresh)).toBe(tank);
    const book = readBook();
    expect(book.owned).toEqual(expect.arrayContaining(['aq:koi', 'aq:ray', 'tr:gecko']));
    expect(book.worlds).toContain('forest');
    // Playing in the new game writes to its own keys only.
    press(q('.hb-tool-night'));
    expect(localStorage.getItem(LEGACY_TANK_KEY)).toBe(tank);
    expect(JSON.parse(localStorage.getItem(WORLD_KEY.fresh)!).night).toBe(true);
  });

  it('keeps a world shut until it is earned', () => {
    mount();
    press(q('.hb-world-btn'));
    choose('[data-world="sea"]');
    expect(q('.hb-world-overlay')).not.toBeNull();
    expect(q('.aquarium.hb-water-fresh')).not.toBeNull();
    expect(ctx.spoken.at(-1)).toMatch(/nhiệm vụ/);
  });

  it('moves between all four worlds with the same buttons', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(richSave()));
    mount();
    goTo('sea');
    expect(q('.aquarium.hb-water-sea')).not.toBeNull();
    expect(readBook().world).toBe('sea');
    goTo('forest');
    expect(q('.terrarium')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.hb-tool').length).toBe(5);
    expect(q('.hb-forest')).not.toBeNull();
    goTo('pond');
    expect(q('.fishing')).not.toBeNull();
    // At the pond the way back is the only button of ours.
    expect(q('.hb-back').hasAttribute('hidden')).toBe(false);
    expect(q('.hud, .hb-hud').classList.contains('hb-pond')).toBe(true);
    // The pond is not a home: the child comes back to the one they left.
    expect(readBook().world).toBe('forest');
    press(q('.hb-back'));
    expect(q('.terrarium')).not.toBeNull();
    expect(q('.fishing')).toBeNull();
  });

  it('leaves nothing of an old world behind when it changes, and the old games\' keys are free again', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(richSave()));
    mount();
    goTo('forest');
    goTo('sea');
    expect(ctx.stage.querySelectorAll('.terrarium').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.aquarium').length).toBe(1);
    ctx.cleanup();
    // After leaving, the old tank key reads as itself again: the old game is untouched.
    localStorage.setItem(LEGACY_TANK_KEY, 'old');
    expect(localStorage.getItem(LEGACY_TANK_KEY)).toBe('old');
  });

  it('counts feeding towards an errand and an egg, which hatches a new friend', () => {
    mount();
    const before = readBook().owned.length;
    for (let i = 0; i < 4; i++) {
      press(q('.hb-tool-feed'));
      vi.advanceTimersByTime(700);
    }
    const book = readBook();
    expect(book.egg).toBe(true);
    expect(q('.hb-egg').hasAttribute('hidden')).toBe(false);
    press(q('.hb-egg'));
    vi.advanceTimersByTime(1500);
    const after = readBook();
    expect(after.egg).toBe(false);
    expect(after.hatched).toBe(1);
    expect(after.owned.length).toBeGreaterThan(before);
    // The newcomer is shown and named once the errand's gift (which came first) has had its turn.
    vi.advanceTimersByTime(6000);
    expect(ctx.stage.querySelector('.hb-reveal')).not.toBeNull();
    expect(ctx.spoken.some((t) => /Trứng nở/.test(t))).toBe(true);
  });

  it('turns an errand into a star, a gift and a new errand', () => {
    const s = defaultSave();
    s.imported = true;
    s.quests.active = [
      { id: 'night1', got: 0 },
      { id: 'feed3', got: 0 },
      { id: 'add2', got: 0 },
    ];
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    mount();
    press(q('.hb-tool-night'));
    vi.advanceTimersByTime(600);
    expect(ctx.stars).toBe(1);
    const book = readBook();
    expect(book.stars).toBe(1);
    expect(book.quests.done).toBe(1);
    expect(book.quests.active.some((a) => a.id === 'night1')).toBe(false);
    expect(book.quests.active.length).toBe(3);
    vi.advanceTimersByTime(2000);
    // Something new in the book or on the shelf, and shown to the child.
    expect(ctx.stage.querySelector('.hb-reveal')).not.toBeNull();
  });

  it('lets a friend in from the book, only from this world, and shows the rest as shapes', () => {
    mount();
    press(q('.hb-tool-add'));
    vi.advanceTimersByTime(SETTLE);
    const tiles = ctx.stage.querySelectorAll('.hb-tile');
    expect(tiles.length).toBe(5); // the five fresh-water fish, nobody from the sea
    expect(ctx.stage.querySelectorAll('.hb-tile.hb-locked').length).toBe(3);
    const before = JSON.parse(localStorage.getItem(WORLD_KEY.fresh) ?? '{"fish":[]}').fish.length;
    q('.hb-tile[data-key="aq:goldfish"]').dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.hb-overlay')).toBeNull();
    const fish = JSON.parse(localStorage.getItem(WORLD_KEY.fresh)!).fish as string[];
    expect(fish.length).toBe(before + 1);
    expect(fish.filter((f) => f === 'goldfish').length).toBeGreaterThan(0);
    expect(ctx.spoken).toContain('cá vàng');
  });

  it('shows a shape, not a friend, for someone not met yet, and says so gently', () => {
    mount();
    press(q('.hb-book-btn'));
    vi.advanceTimersByTime(SETTLE);
    q('.hb-tile.hb-locked').dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.hb-overlay')).not.toBeNull();
    expect(ctx.spoken.at(-1)).toMatch(/chưa đến/);
  });

  it('adds furniture the child has opened and not the rest', () => {
    const s = richSave({ decor: ['plant', 'weed', 'boulder', 'anemone'] });
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    mount();
    press(q('.hb-tool-decor'));
    vi.advanceTimersByTime(SETTLE);
    expect(ctx.stage.querySelectorAll('.hb-decor.hb-locked').length).toBeGreaterThan(0);
    q('[data-decor="castle"]').dispatchEvent(ptr('pointerup'));
    // Still shelved: the panel stays open.
    expect(ctx.stage.querySelector('.hb-decor-overlay')).not.toBeNull();
    q('[data-decor="plant"]').dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelector('.hb-decor-overlay')).toBeNull();
    // Written into the book as an extra plant of this tank.
    vi.advanceTimersByTime(100);
    expect(readBook().extras.fresh.plants.length).toBe(1);
  });

  it('hangs a family photo on the glass and brings visitors, kept for next time', async () => {
    const s = richSave();
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    ctx = fakeContext();
    const [photo] = await ctx.photos.add([new Blob(['a'])]);
    expect(photo).toBeDefined();
    game.start(ctx);
    for (const el of ctx.stage.querySelectorAll<HTMLElement>('.aquarium')) size(el, 420, 760);
    await vi.advanceTimersByTimeAsync(100);
    press(q('.hb-tool-decor'));
    choose('[data-photo="frame"]');
    // The shared picker lists the photos; choose the only one.
    await vi.advanceTimersByTimeAsync(10);
    q('.pp-photo').dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelectorAll('.hb-frame').length).toBe(1);
    expect(readBook().photos.fresh.frames[0]?.photo).toBe(photo!.id);

    press(q('.hb-tool-decor'));
    choose('[data-photo="visitors"]');
    q('.pp-photo').dispatchEvent(ptr('pointerup'));
    expect(ctx.stage.querySelectorAll('.hb-visitor').length).toBe(1);

    press(q('.hb-tool-decor'));
    choose('[data-photo="clear"]');
    expect(ctx.stage.querySelectorAll('.hb-frame, .hb-visitor').length).toBe(0);
  });

  it('asks a grown-up for photos instead of failing when there are none', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(richSave()));
    mount();
    press(q('.hb-tool-decor'));
    choose('[data-photo="frame"]');
    expect(ctx.stage.querySelector('.hb-decor-overlay')).not.toBeNull();
    expect(ctx.spoken.at(-1)).toMatch(/ba mẹ/);
  });

  it('puts every fish landed at the pond into its own tank and the book', () => {
    const s = richSave();
    s.owned = ['aq:goldfish', 'aq:guppy'];
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    mount();
    goTo('pond');
    // The fishing game writes each catch to the aquarium's key; here that is the bridge.
    writeJson(LEGACY_TANK_KEY, { v: 1, fish: ['koi'], decor: [], plants: [] });
    let book = readBook();
    expect(book.owned).toContain('aq:koi');
    const fresh = JSON.parse(localStorage.getItem(WORLD_KEY.fresh)!).fish as string[];
    expect(fresh).toContain('koi');
    // The bridge is empty again, so the next catch is read on its own.
    expect(JSON.parse(localStorage.getItem(BRIDGE_KEY)!).fish).toEqual([]);
    // A sea fish goes to the sea tank, not this one.
    writeJson(LEGACY_TANK_KEY, { v: 1, fish: ['clown'], decor: [], plants: [] });
    book = readBook();
    expect(book.owned).toContain('aq:clown');
    expect(JSON.parse(localStorage.getItem(WORLD_KEY.sea)!).fish).toContain('clown');
    expect((JSON.parse(localStorage.getItem(WORLD_KEY.fresh)!).fish as string[]).includes('clown')).toBe(false);
    // The first time is shown to the child, and counts as an errand if one is open.
    vi.advanceTimersByTime(100);
    expect(ctx.stage.querySelector('.hb-reveal')).not.toBeNull();
    // Back at the tank, the catch swims in rather than being there already.
    press(q('.hb-back'));
    expect(q('.aquarium')).not.toBeNull();
  });

  it('survives being tapped everywhere at once and cleans up', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(richSave()));
    mount();
    for (let i = 0; i < 40; i++) {
      const nodes = [...ctx.stage.querySelectorAll<HTMLElement>('*')];
      const el = nodes[(i * 7919) % nodes.length]!;
      el.dispatchEvent(ptr('pointerdown', i * 9, i * 13));
      el.dispatchEvent(ptr('pointerup', i * 9, i * 13));
      vi.advanceTimersByTime(120);
    }
    expect(() => ctx.cleanup()).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
