import { describe, it, expect } from 'vitest';
import { minAgeOf, normalizeAge, suitsAge, type AgeFilter } from './ages';
import { GAMES } from './registry';

describe('age filter', () => {
  it('shows everything when no age is chosen', () => {
    expect(GAMES.every((g) => suitsAge(g, 0))).toBe(true);
  });
  it('works out an age from the skill, and lets a game override it', () => {
    expect(minAgeOf({ id: 'x', skill: 'cause-effect' })).toBe(2);
    expect(minAgeOf({ id: 'x', skill: 'memory' })).toBe(3);
    expect(minAgeOf({ id: 'x', skill: 'memory', minAge: 2 })).toBe(2);
    expect(minAgeOf({ id: 'pattern', skill: 'logic' })).toBe(4);
  });
  it('keeps something to play at every age, and more as the child grows', () => {
    const n = (age: AgeFilter) => GAMES.filter((g) => suitsAge(g, age)).length;
    expect(n(2)).toBeGreaterThan(10);
    expect(n(2)).toBeLessThan(n(3));
    expect(n(3)).toBeLessThan(n(4));
    expect(n(4)).toBeLessThan(n(5));
    expect(n(5)).toBe(GAMES.length);
    expect(n(6)).toBe(GAMES.length);
  });
  it('never hides a simple game from older children', () => {
    for (const g of GAMES.filter((x) => minAgeOf(x) === 2)) expect(suitsAge(g, 6)).toBe(true);
  });
  it('treats old or odd saved values safely', () => {
    expect(normalizeAge(4)).toBe(4);
    expect(normalizeAge(6)).toBe(6);
    expect(normalizeAge(7)).toBe(0);
    expect(normalizeAge('3')).toBe(0);
  });
});
