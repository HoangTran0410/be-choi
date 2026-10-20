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
  it('puts the merged singing game on the home screen, not among the legacy ones', () => {
    expect(findGame('singalong')?.title).toBe('Hát cùng bé');
    expect(findGame('singalong')?.skill).toBe('music');
    expect(isLegacy('singalong')).toBe(false);
    for (const id of ['sing', 'parrot', 'birdsong']) expect(isLegacy(id)).toBe(true);
  });
  it('finds by id', () => {
    expect(findGame('shapes')?.title).toBe('Ghép hình');
    expect(findGame('nope')).toBeUndefined();
  });
});
