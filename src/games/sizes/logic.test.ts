import { describe, it, expect } from 'vitest';
import { BIG_SCALE, SIZE_ITEMS, SMALL_SCALE, makeSizeRound, sizeScale, sizeWord } from './logic';
import { mulberry32 } from '../../core/dom';

describe('sizes logic', () => {
  it('makes 4 pieces: exactly 2 big and 2 small, unique ids', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = makeSizeRound(mulberry32(seed));
      expect(r.pieces.length).toBe(4);
      expect(r.pieces.filter((p) => p.big).length).toBe(2);
      expect(r.pieces.filter((p) => !p.big).length).toBe(2);
      expect(new Set(r.pieces.map((p) => p.id)).size).toBe(4);
    }
  });

  it('shuffles the pieces', () => {
    const firsts = new Set<boolean>();
    for (let seed = 0; seed < 50; seed++) firsts.add(makeSizeRound(mulberry32(seed)).pieces[0]?.big ?? false);
    expect(firsts.size).toBe(2);
  });

  it('picks an item with emoji and name from the pool', () => {
    const r = makeSizeRound(mulberry32(11));
    expect(r.item.emoji.length).toBeGreaterThan(0);
    expect(r.item.name.length).toBeGreaterThan(0);
    expect(SIZE_ITEMS.some((i) => i.emoji === r.item.emoji && i.name === r.item.name)).toBe(true);
    expect(SIZE_ITEMS.length).toBeGreaterThan(20);
  });

  it('never picks the excluded emoji', () => {
    for (const excluded of SIZE_ITEMS) {
      for (let seed = 0; seed < 40; seed++) {
        expect(makeSizeRound(mulberry32(seed), excluded.emoji).item.emoji).not.toBe(excluded.emoji);
      }
    }
  });

  it('works without arguments', () => {
    const r = makeSizeRound();
    expect(r.pieces.length).toBe(4);
    expect(r.item.emoji.length).toBeGreaterThan(0);
  });

  it('exposes scales and words', () => {
    expect(BIG_SCALE).toBeGreaterThan(1);
    expect(SMALL_SCALE).toBeLessThan(1);
    expect(sizeScale(true)).toBe(BIG_SCALE);
    expect(sizeScale(false)).toBe(SMALL_SCALE);
    expect(sizeWord(true)).toBe('to');
    expect(sizeWord(false)).toBe('nhỏ');
  });
});
