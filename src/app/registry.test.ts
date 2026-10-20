import { describe, it, expect } from 'vitest';
import { GAMES, LEGACY_IDS, findGame, isLegacy } from './registry';

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
  it('puts the new all-in-one world last in the list, outside the folded-away games', () => {
    expect(GAMES[GAMES.length - 1]!.id).toBe('habitat');
    expect(LEGACY_IDS.has('habitat')).toBe(false);
    // The games it folds together are still there to play, just listed last on the home screen.
    for (const id of ['aquarium', 'terrarium', 'fishing']) expect(isLegacy(id)).toBe(true);
  });
  it('finds by id', () => {
    expect(findGame('shapes')?.title).toBe('Ghép hình');
    expect(findGame('nope')).toBeUndefined();
  });
});
