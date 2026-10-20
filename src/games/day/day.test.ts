import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { SLOTS } from '../dressup/logic';
import {
  PERIODS,
  TASKS,
  complete,
  dressOffers,
  isDone,
  justUnlocked,
  makePlan,
  moodOf,
  newDay,
  outfitPool,
  outingPool,
  periodDone,
  progressOf,
  recipePool,
  scenarioOf,
  tasksOf,
  unlockedAt,
  visitorLine,
  visitorOf,
  type DayEvent,
  type TaskId,
} from './day';
import { fits } from '../dressup/logic';

describe('day parts and jobs', () => {
  it('has 2–3 jobs in every part of the day, each part used', () => {
    for (let p = 0; p < PERIODS.length; p++) {
      const n = tasksOf(p).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
    expect(new Set(TASKS.map((t) => t.id)).size).toBe(TASKS.length);
  });

  it('moves to the next part only when its last job is done, in any order', () => {
    let s = newDay();
    const morning = tasksOf(0).map((t) => t.id);
    const order = [...morning].reverse();
    for (const id of order.slice(0, -1)) {
      const step = complete(s, id);
      expect(step.periodDone).toBe(false);
      expect(step.state.period).toBe(0);
      s = step.state;
    }
    const last = complete(s, order[order.length - 1] as TaskId);
    expect(last.periodDone).toBe(true);
    expect(last.dayDone).toBe(false);
    expect(last.state.period).toBe(1);
  });

  it('is idempotent and ignores a job from a part that is not current', () => {
    const a = complete(newDay(), 'dress');
    const b = complete(a.state, 'dress');
    expect(b.state.done).toEqual(['dress']);
    // A later part's job finished early never advances the sky.
    const early = complete(newDay(), 'bed');
    expect(early.state.period).toBe(0);
    expect(early.periodDone).toBe(false);
  });

  it('ends the day after the last part, and stays on the last part', () => {
    let s = newDay();
    let last = complete(s, 'dress');
    for (const t of TASKS) {
      last = complete(s, t.id);
      s = last.state;
    }
    expect(last.dayDone).toBe(true);
    expect(s.period).toBe(PERIODS.length - 1);
    expect(progressOf(s)).toEqual({ done: TASKS.length, total: TASKS.length });
    expect(periodDone(s)).toBe(true);
    expect(isDone(s, 'bed')).toBe(true);
  });
});

describe('plans', () => {
  it('is deterministic for a seed and day', () => {
    expect(makePlan(5, 1234, 'rain')).toEqual(makePlan(5, 1234, 'rain'));
  });
  it('starts with a plain sunny first day', () => {
    for (let seed = 1; seed < 40; seed++) {
      const p = makePlan(1, seed);
      expect(p.event).toBe('none');
      expect(p.weather).toBe('sunny');
    }
  });
  it('never repeats the previous surprise and rain means a rainy sky', () => {
    const seen = new Set<DayEvent>();
    for (let seed = 1; seed < 200; seed++) {
      for (const prev of ['rain', 'birthday', 'friend', 'none'] as const) {
        const p = makePlan(3, seed, prev);
        seen.add(p.event);
        if (prev !== 'none') expect(p.event).not.toBe(prev);
        if (p.event === 'rain') expect(p.weather).toBe('rainy');
        expect(scenarioOf(p).id).toBe(p.weather);
      }
    }
    expect([...seen].sort()).toEqual(['birthday', 'friend', 'none', 'rain']);
  });
});

describe('mood', () => {
  it('is hungry until breakfast, upset then sleepy in the evening, otherwise happy', () => {
    const plan = makePlan(2, 9);
    let s = newDay();
    expect(moodOf(s, plan)).toBe('hungry');
    s = complete(s, 'breakfast').state;
    expect(moodOf(s, plan)).toBe('happy');
    expect(moodOf({ period: 1, done: [] }, plan)).toBe('happy');
    expect(moodOf({ period: 3, done: [] }, plan)).toBe(plan.upset);
    expect(moodOf({ period: 3, done: ['comfort'] }, plan)).toBe('sleepy');
  });
});

describe('unlocks', () => {
  it('open more with each finished day, never fewer', () => {
    let prev = 0;
    for (let d = 0; d <= 12; d++) {
      const n = unlockedAt(d).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(unlockedAt(0)).toEqual([]);
    expect(justUnlocked(1).map((u) => u.id)).toEqual(['👑']);
  });
  it('widen the outfits, the food and the things to find outside', () => {
    expect(outfitPool(0, 'hat').some((g) => g.emoji === '👑')).toBe(false);
    expect(outfitPool(1, 'hat').some((g) => g.emoji === '👑')).toBe(true);
    expect(recipePool(0).length).toBe(3);
    expect(recipePool(8).length).toBeGreaterThan(recipePool(0).length);
    expect(outingPool(0, 'sunny')).not.toContain('🪁');
    expect(outingPool(2, 'sunny')).toContain('🪁');
  });
});

describe('what to wear', () => {
  it('offers one suited piece per slot with three to choose from, from day zero on', () => {
    for (let days = 0; days <= 9; days++) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const plan = makePlan(days + 1, seed * 31, 'none');
        const offers = dressOffers(plan, days, mulberry32(seed));
        for (const slot of SLOTS) {
          const list = offers[slot];
          expect(list.length).toBe(3);
          expect(new Set(list.map((g) => g.emoji)).size).toBe(3);
          expect(list.every((g) => g.slot === slot)).toBe(true);
          expect(list.some((g) => fits(g, scenarioOf(plan)))).toBe(true);
        }
      }
    }
  });
  it('puts a piece unlocked by the last day on the rack', () => {
    const plan = makePlan(2, 77, 'none');
    const offers = dressOffers(plan, 1, mulberry32(3));
    expect(offers.hat.some((g) => g.emoji === '👑')).toBe(true);
  });
});

describe('visitor', () => {
  it('is a family photo when there are photos, else a drawn person with a name', () => {
    const plan = makePlan(4, 5, 'none');
    const withPhotos = visitorOf(plan, 3);
    expect(withPhotos.photoIndex).toBeGreaterThanOrEqual(0);
    expect(withPhotos.photoIndex).toBeLessThan(3);
    const drawn = visitorOf(plan, 0);
    expect(drawn.photoIndex).toBeNull();
    expect(visitorLine(drawn.visitor)).toBe(`Ai đến chơi nhỉ?… ${drawn.visitor.name}!`);
    expect(visitorLine(withPhotos.visitor)).toContain('Người thân');
  });
});
