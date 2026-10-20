import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { LETTERS, DIGITS, initialOf } from './logic';
import {
  KNOWN_AT,
  buildCountRound,
  buildFindRound,
  buildLetterRound,
  buildPictureRound,
  chooseTarget,
  easeStreak,
  isKnown,
  letterPool,
  levelFor,
  lookAlikes,
  pickWeighted,
  record,
  weightOf,
  type Mastery,
} from './quiz';
import { MASTERY_KEY, loadMastery, saveMastery } from './progress';

const L = (c: string) => LETTERS.find((l) => l.label === c)!;

describe('mastery', () => {
  it('counts a letter as known after enough first-try finds', () => {
    let m: Mastery = {};
    expect(isKnown(m.B)).toBe(false);
    for (let i = 0; i < KNOWN_AT; i++) m = record(m, 'B', true);
    expect(isKnown(m.B)).toBe(true);
    m = record(m, 'M', false);
    expect(m.M).toEqual({ asked: 1, right: 0 });
  });
  it('record does not change the old map', () => {
    const a: Mastery = {};
    record(a, 'B', true);
    expect(a).toEqual({});
  });
  it('asks about new and shaky letters more than known ones', () => {
    expect(weightOf(undefined)).toBeGreaterThan(weightOf({ asked: 5, right: 1 }));
    expect(weightOf({ asked: 5, right: 1 })).toBeGreaterThan(weightOf({ asked: 9, right: 9 }));
  });
  it('pickWeighted follows weights and survives zeros', () => {
    expect(pickWeighted(['a', 'b'], (x) => (x === 'b' ? 1 : 0), () => 0.5)).toBe('b');
    expect(pickWeighted(['a', 'b'], () => 0, () => 0.9)).toBe('b');
    expect(() => pickWeighted([], () => 1)).toThrow();
  });
  it('prefers letters not known yet, and does not repeat the last one', () => {
    const pool = ['A', 'B', 'C', 'D'].map(L);
    const known: Mastery = {};
    for (const k of ['A', 'B', 'C']) known[k] = { asked: 6, right: 6 };
    const rng = mulberry32(7);
    let d = 0;
    for (let i = 0; i < 200; i++) if (chooseTarget(pool, known, rng).label === 'D') d++;
    expect(d).toBeGreaterThan(120);
    for (let i = 0; i < 50; i++) expect(chooseTarget(pool, known, rng, 'D').label).not.toBe('D');
    expect(chooseTarget([L('A')], {}, rng, 'A').label).toBe('A');
  });
});

describe('levels', () => {
  it('grow from 2 to 4 choices as the streak grows', () => {
    expect(levelFor(0).options).toBe(2);
    expect(levelFor(2).options).toBe(3);
    expect(levelFor(4).confusable).toBe(true);
    expect(levelFor(8).options).toBe(4);
    let last = 0;
    for (let s = 0; s < 12; s++) {
      expect(levelFor(s).options).toBeGreaterThanOrEqual(last);
      last = levelFor(s).options;
    }
  });
  it('eases but never punishes', () => {
    expect(easeStreak(7)).toBe(3);
    expect(easeStreak(0)).toBe(0);
  });
  it('starts with plain letters; marked ones join later', () => {
    expect(letterPool(levelFor(0)).some((g) => g.label === 'Ă')).toBe(false);
    expect(letterPool(levelFor(6)).some((g) => g.label === 'Ă')).toBe(true);
    expect(lookAlikes('B')).toContain('D');
    expect(lookAlikes('Z')).toEqual([]);
  });
});

describe('rounds', () => {
  const rng = mulberry32(42);
  it('letter rounds hold the target once, with unique options', () => {
    for (let streak = 0; streak < 10; streak++) {
      for (let i = 0; i < 30; i++) {
        const level = levelFor(streak);
        const target = chooseTarget(letterPool(level), {}, rng);
        const r = buildLetterRound(target, level, rng);
        expect(r.options.length).toBe(level.options);
        expect(r.options.filter((o) => o.label === target.label).length).toBe(1);
        expect(new Set(r.options.map((o) => o.label)).size).toBe(level.options);
      }
    }
  });
  it('early rounds keep look-alikes apart; later ones bring them together', () => {
    const early = levelFor(0);
    for (let i = 0; i < 40; i++) {
      const r = buildLetterRound(L('B'), early, rng);
      expect(r.options.some((o) => o.label === 'D' || o.label === 'Đ')).toBe(false);
    }
    let withTwin = 0;
    for (let i = 0; i < 40; i++) {
      const r = buildLetterRound(L('B'), levelFor(6), rng);
      if (r.options.some((o) => o.label === 'D' || o.label === 'Đ')) withTwin++;
    }
    expect(withTwin).toBe(40);
  });
  it('picture rounds have exactly one picture starting with the letter, all different', () => {
    for (let streak = 0; streak < 10; streak++) {
      for (let i = 0; i < 30; i++) {
        const level = levelFor(streak);
        const target = chooseTarget(letterPool(level), {}, rng);
        const r = buildPictureRound(target, level, rng);
        expect(r.options.length).toBe(level.options);
        const right = r.options.filter((o) => initialOf(o.word.word) === target.label);
        expect(right.length).toBe(1);
        expect(right[0]!.correct).toBe(true);
        expect(new Set(r.options.map((o) => o.word.emoji)).size).toBe(level.options);
      }
    }
  });
  it('find rounds start with letters and mix in pictures', () => {
    for (let i = 0; i < 20; i++) expect(buildFindRound({ streak: 0, mastery: {} }, rng).kind).toBe('letter');
    const kinds = new Set(Array.from({ length: 60 }, () => buildFindRound({ streak: 3, mastery: {} }, rng).kind));
    expect(kinds.has('picture')).toBe(true);
    expect(kinds.has('letter')).toBe(true);
  });
  it('count rounds have the right number among the choices and stay in range', () => {
    for (let streak = 0; streak < 10; streak++) {
      for (let i = 0; i < 40; i++) {
        const level = levelFor(streak);
        const r = buildCountRound(level, {}, rng);
        expect(r.count).toBeGreaterThanOrEqual(0);
        expect(r.count).toBeLessThanOrEqual(level.maxCount);
        expect(r.options.length).toBe(level.options);
        expect(r.options.filter((o) => o.label === String(r.count)).length).toBe(1);
        expect(new Set(r.options.map((o) => o.label)).size).toBe(level.options);
        expect(DIGITS.map((d) => d.label)).toEqual(expect.arrayContaining(r.options.map((o) => o.label)));
      }
    }
    // no zero among the easy questions
    for (let i = 0; i < 60; i++) expect(buildCountRound(levelFor(0), {}, rng).count).toBeGreaterThan(0);
  });
});

describe('progress save', () => {
  const fake = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
  };
  it('round-trips with a version', () => {
    const s = fake();
    expect(saveMastery({ B: { asked: 4, right: 3 } }, s)).toBe(true);
    expect(JSON.parse(s.data.get(MASTERY_KEY)!).v).toBe(1);
    expect(loadMastery(s)).toEqual({ B: { asked: 4, right: 3 } });
  });
  it('shrugs off nothing, junk, other versions and blocked storage', () => {
    const s = fake();
    expect(loadMastery(s)).toEqual({});
    s.data.set(MASTERY_KEY, 'not json');
    expect(loadMastery(s)).toEqual({});
    s.data.set(MASTERY_KEY, JSON.stringify({ v: 99, stats: { B: { asked: 1, right: 1 } } }));
    expect(loadMastery(s)).toEqual({});
    s.data.set(MASTERY_KEY, JSON.stringify({ v: 1, stats: { B: { asked: 2, right: 9 }, M: 'x', N: { asked: -1, right: 0 } } }));
    expect(loadMastery(s)).toEqual({ B: { asked: 2, right: 2 } });
    expect(loadMastery(null)).toEqual({});
    expect(saveMastery({}, null)).toBe(false);
  });
});
