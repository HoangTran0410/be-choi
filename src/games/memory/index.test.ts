import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';
import { FLIP_BACK_MS } from './logic';

const tap = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
const emojiOf = (el: Element) => el.querySelector('.memory-card-back')?.textContent ?? '';
const has = (el: Element, cls: string) => el.classList.contains(cls);

function cards(stage: HTMLElement): HTMLElement[] {
  return [...stage.querySelectorAll<HTMLElement>('.memory-card')];
}

describe('memory game', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mounts 4 cards; a miss flips back after FLIP_BACK_MS and ignores taps meanwhile', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const all = cards(ctx.stage);
    expect(all.length).toBe(4);

    const a = all[0]!;
    const b = all.find((c) => emojiOf(c) !== emojiOf(a))!;
    const c = all.find((x) => x !== a && x !== b)!;

    tap(a);
    expect(has(a, 'flipped')).toBe(true);
    tap(b);
    expect(has(b, 'flipped')).toBe(true);
    expect(has(a, 'matched')).toBe(false);
    expect(has(b, 'matched')).toBe(false);

    tap(c); // two are open: ignored
    expect(has(c, 'flipped')).toBe(false);

    vi.advanceTimersByTime(FLIP_BACK_MS);
    expect(has(a, 'flipped')).toBe(false);
    expect(has(b, 'flipped')).toBe(false);
    expect(ctx.spoken).toEqual([]);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('a matching pair stays up and is named; finishing the round celebrates, awards a star, deals again', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    const all = cards(ctx.stage);
    const a = all[0]!;
    const a2 = all.find((c) => c !== a && emojiOf(c) === emojiOf(a))!;

    tap(a);
    tap(a2);
    expect(has(a, 'matched')).toBe(true);
    expect(has(a2, 'matched')).toBe(true);
    expect(has(a, 'flipped')).toBe(true);
    expect(ctx.spoken.length).toBe(1);

    tap(a); // matched cards ignore taps
    expect(ctx.spoken.length).toBe(1);

    const rest = all.filter((x) => x !== a && x !== a2);
    tap(rest[0]!);
    tap(rest[1]!);
    expect(ctx.celebrations).toBe(1);
    await Promise.resolve();
    expect(ctx.stars).toBe(1);

    const next = cards(ctx.stage);
    expect(next.length).toBe(4);
    expect(next.some((x) => has(x, 'matched') || has(x, 'flipped'))).toBe(false);

    ctx.cleanup();
  });

  it('idle hint wiggles the partner of the one open card', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const all = cards(ctx.stage);
    const a = all[0]!;
    tap(a);
    vi.advanceTimersByTime(6000);
    const wiggled = all.filter((x) => has(x, 'anim-wiggle'));
    expect(wiggled.length).toBe(1);
    expect(wiggled[0]).not.toBe(a);
    expect(emojiOf(wiggled[0]!)).toBe(emojiOf(a));
    ctx.cleanup();
  });
});
