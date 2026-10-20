import { describe, it, expect } from 'vitest';
import { GAMES, LEGACY_IDS, findGame, isLegacy } from './registry';

describe('registry', () => {
  it('has 58 unique games that all load a module with start()', async () => {
    expect(GAMES.length).toBe(58);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(58);
    for (const g of GAMES) {
      const m = (await g.load()).default;
      expect(m.id).toBe(g.id);
      expect(typeof m.start).toBe('function');
      expect(g.intro.length).toBeGreaterThan(0);
    }
  });
  it('keeps the new all-in-one games out of the folded-away list', () => {
    for (const id of ['robots', 'catband', 'museum', 'build', 'learn', 'brain', 'habitat', 'harvest', 'singalong', 'draw', 'day']) {
      expect(findGame(id), id).toBeDefined();
      expect(LEGACY_IDS.has(id), id).toBe(false);
    }
    // The games it folds together are still there to play, just listed last on the home screen.
    for (const id of ['aquarium', 'terrarium', 'fishing']) expect(isLegacy(id)).toBe(true);
  });
  it('finds by id', () => {
    expect(findGame('shapes')?.title).toBe('Ghép hình');
    expect(findGame('nope')).toBeUndefined();
  });
});
