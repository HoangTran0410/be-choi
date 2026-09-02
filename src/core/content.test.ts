import { describe, it, expect } from 'vitest';
import { ANIMALS, FRUITS, VEHICLES, FOODS, COLORS, NUMBERS_VI, FEED_PAIRS, PRAISES } from './content';

describe('content', () => {
  it('has enough distinct items with names', () => {
    for (const set of [ANIMALS, FRUITS, VEHICLES, FOODS]) {
      expect(set.length).toBeGreaterThanOrEqual(8);
      expect(new Set(set.map((i) => i.emoji)).size).toBe(set.length);
      for (const i of set) expect(i.name.length).toBeGreaterThan(0);
    }
  });
  it('has colors, numbers, praises and feed pairs', () => {
    expect(COLORS.length).toBe(7);
    expect(new Set(COLORS.map((c) => c.id)).size).toBe(7);
    expect(NUMBERS_VI[1]).toBe('một');
    expect(NUMBERS_VI[5]).toBe('năm');
    expect(FEED_PAIRS.length).toBeGreaterThanOrEqual(6);
    expect(PRAISES.length).toBeGreaterThanOrEqual(4);
  });
});
