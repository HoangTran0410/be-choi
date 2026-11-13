import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import type { SoundGroup } from '../../core/audio';
import { instOf, SHOW_INSTRUMENTS } from './logic';
import game from './index';

const down = (el: Element): void => {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
};
const pick = (el: Element): void => {
  el.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
};

/** An audio engine whose groups can be inspected: every group started and how often it was stopped. */
function groups(ctx: ReturnType<typeof fakeContext>): Array<{ stop: ReturnType<typeof vi.fn> }> {
  const list: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
  ctx.audio.group = (fn: () => void): SoundGroup => {
    fn();
    const g = { stop: vi.fn() };
    list.push(g);
    return g;
  };
  return list;
}

describe('show game', () => {
  afterEach(() => vi.useRealTimers());

  it('left alone, the bear plays by itself, then moves on to the next instrument', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const on = (): string | null | undefined => ctx.stage.querySelector('.show-pick.is-on')?.getAttribute('data-inst');
    const first = on();
    vi.advanceTimersByTime(700);
    expect(ctx.stage.querySelector('.show-performer')!.classList.contains('is-playing')).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(on()).not.toBe(first);
    ctx.cleanup();
  });

  it('a child playing keeps the bear from taking over', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const first = ctx.stage.querySelector('.show-pick.is-on')?.getAttribute('data-inst');
    for (let t = 0; t < 40; t++) {
      down(ctx.stage.querySelector('.show-inst')!);
      vi.advanceTimersByTime(1000);
    }
    expect(ctx.stage.querySelector('.show-pick.is-on')?.getAttribute('data-inst')).toBe(first);
    ctx.cleanup();
  });

  it('mounts the whole shelf, no coloured pads, and exactly two arms', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.show-pick').length).toBe(SHOW_INSTRUMENTS.length);
    expect(SHOW_INSTRUMENTS.length).toBeGreaterThanOrEqual(20);
    expect(ctx.stage.querySelectorAll('.show-pad').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.show-paw').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.show-arms:not(.show-arms-under) .show-arm').length).toBe(2);
    ctx.cleanup();
  });

  it('every instrument is held by exactly two arms', () => {
    const ctx = fakeContext();
    game.start(ctx);
    for (const d of SHOW_INSTRUMENTS) {
      pick(ctx.stage.querySelector(`.show-pick[data-inst="${d.id}"]`)!);
      expect(ctx.stage.querySelectorAll('.show-arms:not(.show-arms-under) .show-arm').length, d.id).toBe(2);
      expect(ctx.stage.querySelector('.show-inst')!.getAttribute('data-inst')).toBe(d.id);
    }
    ctx.cleanup();
  });

  it('tapping an instrument plays its whole phrase on the audio clock', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    pick(ctx.stage.querySelector('[data-inst="violin"]')!);
    expect(note).toHaveBeenCalledTimes(instOf('violin').phrase.length);
    expect(note.mock.calls.every((c) => c[2] === 'violin')).toBe(true);
    expect(ctx.stage.querySelector('.show-pick.is-on')?.getAttribute('data-inst')).toBe('violin');
    expect(ctx.stage.querySelector('.show-performer')!.classList.contains('is-playing')).toBe(true);
    vi.advanceTimersByTime(9000);
    expect(ctx.stage.querySelector('.show-performer')!.classList.contains('is-playing')).toBe(false);
    ctx.cleanup();
  });

  it('each tap on the held instrument plays the next note of the tune, and the tune earns a star', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    const inst = ctx.stage.querySelector('.show-inst')!;
    const len = instOf('piano').phrase.length;
    for (let i = 0; i < len; i++) down(inst);
    expect(note).toHaveBeenCalledTimes(len);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
  });

  it('a tap while the bear plays takes over from the show and cuts its notes', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const gs = groups(ctx);
    game.start(ctx);
    pick(ctx.stage.querySelector('[data-inst="flute"]')!);
    const show = gs[0]!;
    down(ctx.stage.querySelector('.show-inst')!);
    expect(ctx.stage.querySelector('.show-performer')!.classList.contains('is-playing')).toBe(false);
    expect(show.stop).toHaveBeenCalledTimes(1);
    ctx.cleanup();
  });

  it('picking an instrument again, or another, cuts the previous phrase and the notes still ringing', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const gs = groups(ctx);
    game.start(ctx);
    const tile = ctx.stage.querySelector('[data-inst="guitar"]')!;
    pick(tile);
    pick(tile);
    pick(tile);
    expect(gs.length).toBe(3);
    expect(gs[0]!.stop).toHaveBeenCalledTimes(1);
    expect(gs[1]!.stop).toHaveBeenCalledTimes(1);
    expect(gs[2]!.stop).not.toHaveBeenCalled();
    down(ctx.stage.querySelector('.show-inst')!); // the child's own note
    pick(ctx.stage.querySelector('[data-inst="drum"]')!);
    expect(gs[2]!.stop).toHaveBeenCalled();
    expect(gs[3]!.stop).toHaveBeenCalled(); // that note was cut too
    ctx.cleanup();
  });

  it('preloads the recordings of the first screenful, and of an instrument when it is picked', () => {
    const ctx = fakeContext();
    const preload = vi.fn();
    ctx.audio.preloadInstruments = preload;
    game.start(ctx);
    expect(preload).toHaveBeenCalledTimes(1);
    pick(ctx.stage.querySelector('[data-inst="banjo"]')!);
    expect(preload).toHaveBeenLastCalledWith(['inst:banjo']);
    ctx.cleanup();
  });
});
