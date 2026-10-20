import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import type { Clip } from '../../core/audio';
import { PAGES } from './logic';
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

const ptr = (): PointerEvent => new PointerEvent('pointerdown', { pointerId: 1, bubbles: true });

function mount() {
  vi.useFakeTimers();
  const ctx = fakeContext();
  const played: string[] = [];
  const stopped: string[] = [];
  ctx.audio.clip = (url) => {
    played.push(url);
    const clip: Clip = { duration: 1, stop: () => stopped.push(url) };
    return Promise.resolve(clip);
  };
  game.start(ctx);
  return { ctx, played, stopped };
}

const things = (ctx: ReturnType<typeof fakeContext>) => [...ctx.stage.querySelectorAll<HTMLElement>('.sb-thing')];

describe('soundbook game', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('opens on the first page with two page arrows', () => {
    const { ctx } = mount();
    expect(ctx.stage.querySelectorAll('.sb-arrow').length).toBe(2);
    expect(things(ctx).length).toBe(PAGES[0]!.things.length);
    ctx.cleanup();
  });

  it('plays the thing pressed, then says its name', async () => {
    const { ctx, played } = mount();
    const cow = things(ctx).find((el) => el.dataset.id === 'cow')!;
    cow.dispatchEvent(ptr());
    await vi.advanceTimersByTimeAsync(0);
    expect(played).toEqual(['sounds/cow.m4a']);
    expect(cow.classList.contains('sb-on')).toBe(true);
    await vi.advanceTimersByTimeAsync(1300);
    expect(ctx.spoken.at(-1)).toBe('Con bò');
    expect(cow.classList.contains('sb-on')).toBe(false);
    ctx.cleanup();
  });

  it('cuts the last sound short when something else is pressed, and only names the last', async () => {
    const { ctx, stopped } = mount();
    const [a, b] = things(ctx);
    a!.dispatchEvent(ptr());
    await vi.advanceTimersByTimeAsync(300);
    b!.dispatchEvent(ptr());
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1300);
    expect(ctx.spoken).toEqual([PAGES[0]!.things[1]!.name]);
    ctx.cleanup();
  });

  it('turns the page with the arrows and remembers it for next time', () => {
    const { ctx } = mount();
    const next = ctx.stage.querySelector<HTMLElement>('.sb-arrow-next')!;
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 500));
    for (let i = 0; i < PAGES.findIndex((p) => p.id === 'vehicles'); i++) next.dispatchEvent(ptr());
    vi.restoreAllMocks();
    expect(things(ctx).map((el) => el.dataset.id)).toContain('firetruck');
    ctx.cleanup();
    const again = mount();
    expect(things(again.ctx).map((el) => el.dataset.id)).toContain('firetruck');
    again.ctx.cleanup();
  });

  it('gives one star once everything on a page has been heard', async () => {
    const { ctx } = mount();
    for (const el of things(ctx)) {
      el.dispatchEvent(ptr());
      await vi.advanceTimersByTimeAsync(1300);
    }
    expect(ctx.stars).toBe(1);
    things(ctx)[0]!.dispatchEvent(ptr());
    await vi.advanceTimersByTimeAsync(1300);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });
});
