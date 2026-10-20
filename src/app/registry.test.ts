import { describe, it, expect } from 'vitest';
import { GAMES, findGame } from './registry';

describe('registry', () => {
  it('has 48 unique games that all load a module with start()', async () => {
    expect(GAMES.length).toBe(48);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(48);
    for (const g of GAMES) {
      const m = (await g.load()).default;
      expect(m.id).toBe(g.id);
      expect(typeof m.start).toBe('function');
      expect(g.intro.length).toBeGreaterThan(0);
    }
  });
  it('has the all-in-one farm, and the old farm and garden still open', () => {
    expect(findGame('harvest')?.icon).toBe('🌻');
    expect(findGame('harvest')?.skill).toBe('nature');
    expect(findGame('farm')).toBeDefined();
    expect(findGame('garden')).toBeDefined();
  });
  it('finds by id', () => {
    expect(findGame('shapes')?.title).toBe('Ghép hình');
    expect(findGame('nope')).toBeUndefined();
  });
});
