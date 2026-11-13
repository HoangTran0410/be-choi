import { describe, it, expect } from 'vitest';
import { nextVariant } from './variant';

describe('nextVariant', () => {
  it('never plays the same variant twice in a row', () => {
    for (const count of [2, 3, 4, 5]) {
      let last: number | undefined;
      for (let i = 0; i < 2000; i++) {
        const v = nextVariant(count, last);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(count);
        expect(v).not.toBe(last);
        last = v;
      }
    }
  });

  it('reaches every variant, not just a favourite', () => {
    const seen = new Set<number>();
    let last: number | undefined;
    for (let i = 0; i < 500; i++) seen.add((last = nextVariant(5, last)));
    expect(seen.size).toBe(5);
  });

  it('is fair at the edges of the random source', () => {
    for (const r of [0, 0.4999, 0.5, 0.9999999]) {
      for (let last = 0; last < 4; last++) {
        const v = nextVariant(4, last, () => r);
        expect(v).not.toBe(last);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(4);
      }
    }
  });

  it('has nothing to choose with one variant, or none', () => {
    expect(nextVariant(1, 0)).toBe(0);
    expect(nextVariant(0, undefined)).toBe(0);
  });

  it('ignores a stale last index', () => {
    expect(nextVariant(3, 7, () => 0)).toBe(0);
    expect(nextVariant(3, undefined, () => 0.99)).toBe(2);
  });
});
