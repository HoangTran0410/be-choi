import { describe, it, expect, vi } from 'vitest';
import { fitsScale, findSong, hasLyrics, noteFreq, phraseAt, SCALE_C, scaleIndex, schedule, SONGS, totalBeats } from './music';

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
  it('songs have playable notes and positive durations', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(5);
    for (const s of SONGS) {
      expect(s.notes.length).toBeGreaterThan(8);
      for (const n of s.notes) {
        expect(n.n === 'R' || noteFreq(n.n) > 0).toBe(true);
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

describe('the shared songbook', () => {
  it('holds unique songs that all have a title, an icon and a tempo', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(9);
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
    for (const song of SONGS) {
      expect(song.title.trim().length).toBeGreaterThan(0);
      expect(song.icon.trim().length).toBeGreaterThan(0);
      expect(song.bpm).toBeGreaterThan(0);
      expect(song.notes.length).toBeGreaterThan(8);
    }
  });
});

describe('fitsScale', () => {
  it('keeps the wide songs off the eight xylophone bars', () => {
    expect(fitsScale({ id: 'x', title: 'x', icon: 'x', bpm: 100, notes: [{ n: 'C4', d: 1 }, { n: 'R', d: 1 }] })).toBe(true);
    expect(fitsScale({ id: 'x', title: 'x', icon: 'x', bpm: 100, notes: [{ n: 'C4', d: 1 }, { n: 'D5', d: 1 }] })).toBe(false);
    const playable = SONGS.filter(fitsScale);
    expect(playable.length).toBeGreaterThanOrEqual(6);
    expect(playable.map((s) => s.id)).toContain('chaulenba');
    expect(playable.map((s) => s.id)).not.toContain('canha');
  });
});

describe('lyrics', () => {
  const sung = SONGS.filter(hasLyrics);

  it('are on the songs a Vietnamese family sings, and not on the plain melodies', () => {
    expect(sung.length).toBeGreaterThanOrEqual(6);
    const ids = sung.map((s) => s.id);
    expect(ids).toContain('chaulenba');
    expect(ids).toContain('canha');
    // These are nice tunes with no Vietnamese words of their own: play them, do not sing them.
    for (const id of ['twinkle', 'lamb', 'bridge', 'farmer', 'row', 'buns', 'rain']) {
      expect(ids).not.toContain(id);
      expect(hasLyrics(findSong(id) as never)).toBe(false);
    }
  });

  it('last exactly as long as their melody, so the highlight lands with the tune', () => {
    for (const song of sung) {
      const melody = song.notes.reduce((sum, n) => sum + n.d, 0);
      expect(totalBeats(song.lyrics)).toBeCloseTo(melody, 5);
    }
  });

  it('give every line a picture, words and a length', () => {
    for (const song of sung) {
      for (const phrase of song.lyrics) {
        expect(phrase.emoji.length).toBeGreaterThan(0);
        expect(phrase.text.length).toBeGreaterThan(0);
        expect(phrase.beats).toBeGreaterThan(0);
      }
    }
  });
});

describe('phraseAt', () => {
  const phrases = [
    { emoji: 'a', text: 'a', beats: 4 },
    { emoji: 'b', text: 'b', beats: 4 },
    { emoji: 'c', text: 'c', beats: 2 },
  ];

  it('starts on the first line and steps on each line\'s first beat', () => {
    expect(phraseAt(phrases, 0)).toBe(0);
    expect(phraseAt(phrases, 3.5)).toBe(0);
    expect(phraseAt(phrases, 4)).toBe(1);
    expect(phraseAt(phrases, 8)).toBe(2);
  });

  it('holds the last line past the end and copes with no words at all', () => {
    expect(phraseAt(phrases, 999)).toBe(2);
    expect(phraseAt([], 4)).toBe(0);
    expect(totalBeats([])).toBe(0);
  });
});
