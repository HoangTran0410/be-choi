import { describe, it, expect } from 'vitest';
import { minAgeOf, suitsAge } from './ages';
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
    const n = (age: 2 | 3 | 4) => GAMES.filter((g) => suitsAge(g, age)).length;
    expect(n(2)).toBeGreaterThan(10);
    expect(n(2)).toBeLessThan(n(3));
    expect(n(3)).toBeLessThan(n(4));
    expect(n(4)).toBe(GAMES.length);
  });
});
