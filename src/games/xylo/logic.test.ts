import { describe, it, expect } from 'vitest';
import { SONGS, type Song } from '../../core/music';
import { advance, BAR_COLORS, BARS, barLength, expectedBar } from './logic';

const tiny: Song = {
  id: 'tiny',
  title: 'Bài nhỏ',
  icon: '🎵',
  bpm: 120,
  notes: [
    { n: 'C4', d: 1 },
    { n: 'R', d: 1 },
    { n: 'E4', d: 1 },
    { n: 'R', d: 2 },
  ],
};

describe('xylo logic', () => {
  it('has 8 bars from C4 to C5 with 8 distinct hex colours', () => {
    expect(BARS.length).toBe(8);
    expect(BARS[0]).toBe('C4');
    expect(BARS[7]).toBe('C5');
    expect(BAR_COLORS.length).toBe(8);
    expect(new Set(BAR_COLORS).size).toBe(8);
    for (const c of BAR_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('bar lengths go from 100% down to 62%, strictly decreasing', () => {
    expect(barLength(0)).toBe(100);
    expect(barLength(7)).toBe(62);
    for (let i = 1; i < 8; i++) expect(barLength(i)).toBeLessThan(barLength(i - 1));
  });

  it('expectedBar skips rests and returns null at the end', () => {
    expect(expectedBar(tiny, 0)).toEqual({ bar: 0, index: 0 });
    expect(expectedBar(tiny, 1)).toEqual({ bar: 2, index: 2 });
    expect(expectedBar(tiny, 2)).toEqual({ bar: 2, index: 2 });
    expect(expectedBar(tiny, 3)).toBeNull();
    expect(expectedBar(tiny, 99)).toBeNull();
  });

  it('advance moves past the expected note, ignores wrong bars, reports done', () => {
    expect(advance(tiny, 0, 5)).toEqual({ index: 0, correct: false, done: false });
    expect(advance(tiny, 0, 0)).toEqual({ index: 1, correct: true, done: false });
    expect(advance(tiny, 1, 0)).toEqual({ index: 1, correct: false, done: false });
    expect(advance(tiny, 1, 2)).toEqual({ index: 3, correct: true, done: true });
    expect(advance(tiny, 3, 2)).toEqual({ index: 3, correct: false, done: true });
  });

  it('plays through SONGS[0] one expected bar at a time', () => {
    const song = SONGS[0]!;
    const playable = song.notes.filter((n) => n.n !== 'R').length;
    let index = 0;
    let taps = 0;
    let done = false;
    while (!done) {
      const exp = expectedBar(song, index);
      expect(exp).not.toBeNull();
      const r = advance(song, index, exp!.bar);
      expect(r.correct).toBe(true);
      index = r.index;
      done = r.done;
      taps++;
      expect(taps).toBeLessThanOrEqual(playable);
    }
    expect(taps).toBe(playable);
    expect(expectedBar(song, index)).toBeNull();
  });
});
