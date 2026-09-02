import { describe, it, expect, vi, afterEach } from 'vitest';
import { INSTRUMENTS, QUIZ_ROUNDS, isDrumKind, makeQuizRound, playPhrase } from './logic';
import { DRUMS, TIMBRES } from '../../core/audio';
import { mulberry32 } from '../../core/dom';
import { noteFreq } from '../../core/music';
import { fakeAudio } from '../../core/testing';

function inst(id: string) {
  const found = INSTRUMENTS.find((i) => i.id === id);
  if (!found) throw new Error(`missing instrument ${id}`);
  return found;
}

describe('band logic', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has 7 instruments with distinct ids, emojis and names', () => {
    expect(INSTRUMENTS.length).toBe(7);
    expect(new Set(INSTRUMENTS.map((i) => i.id)).size).toBe(7);
    expect(new Set(INSTRUMENTS.map((i) => i.emoji)).size).toBe(7);
    expect(new Set(INSTRUMENTS.map((i) => i.name)).size).toBe(7);
    for (const i of INSTRUMENTS) {
      expect(i.name.length).toBeGreaterThan(0);
      expect(i.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(i.bpm).toBeGreaterThan(0);
      expect(i.phrase.length).toBeGreaterThan(0);
      for (const n of i.phrase) expect(n.d).toBeGreaterThan(0);
    }
  });

  it('melodic phrases use valid note names or rests; the drum phrase uses drum kinds', () => {
    for (const i of INSTRUMENTS) {
      if (i.timbre === 'drum') {
        for (const n of i.phrase) expect(DRUMS).toContain(n.n);
        continue;
      }
      expect(TIMBRES).toContain(i.timbre);
      for (const n of i.phrase) {
        if (n.n === 'R') continue;
        expect(noteFreq(n.n)).toBeGreaterThan(0);
      }
    }
    expect(isDrumKind('kick')).toBe(true);
    expect(isDrumKind('C4')).toBe(false);
  });

  it('asks 5 questions per set', () => {
    expect(QUIZ_ROUNDS).toBe(5);
  });

  it('makeQuizRound: 3 distinct options including the answer', () => {
    for (let seed = 0; seed < 80; seed++) {
      const r = makeQuizRound(mulberry32(seed));
      expect(r.options.length).toBe(3);
      expect(new Set(r.options.map((o) => o.id)).size).toBe(3);
      expect(r.options.filter((o) => o.id === r.answer.id).length).toBe(1);
      expect(INSTRUMENTS).toContain(r.answer);
    }
  });

  it('makeQuizRound never answers with the excluded instrument', () => {
    for (const ex of INSTRUMENTS) {
      for (let seed = 0; seed < 30; seed++) {
        expect(makeQuizRound(mulberry32(seed), ex.id).answer.id).not.toBe(ex.id);
      }
    }
    // Every other instrument can still be the answer.
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) seen.add(makeQuizRound(mulberry32(seed), 'piano').answer.id);
    expect(seen.size).toBe(6);
  });

  it('playPhrase plays each melodic note with the instrument timbre, then reports done', () => {
    vi.useFakeTimers();
    const audio = fakeAudio();
    const note = vi.spyOn(audio, 'note');
    const drum = vi.spyOn(audio, 'drum');
    const onStep = vi.fn();
    const onDone = vi.fn();
    // C4 E4 G4 C5:2 at 120 bpm: 500 + 500 + 500 + 1000 ms.
    playPhrase(audio, inst('piano'), onStep, onDone);
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenLastCalledWith(noteFreq('C4'), expect.closeTo(0.45, 5), 'piano');
    expect(onStep).toHaveBeenLastCalledWith(0);
    vi.advanceTimersByTime(1500);
    expect(note).toHaveBeenCalledTimes(4);
    expect(note).toHaveBeenLastCalledWith(noteFreq('C5'), expect.closeTo(0.9, 5), 'piano');
    expect(onStep.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3]);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenCalledTimes(4);
    expect(drum).not.toHaveBeenCalled();
  });

  it('playPhrase uses drum() for the drum kit', () => {
    vi.useFakeTimers();
    const audio = fakeAudio();
    const note = vi.spyOn(audio, 'note');
    const drum = vi.spyOn(audio, 'drum');
    const onDone = vi.fn();
    const kit = inst('drum');
    playPhrase(audio, kit, undefined, onDone);
    expect(drum).toHaveBeenCalledTimes(1);
    expect(drum).toHaveBeenLastCalledWith('kick');
    vi.advanceTimersByTime(60000);
    expect(drum).toHaveBeenCalledTimes(kit.phrase.length);
    expect(drum.mock.calls.map((c) => c[0])).toEqual(kit.phrase.map((n) => n.n));
    expect(note).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('cancel stops the phrase and skips onDone', () => {
    vi.useFakeTimers();
    const audio = fakeAudio();
    const note = vi.spyOn(audio, 'note');
    const onDone = vi.fn();
    const cancel = playPhrase(audio, inst('bell'), undefined, onDone);
    expect(note).toHaveBeenCalledTimes(1);
    cancel();
    vi.advanceTimersByTime(60000);
    expect(note).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});
