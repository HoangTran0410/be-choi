import { describe, it, expect, vi } from 'vitest';
import { noteFreq, SCALE_C, scaleIndex, SONGS, schedule, findSong } from './music';

describe('music', () => {
  it('converts note names to frequencies', () => {
    expect(noteFreq('A4')).toBe(440);
    expect(noteFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteFreq('C5')).toBeCloseTo(523.25, 1);
    expect(noteFreq('F#4')).toBeCloseTo(369.99, 1);
    expect(noteFreq('Bb3')).toBeCloseTo(233.08, 1);
    expect(noteFreq('R')).toBe(0);
    expect(noteFreq('nope')).toBe(0);
  });
  it('scale has 8 ascending bars', () => {
    expect(SCALE_C.length).toBe(8);
    for (let i = 1; i < SCALE_C.length; i++) expect(noteFreq(SCALE_C[i]!)).toBeGreaterThan(noteFreq(SCALE_C[i - 1]!));
    expect(scaleIndex('G4')).toBe(4);
    expect(scaleIndex('G3')).toBe(-1);
  });
  it('songs only use scale notes or rests, with positive durations', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(5);
    for (const s of SONGS) {
      expect(s.notes.length).toBeGreaterThan(8);
      for (const n of s.notes) {
        expect(n.n === 'R' || SCALE_C.includes(n.n)).toBe(true);
        expect(n.d).toBeGreaterThan(0);
      }
    }
    expect(findSong('twinkle')?.title).toBe('Ngôi sao lấp lánh');
  });
  it('schedule steps notes at tempo and can be cancelled', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const done = vi.fn();
    const cancel = schedule([{ n: 'C4', d: 1 }, { n: 'D4', d: 0.5 }, { n: 'E4', d: 2 }], 120, (i, _n, ms) => seen.push(i, ms), done);
    expect(seen).toEqual([0, 500]);
    vi.advanceTimersByTime(500);
    expect(seen).toEqual([0, 500, 1, 250]);
    vi.advanceTimersByTime(250);
    expect(seen.length).toBe(6);
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledTimes(1);
    const seen2: number[] = [];
    const cancel2 = schedule([{ n: 'C4', d: 1 }, { n: 'D4', d: 1 }], 60, (i) => seen2.push(i));
    cancel2();
    vi.advanceTimersByTime(5000);
    expect(seen2).toEqual([0]);
    cancel();
    vi.useRealTimers();
  });
});
