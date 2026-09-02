import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import { REVEAL_MS, STAR_EVERY } from './logic';
import game from './index';

describe('peekaboo game', () => {
  it('mounts 4 spots, reveals on tap, hides after REVEAL_MS, cleans up', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const spots = ctx.stage.querySelectorAll<HTMLElement>('.peekaboo-spot');
    expect(spots.length).toBe(4);

    const first = spots[0]!;
    const peek = first.querySelector('.peekaboo-peek')!;
    const before = peek.textContent;
    first.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(first.classList.contains('open')).toBe(true);
    expect(ctx.spoken.length).toBe(1);
    expect(ctx.spoken[0]?.startsWith('Ú oà')).toBe(true);

    // A second tap while open is ignored.
    first.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(ctx.spoken.length).toBe(1);

    vi.advanceTimersByTime(REVEAL_MS + 400);
    expect(first.classList.contains('open')).toBe(false);
    expect(peek.textContent).not.toBe(before);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    vi.useRealTimers();
  });

  it('awards a star every STAR_EVERY reveals', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const first = ctx.stage.querySelector<HTMLElement>('.peekaboo-spot')!;
    for (let i = 0; i < STAR_EVERY - 1; i++) {
      first.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(REVEAL_MS + 400);
    }
    expect(ctx.stars).toBe(0);
    first.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(ctx.stars).toBe(1);
    expect(ctx.stage.querySelector('.peekaboo-star')).not.toBeNull();
    vi.advanceTimersByTime(REVEAL_MS + 400);
    expect(ctx.stage.querySelector('.peekaboo-star')).toBeNull();
    ctx.cleanup();
    vi.useRealTimers();
  });
});
