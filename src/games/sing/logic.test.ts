import { describe, it, expect } from 'vitest';
import { SONGS } from '../../core/music';
import { AUDIENCE, LYRICS, NOTE_EMOJI, phraseIndexAt, phrasesFor, pitchBand, totalBeats } from './logic';

describe('lyrics', () => {
  it('cover every song the picker offers', () => {
    for (const song of SONGS) expect(phrasesFor(song.id).length).toBeGreaterThan(0);
  });

  it('last exactly as long as the melody, so the highlight lands with the tune', () => {
    for (const song of SONGS) {
      const melody = song.notes.reduce((sum, n) => sum + n.d, 0);
      expect(totalBeats(phrasesFor(song.id))).toBe(melody);
    }
  });

  it('gives every line an emoji and words', () => {
    for (const phrases of Object.values(LYRICS)) {
      for (const p of phrases) {
        expect(p.emoji.length).toBeGreaterThan(0);
        expect(p.text.length).toBeGreaterThan(0);
        expect(p.beats).toBeGreaterThan(0);
      }
    }
  });
});

describe('phraseIndexAt', () => {
  const phrases = phrasesFor('butterfly');

  it('starts on the first line', () => {
    expect(phraseIndexAt(phrases, 0)).toBe(0);
    expect(phraseIndexAt(phrases, 3.5)).toBe(0);
  });

  it('steps to the next line on its first beat', () => {
    expect(phraseIndexAt(phrases, 4)).toBe(1);
    expect(phraseIndexAt(phrases, 8)).toBe(2);
  });

  it('holds the last line past the end and copes with no lyrics', () => {
    expect(phraseIndexAt(phrases, 999)).toBe(phrases.length - 1);
    expect(phraseIndexAt([], 4)).toBe(0);
  });
});

describe('pitchBand', () => {
  it('splits low, middle and high, and treats silence as middle', () => {
    expect(pitchBand(180)).toBe(0);
    expect(pitchBand(330)).toBe(1);
    expect(pitchBand(600)).toBe(2);
    expect(pitchBand(null)).toBe(1);
    expect(pitchBand(Number.NaN)).toBe(1);
  });

  it('always picks a note emoji that exists', () => {
    for (const hz of [100, 300, 800, null]) expect(NOTE_EMOJI[pitchBand(hz)]).toBeDefined();
  });
});

describe('audience', () => {
  it('is a small row of distinct animals', () => {
    expect(AUDIENCE.length).toBe(6);
    expect(new Set(AUDIENCE).size).toBe(AUDIENCE.length);
  });
});
