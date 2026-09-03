import { describe, it, expect } from 'vitest';
import { FRUITS } from '../../core/content';
import { mulberry32 } from '../../core/dom';
import { makeCountRound, maxCount, MIN_DIST, minDistFor, numberWord, POS_MAX, POS_MIN, scatter, type Point } from './logic';

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
});
