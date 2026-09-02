import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';

const tap = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));

function choicesOf(stage: HTMLElement): { correct: HTMLButtonElement; wrong: HTMLButtonElement } {
  const answer = stage.querySelector<HTMLElement>('.pattern')!.dataset.answer;
  const all = [...stage.querySelectorAll<HTMLButtonElement>('.pattern-choice')];
  return {
    correct: all.find((c) => c.dataset.emoji === answer)!,
    wrong: all.find((c) => c.dataset.emoji !== answer)!,
  };
}

describe('pattern game', () => {
  it('mounts the sequence plus a missing slot and 3 choices, asks the question, hints when idle, cleans up', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    // Rounds 0–2 are AB: 5 visible cards and the missing one.
    expect(ctx.stage.querySelectorAll('.pattern-slot').length).toBe(6);
    const missing = ctx.stage.querySelectorAll('.pattern-missing');
    expect(missing.length).toBe(1);
    expect(missing[0]!.textContent).toBe('?');
    expect(missing[0]!.classList.contains('anim-pulse')).toBe(true);
    expect(ctx.stage.querySelectorAll('.pattern-choice').length).toBe(3);
    expect(ctx.spoken.at(-1)?.endsWith('Tiếp theo là gì nhỉ?')).toBe(true);

    const { correct } = choicesOf(ctx.stage);
    vi.advanceTimersByTime(6000);
    expect(correct.classList.contains('anim-wiggle')).toBe(true);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    vi.useRealTimers();
  });

  it('wrong choice boings and shakes, slot stays empty; right choice fills it, dings and moves on', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const boing = vi.spyOn(ctx.audio, 'boing');
    const ding = vi.spyOn(ctx.audio, 'ding');
    game.start(ctx);
    const missing = ctx.stage.querySelector<HTMLElement>('.pattern-missing')!;
    const { correct, wrong } = choicesOf(ctx.stage);

    tap(wrong);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(ding).not.toHaveBeenCalled();
    expect(wrong.classList.contains('anim-shake')).toBe(true);
    expect(missing.classList.contains('filled')).toBe(false);
    expect(missing.textContent).toBe('?');
    expect(ctx.stage.querySelectorAll('.pattern-choice:disabled').length).toBe(0);

    tap(correct);
    expect(ding).toHaveBeenCalledTimes(1);
    expect(missing.classList.contains('filled')).toBe(true);
    expect(missing.classList.contains('anim-pulse')).toBe(false);
    expect(missing.classList.contains('anim-bounce')).toBe(true);
    expect(missing.textContent).toBe(correct.dataset.emoji);
    expect(ctx.spoken.at(-1)).toBe(correct.getAttribute('aria-label'));
    expect(ctx.stage.querySelectorAll('.pattern-choice:disabled').length).toBe(3);

    // The tray is inert until the next round.
    tap(correct);
    tap(wrong);
    expect(ding).toHaveBeenCalledTimes(1);
    expect(boing).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(900);
    expect(ctx.stage.querySelector('.pattern-missing.filled')).toBeNull();
    expect(ctx.stage.querySelector('.pattern-missing')?.textContent).toBe('?');
    expect(ctx.stage.querySelectorAll('.pattern-choice').length).toBe(3);
    expect(ctx.stage.querySelectorAll('.pattern-choice:disabled').length).toBe(0);
    expect(ctx.celebrations).toBe(0);
    ctx.cleanup();
    vi.useRealTimers();
  });

  it('celebrates and awards a star after 3 correct answers, then keeps going', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    for (let i = 0; i < 3; i++) {
      expect(ctx.celebrations).toBe(0);
      tap(choicesOf(ctx.stage).correct);
      await vi.advanceTimersByTimeAsync(900);
    }
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(ctx.stage.querySelector('.pattern-missing.filled')).toBeNull();
    expect(ctx.stage.querySelectorAll('.pattern-choice').length).toBe(3);
    ctx.cleanup();
    vi.useRealTimers();
  });

  it('a pending next round does not fire after cleanup', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    tap(choicesOf(ctx.stage).correct);
    const spokenBefore = ctx.spoken.length;
    ctx.cleanup();
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    expect(ctx.spoken.length).toBe(spokenBefore);
    vi.useRealTimers();
  });
});
