import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';
import { generateLevel } from './logic';

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const tile = (ctx: ReturnType<typeof fakeContext>, t: string) => ctx.stage.querySelector<HTMLElement>(`[data-tile="${t}"]`)!;
const press = (el: Element) => el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

describe('treasure game', () => {
  it('solving level 1 gives a star and saves the next level', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const lv = generateLevel(0);
    for (const t of lv.solution) press(tile(ctx, t));
    expect(ctx.stage.querySelectorAll('.tr-slot.is-full')).toHaveLength(1);
    press(ctx.stage.querySelector('.tr-play')!);
    await vi.advanceTimersByTimeAsync(6000);
    expect(ctx.stars).toBe(1);
    expect(JSON.parse(localStorage.getItem('be-choi:treasure')!)).toEqual({ v: 1, level: 1 });
    ctx.cleanup();
  });

  it('a bump does not fail: tray stays, hint spoken, no star', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const lv = generateLevel(0);
    const wrong = lv.tiles.find((t) => t !== lv.solution[0])!;
    press(tile(ctx, wrong));
    press(ctx.stage.querySelector('.tr-play')!);
    await vi.advanceTimersByTimeAsync(6000);
    expect(ctx.stars).toBe(0);
    expect(ctx.stage.querySelectorAll('.tr-slot.is-full').length).toBe(1);
    ctx.cleanup();
  });
});
