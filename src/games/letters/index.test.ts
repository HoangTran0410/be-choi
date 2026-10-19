import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';

describe('letters game', () => {
  it('reads tiles aloud, never errors, celebrates when a page is complete', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const tiles = [...ctx.stage.querySelectorAll('.letter-tile')];
    expect(tiles.length).toBe(10);
    tiles[0]!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(ctx.spoken[0]).toBe('a. áo');
    // tapping the same tile again is harmless
    tiles[0]!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(ctx.celebrations).toBe(0);
    for (const t of [...tiles].reverse()) t.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(ctx.stage.querySelector('.letter-tile')!.textContent).toContain('H');
    ctx.cleanup();
    vi.useRealTimers();
  });
});
