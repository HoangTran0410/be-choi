import { describe, expect, it } from 'vitest';
import {
  adapt,
  avatarsOpen,
  cardsPairs,
  diffParams,
  earned,
  freshSkill,
  gearOpen,
  gemsOpen,
  islandsOpen,
  MAX_LEVEL,
  missingParams,
  rate,
  REWARDS,
  rewardAt,
  roundRng,
  sequenceParams,
  starsIntoStep,
  starsToUnlock,
  STATION_IDS,
  suggestNext,
  unlockedStations,
  type StationId,
} from './levels';

describe('rate', () => {
  it('is clean with few slips, rough when slips match the size, ok between', () => {
    expect(rate(0, 8)).toBe('clean');
    expect(rate(2, 8)).toBe('clean');
    expect(rate(3, 8)).toBe('ok');
    expect(rate(8, 8)).toBe('rough');
    expect(rate(0, 0)).toBe('clean');
  });
});

describe('adapt', () => {
  it('goes up after two clean rounds and stops at the top', () => {
    let s = freshSkill();
    s = adapt(s, 'clean', 3);
    expect(s.level).toBe(0);
    s = adapt(s, 'clean', 3);
    expect(s).toEqual({ level: 1, streak: 0, slips: 0 });
    for (let i = 0; i < 20; i++) s = adapt(s, 'clean', 3);
    expect(s.level).toBe(3);
  });
  it('a single rough round changes nothing; two in a row ease off one rung', () => {
    let s = { level: 2, streak: 1, slips: 0 };
    s = adapt(s, 'rough', 5);
    expect(s.level).toBe(2);
    expect(s.streak).toBe(0);
    s = adapt(s, 'rough', 5);
    expect(s.level).toBe(1);
  });
  it('never goes below level 0', () => {
    let s = freshSkill();
    for (let i = 0; i < 10; i++) s = adapt(s, 'rough', 5);
    expect(s.level).toBe(0);
  });
  it('a middling round breaks both streaks', () => {
    const s = adapt({ level: 1, streak: 1, slips: 1 }, 'ok', 5);
    expect(s).toEqual({ level: 1, streak: 0, slips: 0 });
  });
  it('does not mutate its input', () => {
    const before = freshSkill();
    adapt(before, 'clean', 3);
    expect(before).toEqual(freshSkill());
  });
});

describe('roundRng', () => {
  it('is stable for the same inputs and different for others', () => {
    const a = roundRng('cards', 2, 5);
    const b = roundRng('cards', 2, 5);
    const seq = (r: () => number) => [r(), r(), r()];
    expect(seq(a)).toEqual(seq(b));
    expect(seq(roundRng('cards', 2, 6))).not.toEqual(seq(roundRng('cards', 2, 5)));
    expect(seq(roundRng('diff', 2, 5))).not.toEqual(seq(roundRng('cards', 2, 5)));
  });
});

describe('difficulty never gets easier going up', () => {
  it('cards', () => {
    for (let l = 1; l <= MAX_LEVEL.cards; l++) expect(cardsPairs(l)).toBeGreaterThan(cardsPairs(l - 1));
    expect(cardsPairs(0)).toBe(2);
    expect(cardsPairs(MAX_LEVEL.cards)).toBe(8);
    expect(cardsPairs(99)).toBe(8);
    expect(cardsPairs(-3)).toBe(2);
  });
  it('sequence', () => {
    for (let l = 1; l <= MAX_LEVEL.sequence; l++) {
      const a = sequenceParams(l - 1);
      const b = sequenceParams(l);
      expect(b.length).toBeGreaterThanOrEqual(a.length);
      expect(b.options).toBeGreaterThanOrEqual(a.options);
    }
    for (let l = 0; l <= MAX_LEVEL.sequence; l++) {
      const p = sequenceParams(l);
      expect(p.length).toBeGreaterThanOrEqual(2);
      expect(p.length).toBeLessThanOrEqual(5);
      expect(p.options).toBeGreaterThan(p.length);
    }
  });
  it('missing', () => {
    for (let l = 1; l <= MAX_LEVEL.missing; l++) {
      expect(missingParams(l).shown).toBeGreaterThanOrEqual(missingParams(l - 1).shown);
      expect(missingParams(l).choices).toBeGreaterThanOrEqual(missingParams(l - 1).choices);
    }
    expect(missingParams(0).shown).toBe(4);
    expect(missingParams(MAX_LEVEL.missing).shown).toBe(6);
  });
  it('diff', () => {
    for (let l = 1; l <= MAX_LEVEL.diff; l++) {
      const a = diffParams(l - 1);
      expect(diffParams(l).cols * diffParams(l).rows).toBeGreaterThan(a.cols * a.rows);
    }
  });
});

describe('rewards', () => {
  it('gives something every three stars and nothing in between', () => {
    expect(earned(0)).toEqual([]);
    expect(earned(2)).toEqual([]);
    expect(earned(3)).toEqual([REWARDS[0]]);
    expect(earned(5)).toHaveLength(1);
    expect(earned(6)).toHaveLength(2);
    expect(starsIntoStep(7)).toBe(1);
  });
  it('starts with two open stations and opens the rest in order', () => {
    expect(unlockedStations(0)).toEqual(['cards', 'missing']);
    expect(unlockedStations(3)).toEqual(['cards', 'missing', 'sequence']);
    expect(unlockedStations(9)).toContain('tubes');
    expect(unlockedStations(15)).toEqual(STATION_IDS);
  });
  it('says how many stars a locked station still needs', () => {
    expect(starsToUnlock('cards', 0)).toBe(0);
    expect(starsToUnlock('sequence', 1)).toBe(2);
    expect(starsToUnlock('diff', 0)).toBe(15);
    expect(starsToUnlock('diff', 15)).toBe(0);
  });
  it('opens islands, explorers and gear', () => {
    expect(islandsOpen(0)).toBe(1);
    expect(islandsOpen(18)).toBe(2);
    expect(islandsOpen(27)).toBe(3);
    expect(avatarsOpen(0)).toEqual(['🧒']);
    expect(avatarsOpen(6)).toEqual(['🧒', '🦊']);
    expect(gearOpen(12)).toEqual(['🔭']);
  });
  it('keeps giving gems after the named rewards', () => {
    expect(rewardAt(REWARDS.length + 1).kind).toBe('gem');
    expect(gemsOpen(REWARDS.length * 3)).toBe(0);
    expect(gemsOpen((REWARDS.length + 2) * 3)).toBe(2);
  });
  it('every station is reachable', () => {
    const ids = new Set<StationId>(['cards', 'missing', ...REWARDS.flatMap((r) => (r.station ? [r.station] : []))]);
    expect([...ids].sort()).toEqual([...STATION_IDS].sort());
  });
});

describe('suggestNext', () => {
  it('prefers the least played, and nudges away from the last one', () => {
    expect(suggestNext(['cards', 'missing'], { cards: 3, missing: 1 }, null)).toBe('missing');
    expect(suggestNext(['cards', 'missing'], {}, 'cards')).toBe('missing');
  });
});
