import { describe, it, expect } from 'vitest';
import { GAMES, findGame } from './registry';

describe('registry', () => {
  it('has 12 unique games that all load a module with start()', async () => {
    expect(GAMES.length).toBe(12);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(12);
    for (const g of GAMES) {
      const m = (await g.load()).default;
      expect(m.id).toBe(g.id);
      expect(typeof m.start).toBe('function');
      expect(g.intro.length).toBeGreaterThan(0);
    }
  });
  it('finds by id', () => {
    expect(findGame('shapes')?.title).toBe('Ghép hình');
    expect(findGame('nope')).toBeUndefined();
  });
});
