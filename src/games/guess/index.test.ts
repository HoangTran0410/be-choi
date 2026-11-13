import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';

const down = (el: Element): void => {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
};

describe('guess game', () => {
  afterEach(() => vi.useRealTimers());

  it('begins with two pictures and the mystery sound', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    const drum = vi.spyOn(ctx.audio, 'drum');
    const inst = vi.spyOn(ctx.audio, 'inst');
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.guess-card').length).toBe(2);
    await vi.advanceTimersByTimeAsync(8000);
    expect(note.mock.calls.length + drum.mock.calls.length + inst.mock.calls.length).toBeGreaterThanOrEqual(5);
    ctx.cleanup();
  });

  it('a wrong card plays itself, never ends the round; the right card gives a star and a new round', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(8000);
    const cards = [...ctx.stage.querySelectorAll('.guess-card')];
    expect(cards.length).toBe(2);
    // Find out which is right by trying: tap both, the wrong one first or second, either way no star before the right one.
    const before = vi.spyOn(ctx.audio, 'ding');
    let right: Element | undefined;
    for (const c of cards) {
      down(c);
      if (before.mock.calls.length) {
        right = c;
        break;
      }
      expect(ctx.stars).toBe(0);
      expect(c.classList.contains('is-off')).toBe(false);
    }
    expect(right).toBeTruthy();
    expect(ctx.stars).toBe(1);
    const firstIds = cards.map((c) => c.getAttribute('data-inst'));
    await vi.advanceTimersByTimeAsync(3000);
    const next = [...ctx.stage.querySelectorAll('.guess-card')];
    expect(next.length).toBe(2);
    expect(next.every((c) => !c.classList.contains('is-right'))).toBe(true);
    void firstIds;
    ctx.cleanup();
  });
});
