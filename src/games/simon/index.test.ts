import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import { noteFreq } from '../../core/music';
import game from './index';
import { GAP_MS, MAX_LEN, PADS, PLAY_MS, STAR_AT, START_LEN } from './logic';

const INTRO_MS = 600;
const NEXT_MS = 800;
const RETRY_MS = 900;
const STEP_MS = PLAY_MS + GAP_MS;

const tap = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
const has = (el: Element, cls: string) => el.classList.contains(cls);

function root(ctx: FakeContext): HTMLElement {
  return ctx.stage.querySelector<HTMLElement>('.simon')!;
}
function status(ctx: FakeContext): string {
  return ctx.stage.querySelector('.simon-status')?.textContent ?? '';
}
function pads(ctx: FakeContext): HTMLElement[] {
  return [...ctx.stage.querySelectorAll<HTMLElement>('.simon-pad')];
}
function seqOf(ctx: FakeContext): number[] {
  return (root(ctx).dataset.seq ?? '').split(',').map(Number);
}
/** Let the whole melody play out: one step per pad. */
function listen(ctx: FakeContext): void {
  vi.advanceTimersByTime(seqOf(ctx).length * STEP_MS);
}
/** Tap every pad of the current melody in order. */
function repeatMelody(ctx: FakeContext): void {
  const all = pads(ctx);
  for (const i of seqOf(ctx)) tap(all[i]!);
}

describe('simon game', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mounts 4 pads, plays the melody after the intro, then hands over to the child', () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);

    const all = pads(ctx);
    expect(all.length).toBe(4);
    expect(all.map((p) => p.querySelector('.simon-animal')?.textContent)).toEqual(PADS.map((p) => p.emoji));
    expect(seqOf(ctx).length).toBe(START_LEN);
    expect(note).not.toHaveBeenCalled();

    // Taps before the melody plays are ignored.
    tap(all[0]!);
    expect(note).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INTRO_MS);
    expect(ctx.spoken).toContain('Nghe nhé');
    expect(status(ctx)).toBe('👂');
    const [first, second] = seqOf(ctx);
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(noteFreq(PADS[first!]!.note), PLAY_MS / 1000, 'bell');
    expect(has(all[first!]!, 'simon-lit')).toBe(true);

    // Taps while the melody plays are ignored too.
    tap(all[(first! + 1) % 4]!);
    expect(note).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(PLAY_MS);
    expect(has(all[first!]!, 'simon-lit')).toBe(false);
    vi.advanceTimersByTime(GAP_MS);
    expect(note).toHaveBeenCalledTimes(2);
    expect(note).toHaveBeenLastCalledWith(noteFreq(PADS[second!]!.note), PLAY_MS / 1000, 'bell');
    expect(status(ctx)).toBe('👂');

    vi.advanceTimersByTime(STEP_MS);
    expect(status(ctx)).toBe('👆');
    expect(ctx.spoken).toContain('Đến lượt bé');
    expect(note).toHaveBeenCalledTimes(2);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('a correct repeat grows the melody by one and replays it; a wrong tap replays the same melody', () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    const ding = vi.spyOn(ctx.audio, 'ding');
    const boing = vi.spyOn(ctx.audio, 'boing');
    game.start(ctx);
    vi.advanceTimersByTime(INTRO_MS);
    listen(ctx);
    expect(status(ctx)).toBe('👆');

    const before = seqOf(ctx);
    const all = pads(ctx);
    note.mockClear();
    repeatMelody(ctx);
    expect(note).toHaveBeenCalledTimes(before.length);
    expect(ding).toHaveBeenCalledTimes(1);
    expect(status(ctx)).toBe('🎉');
    expect(ctx.spoken).toContain('Đúng rồi!');
    expect(ctx.celebrations).toBe(0);
    expect(ctx.stars).toBe(0);

    // Extended by exactly one, keeping the old prefix, and replayed after NEXT_MS.
    const grown = seqOf(ctx);
    expect(grown.length).toBe(before.length + 1);
    expect(grown.slice(0, before.length)).toEqual(before);
    note.mockClear();
    vi.advanceTimersByTime(NEXT_MS);
    expect(status(ctx)).toBe('👂');
    expect(note).toHaveBeenCalledTimes(1);
    listen(ctx);
    expect(note).toHaveBeenCalledTimes(grown.length);
    expect(status(ctx)).toBe('👆');
    expect(seqOf(ctx)).toEqual(grown);

    // Wrong first tap: gentle sound, shake, replay of the same melody, no penalty.
    const wrong = all[(grown[0]! + 1) % 4]!;
    note.mockClear();
    tap(wrong);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(has(wrong, 'anim-shake')).toBe(true);
    expect(ctx.spoken).toContain('Nghe lại nhé');
    expect(seqOf(ctx)).toEqual(grown);
    expect(ding).toHaveBeenCalledTimes(1);

    // Further taps are ignored until the melody has played again.
    tap(all[grown[0]!]!);
    expect(note).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RETRY_MS);
    expect(status(ctx)).toBe('👂');
    expect(note).toHaveBeenCalledTimes(2);
    listen(ctx);
    expect(status(ctx)).toBe('👆');
    expect(note).toHaveBeenCalledTimes(1 + grown.length);
    expect(seqOf(ctx)).toEqual(grown);
    expect(ctx.celebrations).toBe(0);

    ctx.cleanup();
  });

  it('a wrong tap in the middle also replays without changing the melody', () => {
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(INTRO_MS);
    listen(ctx);
    const seq = seqOf(ctx);
    const all = pads(ctx);
    tap(all[seq[0]!]!);
    tap(all[(seq[1]! + 2) % 4]!);
    expect(ctx.spoken).toContain('Nghe lại nhé');
    expect(ctx.spoken).not.toContain('Đúng rồi!');
    expect(seqOf(ctx)).toEqual(seq);
    ctx.cleanup();
  });

  it('celebrates and awards a star at STAR_AT and MAX_LEN notes, then starts over', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(INTRO_MS);
    listen(ctx);

    // START_LEN … STAR_AT-1 notes: no star yet.
    for (let len = START_LEN; len < STAR_AT; len++) {
      expect(seqOf(ctx).length).toBe(len);
      repeatMelody(ctx);
      expect(ctx.celebrations).toBe(0);
      vi.advanceTimersByTime(NEXT_MS);
      listen(ctx);
    }

    expect(seqOf(ctx).length).toBe(STAR_AT);
    const atStar = seqOf(ctx);
    repeatMelody(ctx);
    expect(ctx.celebrations).toBe(1);
    expect(status(ctx)).toBe('🎉');
    // The melody does not grow until the celebration has finished.
    expect(seqOf(ctx)).toEqual(atStar);
    expect(ctx.stars).toBe(0);
    await Promise.resolve();
    expect(ctx.stars).toBe(1);
    expect(seqOf(ctx).length).toBe(STAR_AT + 1);
    vi.advanceTimersByTime(NEXT_MS);
    listen(ctx);
    expect(status(ctx)).toBe('👆');

    for (let len = STAR_AT + 1; len < MAX_LEN; len++) {
      expect(seqOf(ctx).length).toBe(len);
      repeatMelody(ctx);
      expect(ctx.celebrations).toBe(1);
      vi.advanceTimersByTime(NEXT_MS);
      listen(ctx);
    }

    expect(seqOf(ctx).length).toBe(MAX_LEN);
    repeatMelody(ctx);
    expect(ctx.celebrations).toBe(2);
    await Promise.resolve();
    expect(ctx.stars).toBe(2);
    expect(seqOf(ctx).length).toBe(START_LEN);
    vi.advanceTimersByTime(NEXT_MS);
    listen(ctx);
    expect(status(ctx)).toBe('👆');

    ctx.cleanup();
  });

  it('idle hint replays the melody during the child turn only', () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    vi.advanceTimersByTime(INTRO_MS);
    listen(ctx);
    expect(status(ctx)).toBe('👆');
    const seq = seqOf(ctx);
    note.mockClear();

    vi.advanceTimersByTime(6000);
    expect(status(ctx)).toBe('👂');
    expect(note).toHaveBeenCalledTimes(1);
    listen(ctx);
    expect(note).toHaveBeenCalledTimes(seq.length);
    expect(status(ctx)).toBe('👆');
    expect(seqOf(ctx)).toEqual(seq);

    // A correct repeat still works after the hint.
    repeatMelody(ctx);
    expect(ctx.spoken).toContain('Đúng rồi!');
    ctx.cleanup();
  });

  it('cleanup mid-melody stops every timer and later callbacks', async () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    vi.advanceTimersByTime(INTRO_MS);
    expect(note).toHaveBeenCalledTimes(1);

    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(note).toHaveBeenCalledTimes(1);
    expect(ctx.spoken).not.toContain('Đến lượt bé');

    // A celebration resolving after cleanup awards nothing.
    const ctx2 = fakeContext();
    game.start(ctx2);
    vi.advanceTimersByTime(INTRO_MS);
    listen(ctx2);
    while (seqOf(ctx2).length < STAR_AT) {
      repeatMelody(ctx2);
      vi.advanceTimersByTime(NEXT_MS);
      listen(ctx2);
    }
    repeatMelody(ctx2);
    expect(ctx2.celebrations).toBe(1);
    ctx2.cleanup();
    await Promise.resolve();
    expect(ctx2.stars).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
