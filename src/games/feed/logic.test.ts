import { describe, it, expect } from 'vitest';
import { ANIMALS_PER_ROUND, makeFeedRound } from './logic';
import { FEED_PAIRS } from '../../core/content';
import { mulberry32 } from '../../core/dom';

describe('feed logic', () => {
  it('feeds 5 animals per round', () => {
    expect(ANIMALS_PER_ROUND).toBe(5);
  });

  it('3 distinct foods, exactly one correct, correct matches FEED_PAIRS', () => {
    for (let seed = 0; seed < 60; seed++) {
      const r = makeFeedRound(mulberry32(seed));
      expect(r.foods.length).toBe(3);
      expect(r.foods.filter((f) => f.emoji === r.correct.emoji).length).toBe(1);
      expect(new Set(r.foods.map((f) => f.emoji)).size).toBe(3);
      const pair = FEED_PAIRS.find((p) => p.animal.emoji === r.animal.emoji);
      expect(pair?.food.emoji).toBe(r.correct.emoji);
      for (const f of r.foods) {
        if (f !== r.correct) expect(f.emoji).not.toBe(r.correct.emoji);
      }
    }
  });

  it('respects excludeAnimals', () => {
    const last = FEED_PAIRS[FEED_PAIRS.length - 1]!;
    const exclude = FEED_PAIRS.slice(0, -1).map((p) => p.animal.emoji);
    for (let seed = 0; seed < 20; seed++) {
      expect(makeFeedRound(mulberry32(seed), exclude).animal.emoji).toBe(last.animal.emoji);
    }
  });

  it('ignores the exclusion when every animal is excluded', () => {
    const all = FEED_PAIRS.map((p) => p.animal.emoji);
    expect(() => makeFeedRound(mulberry32(3), all)).not.toThrow();
    expect(all).toContain(makeFeedRound(mulberry32(3), all).animal.emoji);
  });
});
