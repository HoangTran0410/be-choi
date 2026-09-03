import { describe, it, expect } from 'vitest';
import { BARS, CRITTERS, findCritter, pushBar, shouldStar, STAR_EVERY } from './logic';

describe('critters', () => {
  it('are five distinct animals with a voice each side of normal', () => {
    expect(CRITTERS.length).toBe(5);
    expect(new Set(CRITTERS.map((c) => c.id)).size).toBe(5);
    expect(CRITTERS.some((c) => c.rate > 1)).toBe(true);
    expect(CRITTERS.some((c) => c.rate < 1)).toBe(true);
    for (const c of CRITTERS) {
      expect(c.rate).toBeGreaterThan(0.4);
      expect(c.rate).toBeLessThan(2.1);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it('finds one by id', () => {
    expect(findCritter('dino')?.emoji).toBe('🦖');
    expect(findCritter('nope')).toBeUndefined();
  });
});

describe('pushBar', () => {
  it('adds the newest level at the end', () => {
    expect(pushBar([0.1], 0.5)).toEqual([0.1, 0.5]);
  });

  it('keeps only the last BARS values', () => {
    let bars: number[] = [];
    for (let i = 0; i < BARS + 5; i++) bars = pushBar(bars, i / 100);
    expect(bars.length).toBe(BARS);
    expect(bars[BARS - 1]).toBeCloseTo((BARS + 4) / 100, 5);
  });

  it('clamps levels into 0 … 1', () => {
    expect(pushBar([], -2)).toEqual([0]);
    expect(pushBar([], 9)).toEqual([1]);
  });
});

describe('shouldStar', () => {
  it('rewards every third playback, never the zeroth', () => {
    expect(shouldStar(0)).toBe(false);
    expect(shouldStar(STAR_EVERY)).toBe(true);
    expect(shouldStar(STAR_EVERY + 1)).toBe(false);
    expect(shouldStar(STAR_EVERY * 2)).toBe(true);
  });
});
