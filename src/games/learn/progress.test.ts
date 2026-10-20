import { beforeEach, describe, expect, it } from 'vitest';
import { recordAnswer } from './picker';
import {
  BASE_TEACHER,
  REWARDS,
  SAVE_KEY,
  freshState,
  isWorn,
  loadState,
  nextReward,
  saveState,
  toggleWear,
  totalRuns,
  unlocked,
} from './progress';

describe('saving progress', () => {
  beforeEach(() => localStorage.clear());

  it('starts fresh when nothing is saved', () => {
    expect(loadState()).toEqual(freshState());
  });

  it('keeps mastery, the clock, finished stations and the outfit across a reload', () => {
    const s = freshState();
    s.mastery = recordAnswer(recordAnswer(s.mastery, 'L:B', true, 1), 'L:B', true, 2);
    s.turn = 2;
    s.runs = { letters: 2, family: 1 };
    s.wear = { who: '🦊', head: '🎓' };
    expect(saveState(s)).toBe(true);
    const back = loadState();
    expect(back.mastery['L:B']!.l).toBe(1);
    expect(back.turn).toBe(2);
    expect(back.runs).toEqual({ letters: 2, family: 1 });
    expect(back.wear).toEqual({ who: '🦊', head: '🎓' });
  });

  it('survives rubbish in storage', () => {
    localStorage.setItem(SAVE_KEY, '{not json');
    expect(loadState()).toEqual(freshState());
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, mastery: { 'L:B': { l: 99, s: -4, a: 'x' } }, runs: { bogus: 3, letters: 2 }, wear: { who: 5 } }));
    const s = loadState();
    expect(s.mastery['L:B']!.l).toBe(3);
    expect(s.mastery['L:B']!.s).toBe(0);
    expect(s.runs).toEqual({ letters: 2 });
    expect(s.wear.who).toBe(BASE_TEACHER);
  });

  it('refuses a save from a newer app instead of guessing', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 99, runs: { letters: 5 } }));
    expect(loadState()).toEqual(freshState());
  });

  it('works when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
      removeItem: () => undefined,
    };
    expect(loadState(blocked)).toEqual(freshState());
    expect(saveState(freshState(), blocked)).toBe(false);
  });
});

describe('rewards for the teacher', () => {
  it('unlocks one more for every finished station, and says what comes next', () => {
    const s = freshState();
    expect(unlocked(s)).toEqual([]);
    expect(nextReward(s)).toBe(REWARDS[0]);
    s.runs = { letters: 1, numbers: 2 };
    expect(totalRuns(s)).toBe(3);
    expect(unlocked(s)).toEqual(REWARDS.slice(0, 3));
    expect(nextReward(s)).toBe(REWARDS[3]);
    s.runs = { letters: 100 };
    expect(unlocked(s).length).toBe(REWARDS.length);
    expect(nextReward(s)).toBeNull();
  });

  it('puts accessories on and off, and switches character', () => {
    const grad = REWARDS.find((r) => r.id === 'grad')!;
    const fox = REWARDS.find((r) => r.id === 'fox')!;
    let w = freshState().wear;
    w = toggleWear(w, grad);
    expect(isWorn(w, grad)).toBe(true);
    w = toggleWear(w, fox);
    expect(w.who).toBe('🦊');
    expect(w.head).toBe('🎓');
    w = toggleWear(w, fox);
    expect(w.who).toBe(BASE_TEACHER);
    w = toggleWear(w, grad);
    expect(w.head).toBeUndefined();
  });
});
