import { describe, it, expect } from 'vitest';
import { LETTERS, DIGITS, COUNTABLES, pages, chunk, pageDone, initialOf, splitWord, lowerOf, isDigit } from './logic';

describe('letters logic', () => {
  it('has the 29 Vietnamese letters and 10 digits, all complete and unique', () => {
    expect(LETTERS.length).toBe(29);
    expect(DIGITS.length).toBe(10);
    const labels = [...LETTERS, ...DIGITS].map((x) => x.label);
    expect(new Set(labels).size).toBe(39);
    for (const x of [...LETTERS, ...DIGITS]) {
      expect(x.name.length).toBeGreaterThan(0);
      expect(x.sound.length).toBeGreaterThan(0);
      expect(x.emoji.length).toBeGreaterThan(0);
    }
  });
  it('gives every letter four or five different, familiar words that really start with it', () => {
    const emojis: string[] = [];
    for (const l of LETTERS) {
      expect(l.words.length, l.label).toBeGreaterThanOrEqual(4);
      expect(l.words.length, l.label).toBeLessThanOrEqual(5);
      expect(new Set(l.words.map((x) => x.word)).size, l.label).toBe(l.words.length);
      for (const x of l.words) {
        expect(initialOf(x.word), `${l.label}: ${x.word}`).toBe(l.label);
        emojis.push(x.emoji);
      }
    }
    // no picture is used for two different words
    expect(new Set(emojis).size).toBe(emojis.length);
  });
  it('no word starts with a two-letter sound (ch, kh, nh, th, tr …) that belongs to another letter', () => {
    for (const l of LETTERS) {
      for (const x of l.words) {
        const t = x.word.normalize('NFC').toLowerCase();
        if (l.label === 'Q') continue;
        expect(/^(ch|gh|gi|kh|ng|nh|ph|qu|th|tr)/.test(t), `${l.label}: ${x.word}`).toBe(false);
      }
    }
  });
  it('reads the usual names for the marked vowels', () => {
    const by = (c: string) => LETTERS.find((l) => l.label === c)!;
    expect(by('Ă').name).toBe('á');
    expect(by('Â').name).toBe('ớ');
    expect(by('B').name).toBe('bê');
    expect(by('B').sound).toBe('bờ');
  });
  it('finds the first letter of a word, ignoring tones but not letter shapes', () => {
    expect(initialOf('bóng')).toBe('B');
    expect(initialOf('ấm trà')).toBe('Â');
    expect(initialOf('ăn cơm')).toBe('Ă');
    expect(initialOf('đèn')).toBe('Đ');
    expect(initialOf('ỉn')).toBe('I');
    expect(initialOf('ức gà')).toBe('Ư');
    expect(splitWord('bóng')).toEqual({ first: 'b', rest: 'óng' });
    expect(splitWord('ếch')).toEqual({ first: 'ế', rest: 'ch' });
    expect(splitWord('')).toEqual({ first: '', rest: '' });
  });
  it('pages cover everything in pages of at most 10', () => {
    const p = pages();
    expect(p.length).toBe(4);
    expect(p.every((x) => x.length <= 10 && x.length > 0)).toBe(true);
    expect(p.flat().length).toBe(39);
    expect(p[3]![0]!.label).toBe('0');
    expect(isDigit(p[3]![0]!)).toBe(true);
    expect(lowerOf(LETTERS[3]!)).toBe('b');
  });
  it('chunks', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunk([], 2)).toEqual([]);
  });
  it('has something to count for every digit', () => {
    expect(COUNTABLES.length).toBeGreaterThanOrEqual(10);
    expect(DIGITS[3]!.name).toBe('ba');
  });
  it('page is done when every tile was touched, in any order', () => {
    expect(pageDone(new Set([2, 0, 1]), 3)).toBe(true);
    expect(pageDone(new Set([0, 2]), 3)).toBe(false);
    expect(pageDone(new Set(), 0)).toBe(false);
  });
});
