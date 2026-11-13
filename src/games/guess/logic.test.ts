import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { INSTRUMENTS, instOf } from '../show/logic';
import { choiceCount, nextStreak, pickChoices, pickTarget } from './logic';

describe('guess logic', () => {
  it('starts with two pictures and grows with the streak', () => {
    expect(choiceCount(0)).toBe(2);
    expect(choiceCount(2)).toBe(2);
    expect(choiceCount(3)).toBe(3);
    expect(choiceCount(8)).toBe(4);
    expect(choiceCount(99)).toBe(4);
  });
  it('a wrong try only eases the streak, never below 0', () => {
    expect(nextStreak(3, 0)).toBe(4);
    expect(nextStreak(3, 1)).toBe(2);
    expect(nextStreak(0, 5)).toBe(0);
  });
  it('never repeats the instrument just heard', () => {
    const rng = mulberry32(7);
    let prev = pickTarget(null, rng);
    for (let i = 0; i < 60; i++) {
      const next = pickTarget(prev, rng);
      expect(next).not.toBe(prev);
      prev = next;
    }
  });
  it('choices always hold the target once, with distinct others', () => {
    const rng = mulberry32(3);
    for (const t of INSTRUMENTS) {
      for (const n of [2, 3, 4]) {
        const c = pickChoices(t.id, n, false, rng);
        expect(c.length).toBe(n);
        expect(new Set(c).size).toBe(n);
        expect(c).toContain(t.id);
      }
    }
  });
  it('alike choices come from the same family first', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 30; i++) {
      const c = pickChoices('guitar', 3, true, rng);
      const fam = c.filter((id) => instOf(id).family === 'strings');
      expect(fam.length).toBe(3); // guitar, violin, harp are all strings
    }
  });
});
