import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { binCount, CATEGORIES, categoryOf, ITEMS_PER_BIN, makeSortRound } from './logic';

describe('sortout logic', () => {
  it('bin count grows after the first round', () => {
    expect(binCount(0)).toBe(2);
    expect(binCount(1)).toBe(3);
    expect(binCount(8)).toBe(3);
  });
  it('every item belongs to exactly one bin shown on the board', () => {
    for (let seed = 1; seed < 20; seed++) {
      const r = makeSortRound(seed % 3, mulberry32(seed));
      const ids = r.bins.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(r.items.length).toBe(ids.length * ITEMS_PER_BIN);
      expect(new Set(r.items.map((i) => i.id)).size).toBe(r.items.length);
      for (const it of r.items) {
        expect(ids).toContain(it.category);
        expect(categoryOf(it.category).things.map((t) => t.emoji)).toContain(it.emoji);
      }
      for (const id of ids) expect(r.items.filter((i) => i.category === id).length).toBe(ITEMS_PER_BIN);
    }
  });
  it('categories have enough distinct things', () => {
    expect(CATEGORIES.length).toBe(3);
    for (const c of CATEGORIES) {
      expect(c.things.length).toBeGreaterThanOrEqual(ITEMS_PER_BIN);
      expect(new Set(c.things.map((t) => t.emoji)).size).toBe(c.things.length);
    }
  });
  it('categoryOf throws on unknown', () => {
    expect(() => categoryOf('x' as never)).toThrow();
  });
});
