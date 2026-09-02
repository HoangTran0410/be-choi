import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { INSTRUMENTS, QUIZ_ROUNDS } from './logic';
import game from './index';

function down(el: Element | null): void {
  if (!el) throw new Error('missing element');
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

function tile(stage: HTMLElement, id: string): HTMLElement {
  const el = stage.querySelector<HTMLElement>(`.band-inst[data-id="${id}"]`);
  if (!el) throw new Error(`missing tile ${id}`);
  return el;
}

describe('band game', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts 7 tiles and the quiz button; a tap names the instrument and plays its phrase; cleans up', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.band-inst').length).toBe(7);
    expect(ctx.stage.querySelectorAll('.band-emoji').length).toBe(7);
    expect(ctx.stage.querySelector('.band-quiz')).not.toBeNull();
    expect(ctx.stage.querySelector<HTMLElement>('.band-replay')!.hidden).toBe(true);
    // Names are spoken, never shown as text.
    for (const t of ctx.stage.querySelectorAll('.band-inst')) expect(t.textContent!.trim().length).toBeLessThan(4);

    const piano = tile(ctx.stage, 'piano');
    down(piano);
    // The name is spoken only after the phrase, so the sound is not ducked by TTS on iOS.
    expect(ctx.spoken).not.toContain('đàn piano');
    expect(piano.classList.contains('band-playing')).toBe(true);
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), 'piano');
    // C4 E4 G4 C5:2 at 120 bpm = 2.5 s.
    vi.advanceTimersByTime(3000);
    expect(note).toHaveBeenCalledTimes(4);
    expect(piano.classList.contains('band-playing')).toBe(false);
    expect(ctx.spoken).toContain('đàn piano');

    // Tapping another tile cancels the running phrase; the drum kit uses drum().
    down(tile(ctx.stage, 'bell'));
    expect(note).toHaveBeenCalledTimes(5);
    const bell = tile(ctx.stage, 'bell');
    expect(bell.classList.contains('band-playing')).toBe(true);
    down(tile(ctx.stage, 'drum'));
    expect(bell.classList.contains('band-playing')).toBe(false);
    expect(tile(ctx.stage, 'drum').classList.contains('band-playing')).toBe(true);
    expect(drum).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(note).toHaveBeenCalledTimes(5);
    expect(drum).toHaveBeenCalledTimes(INSTRUMENTS.find((i) => i.id === 'drum')!.phrase.length);
    expect(ctx.spoken).toContain('trống');

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('quiz: 3 options, mystery phrase, replay, wrong shakes, right dings; 5 rounds earn a star', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    const drum = vi.spyOn(ctx.audio, 'drum');
    const ding = vi.spyOn(ctx.audio, 'ding');
    const boing = vi.spyOn(ctx.audio, 'boing');
    game.start(ctx);
    const root = ctx.stage.querySelector<HTMLElement>('.band')!;
    const replayBtn = ctx.stage.querySelector<HTMLElement>('.band-replay')!;
    const sounds = () => note.mock.calls.length + drum.mock.calls.length;
    const lit = () => [...ctx.stage.querySelectorAll<HTMLElement>('.band-inst:not(.band-dim)')];

    down(ctx.stage.querySelector('.band-quiz'));
    expect(ctx.spoken).toContain('Nghe xem đây là nhạc cụ gì nhé');
    expect(lit().length).toBe(3);
    expect(ctx.stage.querySelectorAll('.band-dim').length).toBe(4);
    expect(replayBtn.hidden).toBe(false);
    const first = root.dataset.answer!;
    expect(INSTRUMENTS.some((i) => i.id === first)).toBe(true);
    expect(lit().some((t) => t.dataset.id === first)).toBe(true);

    // The mystery phrase starts after the spoken question and never lights a tile.
    expect(sounds()).toBe(0);
    vi.advanceTimersByTime(1600);
    expect(sounds()).toBeGreaterThan(0);
    expect(ctx.stage.querySelector('.band-playing')).toBeNull();

    // 🔁 plays it again.
    const before = sounds();
    down(replayBtn);
    expect(sounds()).toBeGreaterThan(before);

    // Wrong option: boing, shake, phrase again, same question.
    const wrong = lit().find((t) => t.dataset.id !== first)!;
    down(wrong);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(wrong.classList.contains('anim-shake')).toBe(true);
    expect(root.dataset.answer).toBe(first);
    expect(ding).not.toHaveBeenCalled();

    let prev: string | undefined;
    for (let i = 0; i < QUIZ_ROUNDS; i++) {
      const id = root.dataset.answer!;
      expect(id).not.toBe(prev);
      prev = id;
      const answer = tile(ctx.stage, id);
      expect(answer.classList.contains('band-dim')).toBe(false);
      down(answer);
      expect(ding).toHaveBeenCalledTimes(i + 1);
      expect(ctx.spoken).toContain(INSTRUMENTS.find((x) => x.id === id)!.name);
      expect(answer.classList.contains('anim-bounce')).toBe(true);
      // Taps are ignored until the next round.
      down(answer);
      expect(ding).toHaveBeenCalledTimes(i + 1);
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    }
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    // Back to free mode.
    expect(root.dataset.answer).toBeUndefined();
    expect(ctx.stage.querySelectorAll('.band-dim').length).toBe(0);
    expect(replayBtn.hidden).toBe(true);
    expect(ctx.stage.querySelector('.band-quiz')!.classList.contains('band-on')).toBe(false);
    down(tile(ctx.stage, 'sax'));
    expect(ctx.spoken).toContain('kèn sắc-xô');
    expect(tile(ctx.stage, 'sax').classList.contains('band-playing')).toBe(true);
    ctx.cleanup();
  });

  it('🎧 during the quiz exits it and cancels the pending phrase', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    const drum = vi.spyOn(ctx.audio, 'drum');
    game.start(ctx);
    const quizBtn = ctx.stage.querySelector<HTMLElement>('.band-quiz')!;
    down(quizBtn);
    expect(quizBtn.classList.contains('band-on')).toBe(true);
    expect(ctx.stage.querySelectorAll('.band-dim').length).toBe(4);
    down(quizBtn);
    expect(quizBtn.classList.contains('band-on')).toBe(false);
    expect(ctx.stage.querySelectorAll('.band-dim').length).toBe(0);
    expect(ctx.stage.querySelector<HTMLElement>('.band-replay')!.hidden).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(note.mock.calls.length + drum.mock.calls.length).toBe(0);
    // Free mode again: tapping any tile plays it.
    down(tile(ctx.stage, 'violin'));
    expect(note).toHaveBeenCalledTimes(1);
    ctx.cleanup();
    // Cleanup cancelled the phrase: nothing more plays.
    vi.advanceTimersByTime(10000);
    expect(note).toHaveBeenCalledTimes(1);
  });
});
