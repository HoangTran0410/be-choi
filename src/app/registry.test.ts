import { describe, it, expect } from 'vitest';
import { GAMES, findGame, isLegacy } from './registry';

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
  it('puts the all-in-one learning game on the home screen proper, not in the old-games group', () => {
    expect(findGame('learn')?.title).toBe('Học cùng bé');
    expect(isLegacy('learn')).toBe(false);
    // The games it folds together are still there to play, just listed last.
    for (const id of ['letters', 'count', 'sounds', 'soundbook', 'shadows', 'colors', 'sizes', 'shapes', 'sortout', 'pattern']) {
      expect(findGame(id), id).toBeDefined();
      expect(isLegacy(id), id).toBe(true);
    }
  });
  it('finds by id', () => {
    expect(findGame('shapes')?.title).toBe('Ghép hình');
    expect(findGame('nope')).toBeUndefined();
  });
});
