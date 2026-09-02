import { describe, it, expect } from 'vitest';
import { HIDERS, makeSpots, nextAnimal, REVEAL_MS, STAR_EVERY } from './logic';
import { ANIMALS } from '../../core/content';
import { mulberry32 } from '../../core/dom';

describe('peekaboo logic', () => {
  it('makes 4 spots with distinct hiders and distinct animals', () => {
    const spots = makeSpots(4, mulberry32(5));
    expect(spots.length).toBe(4);
    expect(new Set(spots.map((s) => s.hider)).size).toBe(4);
    expect(new Set(spots.map((s) => s.item.emoji)).size).toBe(4);
    for (const s of spots) {
      expect(HIDERS).toContain(s.hider);
      expect(ANIMALS).toContain(s.item);
    }
  });
  it('throws when asking for more spots than hiders', () => {
    expect(HIDERS.length).toBe(6);
    expect(() => makeSpots(7)).toThrow();
  });
  it('nextAnimal never returns the current animal', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = mulberry32(seed);
      const current = ANIMALS[seed % ANIMALS.length]!;
      const next = nextAnimal(current, rng);
      expect(next.emoji).not.toBe(current.emoji);
      expect(ANIMALS).toContain(next);
    }
  });
  it('exposes tuning constants', () => {
    expect(STAR_EVERY).toBe(6);
    expect(REVEAL_MS).toBe(1600);
  });
});
