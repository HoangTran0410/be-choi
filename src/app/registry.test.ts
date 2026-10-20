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
  it('puts the drawing workshop in as a new game, not a folded-in one', async () => {
    const { isLegacy } = await import('./registry');
    expect(findGame('draw')?.title).toBe('Xưởng vẽ của bé');
    expect(isLegacy('draw')).toBe(false);
    expect(isLegacy('paint')).toBe(true);
    expect(isLegacy('trace')).toBe(true);
  });
  it('finds by id', () => {
    expect(findGame('shapes')?.title).toBe('Ghép hình');
    expect(findGame('nope')).toBeUndefined();
  });
});
