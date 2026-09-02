import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';

const tap = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));

describe('count game', () => {
  it('mounts 1–2 fruits, numbers a fruit on tap, cleans up', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const fruits = ctx.stage.querySelectorAll('.count-fruit');
    expect(fruits.length).toBeGreaterThanOrEqual(1);
    expect(fruits.length).toBeLessThanOrEqual(2);
    expect(ctx.spoken.some((s) => s.startsWith('Đếm '))).toBe(true);

    const first = ctx.stage.querySelector('.count-fruit')!;
    tap(first);
    expect(first.classList.contains('counted')).toBe(true);
    expect(first.querySelector('.count-badge')?.textContent).toBe('1');
    expect(ctx.spoken).toContain('một');

    // A second tap on a counted fruit only bounces: no new badge, no new number.
    tap(first);
    expect(first.querySelectorAll('.count-badge').length).toBe(1);
    expect(ctx.spoken.filter((s) => s === 'một').length).toBe(1);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    vi.useRealTimers();
  });

  it('shows the total, celebrates, awards a star and starts a new round', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const fruits = [...ctx.stage.querySelectorAll('.count-fruit')];
    for (const f of fruits) tap(f);
    expect(ctx.stage.querySelector('.count-total')?.textContent).toBe(String(fruits.length));
    expect(ctx.spoken.at(-1)).toMatch(/^Có /);
    expect(ctx.celebrations).toBe(0);

    await vi.advanceTimersByTimeAsync(700);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(ctx.stage.querySelector('.count-total')).toBeNull();
    expect(ctx.stage.querySelectorAll('.count-fruit').length).toBeGreaterThanOrEqual(1);
    expect(ctx.stage.querySelectorAll('.count-fruit.counted').length).toBe(0);

    ctx.cleanup();
    vi.useRealTimers();
  });
});
