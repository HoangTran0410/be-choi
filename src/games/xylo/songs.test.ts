import { describe, it, expect } from 'vitest';
import { SCALE_C, SONGS } from '../../core/music';
import { ALL_SONGS, EXTRA_SONGS } from './songs';

describe('xylo songs', () => {
  it('adds at least 3 extra songs with the expected titles', () => {
    expect(EXTRA_SONGS.length).toBeGreaterThanOrEqual(3);
    const titles = EXTRA_SONGS.map((s) => s.title);
    expect(titles).toEqual(expect.arrayContaining(['Chèo thuyền', 'Bánh nướng', 'Mưa ơi đi đi']));
  });

  it('every note is in SCALE_C or a rest with a positive duration', () => {
    for (const s of EXTRA_SONGS) {
      expect(s.notes.length).toBeGreaterThan(8);
      expect(s.bpm).toBeGreaterThan(0);
      for (const n of s.notes) {
        expect(n.n === 'R' || SCALE_C.includes(n.n)).toBe(true);
        expect(Number.isFinite(n.d)).toBe(true);
        expect(n.d).toBeGreaterThan(0);
      }
    }
  });

  it('ALL_SONGS is SONGS then EXTRA_SONGS with unique ids and non-empty titles/icons', () => {
    expect(ALL_SONGS).toEqual([...SONGS, ...EXTRA_SONGS]);
    expect(ALL_SONGS.length).toBe(SONGS.length + EXTRA_SONGS.length);
    expect(new Set(ALL_SONGS.map((s) => s.id)).size).toBe(ALL_SONGS.length);
    for (const s of ALL_SONGS) {
      expect(s.id.trim().length).toBeGreaterThan(0);
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.icon.trim().length).toBeGreaterThan(0);
    }
  });
});
