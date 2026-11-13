import { describe, it, expect } from 'vitest';
import { FRUITS } from '../../core/content';
import { mulberry32 } from '../../core/dom';
import { CEILING, makeCountRound, maxCount, MIN_DIST, minDistFor, nextBonus, numberWord, POS_MAX, POS_MIN, scatter, type Point } from './logic';

function minPairDist(pts: Point[]): number {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i]!;
      const b = pts[j]!;
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return min;
}

describe('count logic', () => {
  it('max count grows per round', () => {
    expect(maxCount(0)).toBe(2);
    expect(maxCount(1)).toBe(3);
    expect(maxCount(2)).toBe(5);
    expect(maxCount(9)).toBe(5);
  });

  it('rounds stay in schedule, positions match count, stay inside the band and apart', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const roundIndex = seed % 4;
      const r = makeCountRound(roundIndex, mulberry32(seed));
      expect(r.count).toBeGreaterThanOrEqual(1);
      expect(r.count).toBeLessThanOrEqual(maxCount(roundIndex));
      expect(r.positions.length).toBe(r.count);
      expect(minPairDist(r.positions)).toBeGreaterThanOrEqual(MIN_DIST);
      for (const p of r.positions) {
        expect(p.x).toBeGreaterThanOrEqual(POS_MIN);
        expect(p.x).toBeLessThanOrEqual(POS_MAX);
        expect(p.y).toBeGreaterThanOrEqual(POS_MIN);
        expect(p.y).toBeLessThanOrEqual(POS_MAX);
      }
      expect(FRUITS).toContainEqual(r.item);
    }
  });

  it('never picks the excluded fruit', () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(makeCountRound(2, mulberry32(seed), '🍎').item.emoji).not.toBe('🍎');
    }
  });

  it('number words', () => {
    expect(numberWord(1)).toBe('một');
    expect(numberWord(3)).toBe('ba');
    expect(numberWord(5)).toBe('năm');
    expect(numberWord(99)).toBe('');
    expect(numberWord(-1)).toBe('');
  });

  it('scatter always returns n points, even when the spacing is impossible', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pts = scatter(5, mulberry32(seed));
      expect(pts.length).toBe(5);
      expect(minPairDist(pts)).toBeGreaterThanOrEqual(MIN_DIST);
    }
    const crowded = scatter(5, mulberry32(1), 0.9);
    expect(crowded.length).toBe(5);
    expect(minPairDist(crowded)).toBeGreaterThanOrEqual(MIN_DIST);
    expect(scatter(0, mulberry32(1))).toEqual([]);
  });

  it('minDistFor widens the spacing only on short boards', () => {
    expect(minDistFor(0, 0, 72)).toBe(MIN_DIST);
    expect(minDistFor(390, 760, 72)).toBe(MIN_DIST);
    expect(minDistFor(1024, 690, 107)).toBe(MIN_DIST);
    const landscapePhone = minDistFor(844, 320, 72);
    expect(landscapePhone).toBeGreaterThan(MIN_DIST);
    expect(landscapePhone * 320).toBeGreaterThanOrEqual(72);
    expect(minDistFor(100, 100, 72)).toBe(0.3);
  });

  it('the ceiling climbs from 5 to 10 with the bonus, but the first rounds stay easy', () => {
    expect(maxCount(0, 5)).toBe(2);
    expect(maxCount(1, 5)).toBe(3);
    expect(maxCount(2, 0)).toBe(5);
    expect(maxCount(2, 3)).toBe(8);
    expect(maxCount(9, 5)).toBe(10);
    expect(maxCount(9, 99)).toBe(CEILING);
    expect(maxCount(9, -4)).toBe(5);
  });

  it('the bonus rises on a clean round and falls when the child needed a hint, never out of range', () => {
    expect(nextBonus(0, false)).toBe(1);
    expect(nextBonus(4, false)).toBe(5);
    expect(nextBonus(5, false)).toBe(5);
    expect(nextBonus(3, true)).toBe(2);
    expect(nextBonus(0, true)).toBe(0);
  });

  it('rounds with a full bonus reach ten and keep every fruit apart', () => {
    let top = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = makeCountRound(3, mulberry32(seed), undefined, MIN_DIST, 5);
      top = Math.max(top, r.count);
      expect(r.count).toBeLessThanOrEqual(10);
      expect(r.positions.length).toBe(r.count);
      expect(minPairDist(r.positions)).toBeGreaterThanOrEqual(MIN_DIST);
    }
    expect(top).toBe(10);
  });

  it('the fallback grid keeps up to ten points apart', () => {
    for (let n = 1; n <= 10; n++) {
      const pts = scatter(n, mulberry32(7), 0.95);
      expect(pts.length).toBe(n);
      expect(minPairDist(pts)).toBeGreaterThanOrEqual(MIN_DIST);
    }
  });
});
