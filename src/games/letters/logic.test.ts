import { describe, it, expect } from 'vitest';
import { LETTERS, DIGITS, pages, chunk, sayFor, captionFor, pageDone } from './logic';

describe('letters logic', () => {
  it('has the 29 Vietnamese letters and 10 digits, all complete and unique', () => {
    expect(LETTERS.length).toBe(29);
    expect(DIGITS.length).toBe(10);
    const labels = [...LETTERS, ...DIGITS].map((x) => x.label);
    expect(new Set(labels).size).toBe(39);
    for (const x of [...LETTERS, ...DIGITS]) {
      expect(x.name.length).toBeGreaterThan(0);
      expect(x.word.length).toBeGreaterThan(0);
      expect(x.emoji.length).toBeGreaterThan(0);
    }
  });
  it('pages cover everything in pages of at most 10', () => {
    const p = pages();
    expect(p.length).toBe(4);
    expect(p.every((x) => x.length <= 10 && x.length > 0)).toBe(true);
    expect(p.flat().length).toBe(39);
    expect(p[3]![0]!.label).toBe('0');
  });
  it('chunks', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunk([], 2)).toEqual([]);
  });
  it('says letters with a word and digits with just the name', () => {
    expect(sayFor(LETTERS[3]!)).toBe('bê. bóng');
    expect(sayFor(DIGITS[1]!)).toBe('một');
    expect(captionFor(DIGITS[1]!)).toBe('một');
    expect(captionFor(LETTERS[3]!)).toBe('bóng');
  });
  it('shows as many emoji as the digit', () => {
    expect([...DIGITS[3]!.word].length).toBe(3);
  });
  it('page is done when every tile was touched, in any order', () => {
    expect(pageDone(new Set([2, 0, 1]), 3)).toBe(true);
    expect(pageDone(new Set([0, 2]), 3)).toBe(false);
    expect(pageDone(new Set(), 0)).toBe(false);
  });
});
