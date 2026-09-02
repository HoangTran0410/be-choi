import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { noteFreq, SONGS } from '../../core/music';
import { advance, BARS, expectedBar, REC_MAX_MS, serializeRec } from './logic';
import { ALL_SONGS } from './songs';
import game from './index';

const REC_KEY = 'be-choi:xylo-rec';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
      this.isPrimary = i.isPrimary ?? true;
    }
  };
}

function ptr(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId, button: 0, isPrimary: true, bubbles: true });
}

function click(el: Element): void {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

const hadElementFromPoint = typeof document.elementFromPoint === 'function';

describe('xylo game', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.removeItem(REC_KEY);
    if (!hadElementFromPoint) delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it('mounts 8 bars and the song strip, plays a note on tap, floats a note, cleans up', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    const bars = ctx.stage.querySelectorAll<HTMLElement>('.xylo-bar');
    expect(bars.length).toBe(8);
    expect(ctx.stage.querySelectorAll('.xylo-song').length).toBe(ALL_SONGS.length);
    expect(ALL_SONGS.length).toBeGreaterThan(SONGS.length);
    expect(ctx.stage.querySelectorAll('.xylo-play').length).toBe(1);
    expect(ctx.stage.querySelectorAll('.xylo-rec').length).toBe(1);
    expect(ctx.stage.querySelectorAll('.xylo-glow').length).toBe(0);

    const first = bars[0]!;
    first.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenCalledWith(expect.closeTo(261.63, 1), 0.8, 'xylo');
    expect(first.querySelector('.xylo-bar-face')!.classList.contains('anim-bounce')).toBe(true);

    // A real pointer event carries coordinates, so a floating note spawns and is removed later.
    const last = bars[7]!;
    last.dispatchEvent(ptr('pointerdown', 40, 50, 2));
    expect(note).toHaveBeenLastCalledWith(expect.closeTo(noteFreq('C5'), 1), 0.8, 'xylo');
    expect(ctx.stage.querySelectorAll('.xylo-note').length).toBe(1);
    vi.advanceTimersByTime(800);
    expect(ctx.stage.querySelectorAll('.xylo-note').length).toBe(0);
    window.dispatchEvent(ptr('pointerup', 40, 50, 2));

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('plays the new bar when a finger slides across bars', () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    const bars = ctx.stage.querySelectorAll<HTMLElement>('.xylo-bar');
    let under: Element | null = bars[0]!;
    (document as { elementFromPoint?: unknown }).elementFromPoint = () => under;

    bars[0]!.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(note).toHaveBeenCalledTimes(1);
    window.dispatchEvent(ptr('pointermove', 12, 12));
    expect(note).toHaveBeenCalledTimes(1);

    under = bars[3]!.querySelector('.xylo-bar-face');
    window.dispatchEvent(ptr('pointermove', 300, 10));
    expect(note).toHaveBeenCalledTimes(2);
    expect(note).toHaveBeenLastCalledWith(expect.closeTo(noteFreq(BARS[3]!), 1), 0.8, 'xylo');

    under = document.body;
    window.dispatchEvent(ptr('pointermove', 300, 900));
    expect(note).toHaveBeenCalledTimes(2);

    under = bars[5]!;
    window.dispatchEvent(ptr('pointermove', 500, 10));
    expect(note).toHaveBeenCalledTimes(3);
    window.dispatchEvent(ptr('pointercancel', 500, 10));
    window.dispatchEvent(ptr('pointermove', 10, 10));
    expect(note).toHaveBeenCalledTimes(3);
    ctx.cleanup();
  });

  it('song mode: glows the expected bar, moves on correct taps, celebrates at the end', async () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    const song = SONGS[0]!;
    const bars = ctx.stage.querySelectorAll<HTMLElement>('.xylo-bar');
    const songBtn = ctx.stage.querySelector<HTMLElement>('.xylo-song')!;

    click(songBtn);
    expect(ctx.spoken).toContain(song.title);
    expect(songBtn.classList.contains('active')).toBe(true);
    let exp = expectedBar(song, 0)!;
    let glowing = ctx.stage.querySelectorAll<HTMLElement>('.xylo-glow');
    expect(glowing.length).toBe(1);
    expect(glowing[0]).toBe(bars[exp.bar]);
    expect(bars[exp.bar]!.querySelector('.xylo-finger')).not.toBeNull();

    // A wrong bar plays its note but does not move the glow.
    const wrong = (exp.bar + 1) % 8;
    bars[wrong]!.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(note).toHaveBeenCalledTimes(1);
    expect(ctx.stage.querySelector('.xylo-glow')).toBe(bars[exp.bar]);

    // Tap the glowing bar until the expected bar changes: the glow follows it.
    let index = 0;
    let steps = 0;
    while (expectedBar(song, index)!.bar === exp.bar) {
      bars[exp.bar]!.dispatchEvent(ptr('pointerdown', 10, 10));
      index = advance(song, index, exp.bar).index;
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
    exp = expectedBar(song, index)!;
    glowing = ctx.stage.querySelectorAll<HTMLElement>('.xylo-glow');
    expect(glowing.length).toBe(1);
    expect(glowing[0]).toBe(bars[exp.bar]);
    expect(bars[exp.bar]!.querySelector('.xylo-finger')).not.toBeNull();

    // Finish the song.
    let done = false;
    while (!done) {
      const e = expectedBar(song, index)!;
      bars[e.bar]!.dispatchEvent(ptr('pointerdown', 10, 10));
      const r = advance(song, index, e.bar);
      index = r.index;
      done = r.done;
    }
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stage.querySelectorAll('.xylo-glow').length).toBe(0);
    expect(ctx.stage.querySelector('.xylo-finger')).toBeNull();
    expect(songBtn.classList.contains('active')).toBe(false);
    await Promise.resolve();
    expect(ctx.stars).toBe(1);

    // Back in free play: a tap just plays.
    const before = note.mock.calls.length;
    bars[0]!.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(note).toHaveBeenCalledTimes(before + 1);
    expect(ctx.stage.querySelectorAll('.xylo-glow').length).toBe(0);
    ctx.cleanup();
  });

  it('idle hint wiggles the expected bar only in song mode', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(7000);
    expect(ctx.stage.querySelector('.anim-wiggle')).toBeNull();
    click(ctx.stage.querySelector('.xylo-song')!);
    vi.advanceTimersByTime(6100);
    const face = ctx.stage.querySelector('.xylo-glow .xylo-bar-face')!;
    expect(face.classList.contains('anim-wiggle')).toBe(true);
    ctx.cleanup();
  });

  it('▶ plays the song with fake timers, ⏸ stops it, cleanup cancels playback', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    const play = ctx.stage.querySelector<HTMLElement>('.xylo-play')!;
    const song = SONGS[0]!;
    const beat = 60000 / song.bpm;
    const firstNote = song.notes[0]!;

    click(play);
    expect(play.textContent).toBe('⏸');
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(
      expect.closeTo(noteFreq(firstNote.n), 1),
      expect.closeTo((firstNote.d * beat) / 1000 * 0.9, 3),
      'xylo',
    );
    expect(ctx.stage.querySelectorAll('.xylo-lit').length).toBe(1);
    vi.advanceTimersByTime(250);
    expect(ctx.stage.querySelectorAll('.xylo-lit').length).toBe(0);
    vi.advanceTimersByTime(beat * 3);
    expect(note.mock.calls.length).toBeGreaterThan(2);

    const played = note.mock.calls.length;
    click(play);
    expect(play.textContent).toBe('▶');
    vi.advanceTimersByTime(beat * 10);
    expect(note).toHaveBeenCalledTimes(played);

    // Playback runs to the end on its own and resets the button.
    click(play);
    const total = song.notes.reduce((sum, n) => sum + n.d, 0) * beat;
    vi.advanceTimersByTime(total + 100);
    expect(play.textContent).toBe('▶');

    // Selecting a song stops playback; playback never moves the song-mode glow.
    click(play);
    click(ctx.stage.querySelector('.xylo-song')!);
    expect(play.textContent).toBe('▶');
    click(play);
    const glow = ctx.stage.querySelector('.xylo-glow');
    vi.advanceTimersByTime(beat * 4);
    expect(ctx.stage.querySelector('.xylo-glow')).toBe(glow);

    const n = note.mock.calls.length;
    ctx.cleanup();
    vi.advanceTimersByTime(beat * 10);
    expect(note).toHaveBeenCalledTimes(n);
  });

  it('⏺ records strikes, 🔁 replays them at the recorded offsets, and the recording persists', () => {
    vi.useFakeTimers();
    localStorage.removeItem(REC_KEY);
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    const bars = ctx.stage.querySelectorAll<HTMLElement>('.xylo-bar');
    const rec = ctx.stage.querySelector<HTMLElement>('.xylo-rec')!;
    const rep = ctx.stage.querySelector<HTMLElement>('.xylo-replay')!;
    expect(rec.textContent).toBe('⏺');
    expect(rep.hidden).toBe(true);

    click(rec);
    expect(rec.classList.contains('xylo-recording')).toBe(true);
    expect(ctx.spoken).toContain('Bé chơi đi, đàn đang ghi');
    bars[0]!.dispatchEvent(ptr('pointerdown', 10, 10));
    now = 1500;
    bars[4]!.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(note).toHaveBeenCalledTimes(2);
    click(rec);
    expect(rec.classList.contains('xylo-recording')).toBe(false);
    expect(rep.hidden).toBe(false);
    expect(rep.textContent).toBe('🔁');
    const expected = [
      { bar: 0, t: 0 },
      { bar: 4, t: 500 },
    ];
    expect(localStorage.getItem(REC_KEY)).toBe(serializeRec(expected));

    // Replay: the two notes at 0 ms and 500 ms, each lighting its bar.
    note.mockClear();
    click(rep);
    expect(rep.textContent).toBe('⏹');
    expect(rep.classList.contains('xylo-replaying')).toBe(true);
    vi.advanceTimersByTime(0);
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(expect.closeTo(noteFreq('C4'), 1), 0.8, 'xylo');
    expect(bars[0]!.classList.contains('xylo-lit')).toBe(true);
    vi.advanceTimersByTime(499);
    expect(note).toHaveBeenCalledTimes(1);
    expect(bars[0]!.classList.contains('xylo-lit')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(note).toHaveBeenCalledTimes(2);
    expect(note).toHaveBeenLastCalledWith(expect.closeTo(noteFreq('G4'), 1), 0.8, 'xylo');
    expect(bars[4]!.classList.contains('xylo-lit')).toBe(true);
    // Replayed strikes never advance a song (no song selected: no glow appears).
    expect(ctx.stage.querySelectorAll('.xylo-glow').length).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(rep.textContent).toBe('🔁');
    expect(note).toHaveBeenCalledTimes(2);

    // ⏹ cancels a running replay.
    click(rep);
    vi.advanceTimersByTime(0);
    expect(note).toHaveBeenCalledTimes(3);
    expect(rep.textContent).toBe('⏹');
    click(rep);
    expect(rep.textContent).toBe('🔁');
    vi.advanceTimersByTime(5000);
    expect(note).toHaveBeenCalledTimes(3);

    // ▶ stops the replay; 🔁 stops ▶.
    click(rep);
    click(ctx.stage.querySelector<HTMLElement>('.xylo-play')!);
    expect(rep.textContent).toBe('🔁');
    click(rep);
    expect(ctx.stage.querySelector<HTMLElement>('.xylo-play')!.textContent).toBe('▶');
    ctx.cleanup();
    vi.advanceTimersByTime(5000);
    expect(note).toHaveBeenCalledTimes(4);

    // A fresh start with the key present offers 🔁 immediately and replays the same strikes.
    const ctx2 = fakeContext();
    const note2 = vi.spyOn(ctx2.audio, 'note');
    game.start(ctx2);
    const rep2 = ctx2.stage.querySelector<HTMLElement>('.xylo-replay')!;
    expect(rep2.hidden).toBe(false);
    click(rep2);
    vi.advanceTimersByTime(500);
    expect(note2).toHaveBeenCalledTimes(2);
    ctx2.cleanup();
  });

  it('recording stops after REC_MAX_MS or when leaving; an empty recording keeps the old one', () => {
    vi.useFakeTimers();
    localStorage.setItem(REC_KEY, serializeRec([{ bar: 2, t: 0 }]));
    vi.spyOn(performance, 'now').mockImplementation(() => 0);
    const ctx = fakeContext();
    game.start(ctx);
    const bars = ctx.stage.querySelectorAll<HTMLElement>('.xylo-bar');
    const rec = ctx.stage.querySelector<HTMLElement>('.xylo-rec')!;
    const rep = ctx.stage.querySelector<HTMLElement>('.xylo-replay')!;
    expect(rep.hidden).toBe(false);

    // Nothing struck: the previous recording stays.
    click(rec);
    click(rec);
    expect(localStorage.getItem(REC_KEY)).toBe(serializeRec([{ bar: 2, t: 0 }]));

    // Time limit.
    click(rec);
    bars[6]!.dispatchEvent(ptr('pointerdown', 10, 10));
    vi.advanceTimersByTime(REC_MAX_MS - 1);
    expect(rec.classList.contains('xylo-recording')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(rec.classList.contains('xylo-recording')).toBe(false);
    expect(localStorage.getItem(REC_KEY)).toBe(serializeRec([{ bar: 6, t: 0 }]));

    // Leaving mid-recording saves what was struck.
    click(rec);
    bars[1]!.dispatchEvent(ptr('pointerdown', 10, 10));
    ctx.cleanup();
    expect(localStorage.getItem(REC_KEY)).toBe(serializeRec([{ bar: 1, t: 0 }]));
  });

  it('starts without 🔁 when the stored recording is garbage', () => {
    localStorage.setItem(REC_KEY, '{oops');
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelector<HTMLElement>('.xylo-replay')!.hidden).toBe(true);
    ctx.cleanup();
  });
});
