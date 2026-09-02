import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { noteFreq } from '../../core/music';
import { GROOVES, PARTS, SILENT_BARS, STAR_AFTER_MS, STEPS, stepMs } from './logic';
import game from './index';

type Ctx = ReturnType<typeof fakeContext>;

function down(el: Element | null): void {
  if (!el) throw new Error('missing element');
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

function tile(ctx: Ctx, id: string): HTMLElement {
  const el = ctx.stage.querySelector<HTMLElement>(`.orchestra-animal[data-id="${id}"]`);
  if (!el) throw new Error(`missing animal ${id}`);
  return el;
}

function grooveBtn(ctx: Ctx, id: string): HTMLElement {
  const el = ctx.stage.querySelector<HTMLElement>(`.orchestra-groove[data-id="${id}"]`);
  if (!el) throw new Error(`missing groove ${id}`);
  return el;
}

function root(ctx: Ctx): HTMLElement {
  const el = ctx.stage.querySelector<HTMLElement>('.orchestra');
  if (!el) throw new Error('missing root');
  return el;
}

const BPM = GROOVES[0]!.bpm;
/** Fake time for `n` sixteenth steps at the default groove (whole ms, so every step has fired). */
const steps = (n: number, bpm = BPM) => Math.ceil(stepMs(bpm) * n);

describe('orchestra game', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts 6 animals, 3 grooves and a stop button; everyone starts silent and greyed; nothing is spoken', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.orchestra-animal').length).toBe(6);
    expect(ctx.stage.querySelectorAll('.orchestra-emoji').length).toBe(6);
    expect(ctx.stage.querySelectorAll('.orchestra-groove').length).toBe(3);
    expect(ctx.stage.querySelectorAll('.orchestra-stop').length).toBe(1);
    expect(ctx.stage.querySelectorAll('.orchestra-active').length).toBe(0);
    for (const p of PARTS) {
      const t = tile(ctx, p.id);
      expect(t.getAttribute('aria-label')).toBe(p.name);
      expect(t.getAttribute('aria-pressed')).toBe('false');
      expect(t.textContent).toBe(p.emoji);
      expect(t.style.getPropertyValue('--orchestra-color')).toBe(p.color);
    }
    for (const g of GROOVES) expect(grooveBtn(ctx, g.id).textContent).toBe(g.emoji);
    // The first groove is selected; the beat length is exposed for the dance animation.
    expect(grooveBtn(ctx, 'vui').classList.contains('active')).toBe(true);
    expect(grooveBtn(ctx, 'nhay').classList.contains('active')).toBe(false);
    expect(root(ctx).dataset.groove).toBe('vui');
    expect(root(ctx).style.getPropertyValue('--orchestra-beat')).toBe(`${stepMs(BPM) * 4}ms`);
    // Nothing plays until an animal is tapped.
    vi.advanceTimersByTime(steps(32));
    expect(note).not.toHaveBeenCalled();
    expect(drum).not.toHaveBeenCalled();
    expect(root(ctx).classList.contains('orchestra-playing')).toBe(false);
    // The shell speaks the intro; the game never talks over the music.
    expect(ctx.spoken).toEqual([]);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('tapping 🐻 starts the band: kick and snare loop, the tile dances and bumps on the beat', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const note = vi.spyOn(ctx.audio, 'note');
    const tick = vi.spyOn(ctx.audio, 'tick');
    game.start(ctx);
    const bear = tile(ctx, 'bear');
    down(bear.querySelector('.orchestra-emoji'));
    expect(tick).toHaveBeenCalledTimes(1);
    expect(bear.classList.contains('orchestra-active')).toBe(true);
    expect(bear.classList.contains('orchestra-dance')).toBe(true);
    expect(bear.getAttribute('aria-pressed')).toBe('true');
    expect(root(ctx).classList.contains('orchestra-playing')).toBe(true);
    expect(ctx.stage.querySelectorAll('.orchestra-active').length).toBe(1);

    // First step: kick, and the active tile bumps for ~120 ms.
    vi.advanceTimersByTime(steps(1));
    expect(drum).toHaveBeenCalledTimes(1);
    expect(drum).toHaveBeenLastCalledWith('kick');
    expect(bear.classList.contains('orchestra-beat')).toBe(true);
    expect(tile(ctx, 'frog').classList.contains('orchestra-beat')).toBe(false);
    vi.advanceTimersByTime(125);
    expect(bear.classList.contains('orchestra-beat')).toBe(false);

    vi.advanceTimersByTime(steps(STEPS) - steps(1) - 125);
    const count = (kind: string) => drum.mock.calls.filter((c) => c[0] === kind).length;
    expect(count('kick')).toBeGreaterThanOrEqual(2);
    expect(count('snare')).toBeGreaterThanOrEqual(2);
    expect(count('hat')).toBeGreaterThanOrEqual(4);
    expect(count('clap')).toBe(0);
    expect(note).not.toHaveBeenCalled();
    expect(ctx.stars).toBe(0);

    // Tapping again removes the bear: silence, but the band keeps counting.
    down(bear);
    expect(bear.classList.contains('orchestra-active')).toBe(false);
    expect(bear.classList.contains('orchestra-dance')).toBe(false);
    expect(bear.getAttribute('aria-pressed')).toBe('false');
    const before = drum.mock.calls.length;
    vi.advanceTimersByTime(steps(STEPS));
    expect(drum.mock.calls.length).toBe(before);
    expect(root(ctx).classList.contains('orchestra-playing')).toBe(true);
    expect(ctx.stage.querySelectorAll('.orchestra-beat').length).toBe(0);
    ctx.cleanup();
  });

  it('🐸 plucks guitar bass notes; 🐱 plays three-note piano chords that change each bar; 🐰 and 🐦 ring xylo and bell', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    down(tile(ctx, 'frog'));
    vi.advanceTimersByTime(steps(1));
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(noteFreq('C3'), expect.closeTo((stepMs(BPM) * 3) / 1000, 6), 'bass');
    expect(drum).not.toHaveBeenCalled();
    vi.advanceTimersByTime(steps(STEPS) - steps(1));
    expect(note.mock.calls.every((c) => c[2] === 'bass')).toBe(true);
    expect(note.mock.calls.length).toBeGreaterThanOrEqual(4);

    // Cat: a chord is three simultaneous piano notes, held a quarter note.
    down(tile(ctx, 'frog'));
    note.mockClear();
    down(tile(ctx, 'cat'));
    const chordDur = (stepMs(BPM) * 4) / 1000;
    // Bar 0 is already under way; wait for the next bar boundary (step 0) then the second chord (step 8).
    vi.advanceTimersByTime(steps(STEPS * 2));
    const piano = note.mock.calls.filter((c) => c[2] === 'piano');
    expect(piano.length).toBeGreaterThanOrEqual(6);
    expect(piano.length % 3).toBe(0);
    for (const c of piano) expect(c[1]).toBeCloseTo(chordDur, 6);
    const chordFreqs = new Set(piano.map((c) => c[0]));
    // Two different chords have sounded across the bars.
    expect(chordFreqs.size).toBeGreaterThan(3);

    down(tile(ctx, 'cat'));
    note.mockClear();
    down(tile(ctx, 'rabbit'));
    down(tile(ctx, 'bird'));
    vi.advanceTimersByTime(steps(STEPS));
    const timbres = new Set(note.mock.calls.map((c) => c[2]));
    expect(timbres.has('xylo')).toBe(true);
    expect(timbres.has('bell')).toBe(true);
    expect(timbres.has('piano')).toBe(false);
    const eighth = (stepMs(BPM) * 2) / 1000;
    for (const c of note.mock.calls) expect(c[1]).toBeCloseTo(eighth, 6);
    // Multi-touch: two animals active at once.
    expect(ctx.stage.querySelectorAll('.orchestra-active').length).toBe(2);
    ctx.cleanup();
  });

  it('groove buttons change the tempo immediately and transpose every note', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const note = vi.spyOn(ctx.audio, 'note');
    const tick = vi.spyOn(ctx.audio, 'tick');
    game.start(ctx);
    down(tile(ctx, 'bear'));
    const WINDOW = 8000;
    const hitsIn = (ms: number) => {
      const before = drum.mock.calls.length;
      vi.advanceTimersByTime(ms);
      return drum.mock.calls.length - before;
    };
    const slow = hitsIn(WINDOW); // 112 bpm

    down(grooveBtn(ctx, 'nhay'));
    expect(tick).toHaveBeenCalledTimes(2);
    expect(grooveBtn(ctx, 'nhay').classList.contains('active')).toBe(true);
    expect(grooveBtn(ctx, 'nhay').getAttribute('aria-pressed')).toBe('true');
    expect(grooveBtn(ctx, 'vui').classList.contains('active')).toBe(false);
    expect(grooveBtn(ctx, 'vui').getAttribute('aria-pressed')).toBe('false');
    expect(root(ctx).dataset.groove).toBe('nhay');
    expect(root(ctx).style.getPropertyValue('--orchestra-beat')).toBe(`${stepMs(132) * 4}ms`);
    const fast = hitsIn(WINDOW); // 132 bpm
    expect(fast).toBeGreaterThan(slow);

    down(grooveBtn(ctx, 'ru'));
    const lullaby = hitsIn(WINDOW); // 88 bpm
    expect(lullaby).toBeLessThan(slow);
    // Still the bear's beat: the pattern did not change, only its speed.
    expect(new Set(drum.mock.calls.map((c) => c[0]))).toEqual(new Set(['kick', 'snare', 'hat']));

    // Transposition: the bird's C5 arpeggio drops three semitones in 'ru' (C5 → A4).
    down(tile(ctx, 'bear'));
    down(tile(ctx, 'bird'));
    vi.advanceTimersByTime(steps(STEPS * 2, 88));
    const freqs = new Set(note.mock.calls.map((c) => c[0]));
    expect(freqs.has(noteFreq('A4'))).toBe(true);
    expect(freqs.has(noteFreq('C5'))).toBe(false);
    for (const c of note.mock.calls) expect(c[1]).toBeCloseTo((stepMs(88) * 2) / 1000, 6);

    // Back to 'vui': the original pitch and no leftover 'ru' notes.
    note.mockClear();
    down(grooveBtn(ctx, 'vui'));
    vi.advanceTimersByTime(steps(STEPS * 2));
    const again = new Set(note.mock.calls.map((c) => c[0]));
    expect(again.has(noteFreq('C5'))).toBe(true);
    expect(again.has(noteFreq('A4'))).toBe(false);
    // 'nhay' raises by two semitones: C5 → D5.
    note.mockClear();
    down(grooveBtn(ctx, 'nhay'));
    vi.advanceTimersByTime(steps(STEPS * 2, 132));
    expect(new Set(note.mock.calls.map((c) => c[0])).has(noteFreq('D5'))).toBe(true);
    ctx.cleanup();
  });

  it('⏹ clears every animal and stops the sequencer', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const note = vi.spyOn(ctx.audio, 'note');
    const tick = vi.spyOn(ctx.audio, 'tick');
    game.start(ctx);
    down(tile(ctx, 'bear'));
    down(tile(ctx, 'monkey'));
    down(tile(ctx, 'frog'));
    vi.advanceTimersByTime(steps(STEPS));
    expect(ctx.stage.querySelectorAll('.orchestra-active').length).toBe(3);
    expect(drum).toHaveBeenCalled();
    expect(note).toHaveBeenCalled();

    down(ctx.stage.querySelector('.orchestra-stop'));
    expect(tick).toHaveBeenCalledTimes(4);
    expect(ctx.stage.querySelectorAll('.orchestra-active').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.orchestra-dance').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.orchestra-beat').length).toBe(0);
    for (const p of PARTS) expect(tile(ctx, p.id).getAttribute('aria-pressed')).toBe('false');
    expect(root(ctx).classList.contains('orchestra-playing')).toBe(false);
    const d = drum.mock.calls.length;
    const n = note.mock.calls.length;
    vi.advanceTimersByTime(steps(STEPS * 4));
    expect(drum.mock.calls.length).toBe(d);
    expect(note.mock.calls.length).toBe(n);

    // A fresh tap restarts the band from step 0 (kick first).
    down(tile(ctx, 'bear'));
    expect(root(ctx).classList.contains('orchestra-playing')).toBe(true);
    vi.advanceTimersByTime(steps(1));
    expect(drum.mock.calls.length).toBe(d + 1);
    expect(drum).toHaveBeenLastCalledWith('kick');
    ctx.cleanup();
  });

  it('keeps counting silently after the last animal leaves, then stops after 8 empty bars', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    down(tile(ctx, 'bear'));
    vi.advanceTimersByTime(steps(4)); // steps 0..3
    down(tile(ctx, 'bear'));
    const before = drum.mock.calls.length;
    vi.advanceTimersByTime(steps(2)); // steps 4, 5: silent
    expect(drum.mock.calls.length).toBe(before);
    expect(root(ctx).classList.contains('orchestra-playing')).toBe(true);
    // Re-adding keeps the same clock: the next sound is step 6's hat, not a restarted kick.
    down(tile(ctx, 'bear'));
    vi.advanceTimersByTime(steps(1));
    expect(drum.mock.calls.length).toBe(before + 1);
    expect(drum).toHaveBeenLastCalledWith('hat');
    down(tile(ctx, 'bear'));

    // The rest of this bar plus seven empty bars: still running, still silent.
    const after = drum.mock.calls.length;
    vi.advanceTimersByTime(steps(STEPS * SILENT_BARS - 7));
    expect(root(ctx).classList.contains('orchestra-playing')).toBe(true);
    expect(drum.mock.calls.length).toBe(after);
    // The eighth empty bar in a row: the sequencer gives up.
    vi.advanceTimersByTime(steps(1));
    expect(root(ctx).classList.contains('orchestra-playing')).toBe(false);
    vi.advanceTimersByTime(steps(STEPS));
    expect(drum.mock.calls.length).toBe(after);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('awards one star after 60 s with three animals playing, and only once', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const jingle = vi.spyOn(ctx.audio, 'jingle');
    game.start(ctx);
    // Two animals are not a band yet: no star, however long they play.
    down(tile(ctx, 'bear'));
    down(tile(ctx, 'frog'));
    vi.advanceTimersByTime(STAR_AFTER_MS + 5000);
    expect(ctx.stars).toBe(0);

    down(tile(ctx, 'cat'));
    vi.advanceTimersByTime(STAR_AFTER_MS - 1000);
    expect(ctx.stars).toBe(0);
    expect(ctx.stage.querySelector('.orchestra-star')).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(ctx.stars).toBe(1);
    expect(jingle).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelectorAll('.orchestra-star').length).toBe(1);
    expect(ctx.stage.querySelector('.orchestra-star')!.textContent).toBe('⭐');
    vi.advanceTimersByTime(1000);
    expect(ctx.stage.querySelectorAll('.orchestra-star').length).toBe(0);
    // Once per session.
    vi.advanceTimersByTime(STAR_AFTER_MS * 2);
    expect(ctx.stars).toBe(1);
    expect(jingle).toHaveBeenCalledTimes(1);
    ctx.cleanup();
  });

  it('idle hint wiggles an animal that is not playing; the intro is left to the shell', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    down(tile(ctx, 'bear'));
    down(tile(ctx, 'monkey'));
    expect(ctx.stage.querySelector('.orchestra-nudge')).toBeNull();
    vi.advanceTimersByTime(6100);
    const nudged = ctx.stage.querySelectorAll<HTMLElement>('.orchestra-nudge');
    expect(nudged.length).toBe(1);
    const owner = nudged[0]!.closest<HTMLElement>('.orchestra-animal')!;
    expect(owner.classList.contains('orchestra-active')).toBe(false);
    expect(ctx.spoken).toEqual([]);
    ctx.cleanup();
  });

  it('cleanup stops the band and leaves no timers behind', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const drum = vi.spyOn(ctx.audio, 'drum');
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    down(tile(ctx, 'bear'));
    down(tile(ctx, 'cat'));
    down(tile(ctx, 'bird'));
    vi.advanceTimersByTime(steps(5));
    const d = drum.mock.calls.length;
    const n = note.mock.calls.length;
    expect(d).toBeGreaterThan(0);
    expect(n).toBeGreaterThan(0);
    expect(() => ctx.cleanup()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(STAR_AFTER_MS * 2);
    expect(drum.mock.calls.length).toBe(d);
    expect(note.mock.calls.length).toBe(n);
    expect(ctx.stars).toBe(0);
  });
});
