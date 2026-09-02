import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';

describe('bubbles game', () => {
  it('spawns bubbles, pops on tap, cleans up', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.bubble').length).toBeGreaterThanOrEqual(3);
    vi.advanceTimersByTime(2000);
    expect(ctx.stage.querySelectorAll('.bubble').length).toBeGreaterThanOrEqual(5);
    const first = ctx.stage.querySelector('.bubble')!;
    first.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(first.classList.contains('anim-pop')).toBe(true);
    ctx.cleanup();
    vi.useRealTimers();
  });
});
