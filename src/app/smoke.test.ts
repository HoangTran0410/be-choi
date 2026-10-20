/**
 * Smoke test over EVERY game in the registry: start it, bang on it with seeded
 * random pointer events ("bấm lung tung cũng không sao"), leave, and check that
 * nothing is left running (timers, rAF, window/document listeners).
 *
 * jsdom has no layout, so tap-target sizes cannot be measured here and are not
 * checked (they would be faked, which is worse than not checking).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, fakeMic, type FakeMic } from '../core/testing';
import { GAMES } from './registry';

// Camera games get a camera that answers with an empty <video> instead of a stream.
vi.mock('../core/camera', () => ({
  createCamera: () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { value: 640 });
    Object.defineProperty(video, 'videoHeight', { value: 480 });
    return { on: false, start: async () => video, stop: () => undefined, snapshot: async () => null };
  },
}));

/** Per-game special needs. Everything not listed runs with the defaults. */
interface Setup {
  /** Install a fake microphone before start(). */
  mic?: boolean;
}
const SETUP: Record<string, Setup> = {
  sing: { mic: true },
  parrot: { mic: true },
  birdsong: { mic: true },
  singalong: { mic: true },
  bubbles: { mic: true },
  jam: { mic: true },
  band: { mic: true },
  orchestra: { mic: true },
  teeth: { mic: true },
  firefly: { mic: true },
};

/** Small deterministic PRNG so a failure reproduces. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointer(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 });
}

interface ListenerLog {
  live: Map<string, number>;
  restore(): void;
}
/** Count add/removeEventListener on window and document, by target+type+listener. */
function trackListeners(): ListenerLog {
  const live = new Map<string, number>();
  const ids = new WeakMap<object, number>();
  let next = 0;
  const id = (o: object): number => {
    if (!ids.has(o)) ids.set(o, next++);
    return ids.get(o)!;
  };
  const key = (name: string, type: string, fn: unknown, opt: unknown): string => {
    const capture = typeof opt === 'boolean' ? opt : !!(opt as AddEventListenerOptions | undefined)?.capture;
    return `${name}:${type}:${fn && (typeof fn === 'function' || typeof fn === 'object') ? id(fn as object) : 'null'}:${capture}`;
  };
  const restores: Array<() => void> = [];
  for (const [name, target] of [
    ['window', window],
    ['document', document],
  ] as const) {
    const origAdd = target.addEventListener;
    const origRemove = target.removeEventListener;
    const add = origAdd.bind(target);
    const remove = origRemove.bind(target);
    target.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject | null, opt?: boolean | AddEventListenerOptions) => {
      const once = typeof opt === 'object' && opt?.once;
      if (!once) live.set(key(name, type, fn, opt), 1);
      add(type, fn as EventListener, opt);
    }) as typeof target.addEventListener;
    target.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject | null, opt?: boolean | EventListenerOptions) => {
      live.delete(key(name, type, fn, opt));
      remove(type, fn as EventListener, opt);
    }) as typeof target.removeEventListener;
    restores.push(() => {
      target.addEventListener = origAdd;
      target.removeEventListener = origRemove;
    });
  }
  return { live, restore: () => restores.forEach((r) => r()) };
}

describe('smoke: every registered game', () => {
  let mic: FakeMic | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no canvas backend; games must cope with getContext() === null.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });
  afterEach(() => {
    mic?.restore();
    mic = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('covers a non-trivial registry', () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
  });

  describe.each(GAMES.map((g) => [g.id, g] as const))('%s', (id, entry) => {
    it(
      'starts, survives random tapping, and cleans up after itself',
      async () => {
        if (SETUP[id]?.mic) mic = fakeMic();
        const { default: game } = await entry.load();
        expect(game.id).toBe(id);

        const timersBefore = vi.getTimerCount();
        document.body.querySelectorAll('*'); // jsdom's selector engine registers its own document listeners on first use
        const listeners = trackListeners();
        const ctx = fakeContext();
        try {
          expect(() => game.start(ctx)).not.toThrow();
          await vi.advanceTimersByTimeAsync(50);
          expect(ctx.stage.children.length, 'stage has content').toBeGreaterThan(0);

          const rnd = mulberry32(20240607 + id.length * 977 + id.charCodeAt(0));
          for (let round = 0; round < 12; round++) {
            // Re-query each round: games rebuild their DOM as they go.
            const nodes = [ctx.stage, ...Array.from(ctx.stage.querySelectorAll<HTMLElement>('*'))];
            const el = nodes[Math.floor(rnd() * nodes.length)]!;
            const x = Math.floor(rnd() * 400);
            const y = Math.floor(rnd() * 600);
            el.dispatchEvent(pointer('pointerdown', x, y));
            for (let m = 1; m <= 3; m++) el.dispatchEvent(pointer('pointermove', x + m * 7, y + m * 5));
            el.dispatchEvent(pointer('pointerup', x, y));
            if (rnd() < 0.5) el.dispatchEvent(pointer('click', x, y));
            mic?.feed(1);
            await vi.advanceTimersByTimeAsync(Math.floor(rnd() * 400));
          }
          expect(ctx.stage.children.length, 'stage still has content').toBeGreaterThan(0);
        } finally {
          ctx.cleanup();
          listeners.restore();
        }

        await vi.advanceTimersByTimeAsync(5000);
        expect(vi.getTimerCount(), 'timers / rAF left running after cleanup').toBeLessThanOrEqual(timersBefore);
        expect([...listeners.live.keys()], 'window/document listeners left after cleanup').toEqual([]);
      },
      10_000,
    );
  });
});
