import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';

const down = (el: Element): void => {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
};
const up = (): void => {
  const e = new Event('pointerup', { bubbles: true });
  window.dispatchEvent(e);
};
/** A tap: pointerdown on the thing, pointerup on the window. */
const tap = (el: Element): void => {
  down(el);
  up();
};

describe('kidsband game', () => {
  afterEach(() => vi.useRealTimers());

  it('starts with an empty stage and silent', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.band-slot').length).toBe(4);
    expect(ctx.stage.querySelectorAll('.band-player').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.band-pick').length).toBe(8);
    vi.advanceTimersByTime(2000);
    expect(note).not.toHaveBeenCalled();
    ctx.cleanup();
  });

  it('a tapped instrument becomes a bear that plays its part; tap again and it sleeps; shelf tap removes it', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    tap(ctx.stage.querySelector('.band-pick[data-inst="xylo"]')!);
    expect(ctx.stage.querySelectorAll('.band-player').length).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(note.mock.calls.length).toBeGreaterThan(2);
    expect(note.mock.calls.every((c) => c[2] === 'xylo')).toBe(true);

    tap(ctx.stage.querySelector('.band-player')!);
    expect(ctx.stage.querySelector('.band-player')!.classList.contains('is-off')).toBe(true);
    const n = note.mock.calls.length;
    vi.advanceTimersByTime(3000);
    expect(note.mock.calls.length).toBe(n); // asleep: the loop stopped

    tap(ctx.stage.querySelector('.band-pick[data-inst="xylo"]')!);
    expect(ctx.stage.querySelectorAll('.band-player').length).toBe(0);
    ctx.cleanup();
  });

  it('four fit; a fifth only wiggles. Drums play drum hits.', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    for (const id of ['drum', 'piano', 'guitar', 'violin', 'flute']) tap(ctx.stage.querySelector(`.band-pick[data-inst="${id}"]`)!);
    expect(ctx.stage.querySelectorAll('.band-player').length).toBe(4);
    vi.advanceTimersByTime(1200);
    expect(drum).toHaveBeenCalled();
    ctx.cleanup();
  });

  it('stops everything when the child leaves', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    tap(ctx.stage.querySelector('.band-pick[data-inst="piano"]')!);
    vi.advanceTimersByTime(500);
    ctx.cleanup();
    const n = note.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(note.mock.calls.length).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });
});
