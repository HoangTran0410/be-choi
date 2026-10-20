import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/dom';
import {
  LEARNING_SLOTS,
  MAX_LEVEL,
  activePool,
  isKnown,
  optionCount,
  pickConcepts,
  recordAnswer,
  stationRng,
  statOf,
  weight,
  type Mastery,
} from './picker';

const ORDER = Array.from({ length: 12 }, (_, i) => `L:${String.fromCharCode(65 + i)}`);

function play(m: Mastery, id: string, results: boolean[], turn0 = 1): Mastery {
  let cur = m;
  results.forEach((ok, i) => {
    cur = recordAnswer(cur, id, ok, turn0 + i);
  });
  return cur;
}

describe('levels follow first-try answers', () => {
  it('starts at level 0 with two choices and rises only after right answers in a row', () => {
    let m: Mastery = {};
    expect(optionCount(statOf(m, 'L:A').l)).toBe(2);
    m = recordAnswer(m, 'L:A', true, 1);
    expect(statOf(m, 'L:A').l).toBe(0);
    m = recordAnswer(m, 'L:A', true, 2);
    expect(statOf(m, 'L:A').l).toBe(1);
    expect(optionCount(1)).toBe(3);
  });

  it('a wrong answer in between starts the streak again', () => {
    const m = play({}, 'L:A', [true, false, true]);
    expect(statOf(m, 'L:A').l).toBe(0);
    expect(statOf(m, 'L:A').s).toBe(1);
  });

  it('never goes past the top level, and 4 choices is the most', () => {
    const m = play({}, 'L:A', Array(20).fill(true));
    expect(statOf(m, 'L:A').l).toBe(MAX_LEVEL);
    expect(optionCount(MAX_LEVEL)).toBe(4);
    expect(optionCount(99)).toBe(4);
    expect(optionCount(-1)).toBe(2);
  });

  it('eases back one level after two wrong first tries in a row, never below 0', () => {
    let m = play({}, 'L:A', [true, true, true, true]);
    expect(statOf(m, 'L:A').l).toBe(2);
    m = play(m, 'L:A', [false, false], 10);
    expect(statOf(m, 'L:A').l).toBe(1);
    m = play(m, 'L:B', [false, false, false, false]);
    expect(statOf(m, 'L:B').l).toBe(0);
  });

  it('does not change the old state (pure)', () => {
    const m: Mastery = {};
    recordAnswer(m, 'L:A', true, 1);
    expect(m).toEqual({});
  });

  it('knows a concept once it is steady', () => {
    expect(isKnown({}, 'L:A')).toBe(false);
    expect(isKnown(play({}, 'L:A', [true, true, true, true]), 'L:A')).toBe(true);
  });
});

describe('who gets asked', () => {
  it('introduces only a few new concepts at first', () => {
    expect(activePool(ORDER, {}).length).toBe(LEARNING_SLOTS);
    expect(activePool(ORDER, {}, 5).length).toBe(5);
  });

  it('keeps at most LEARNING_SLOTS concepts being learned, and opens room as they are mastered', () => {
    let m: Mastery = {};
    for (const id of ORDER.slice(0, 3)) m = play(m, id, [false]);
    expect(activePool(ORDER, m).length).toBe(LEARNING_SLOTS);
    for (const id of ORDER.slice(0, 3)) m = play(m, id, [true, true, true, true], 10);
    // three are known now, so five fresh slots open on top of the three met
    expect(activePool(ORDER, m).length).toBe(3 + LEARNING_SLOTS);
  });

  it('prefers what is new or shaky to what is known', () => {
    const known = play({}, 'L:A', [true, true, true, true]);
    expect(weight(statOf(known, 'L:B'), 10)).toBeGreaterThan(weight(statOf(known, 'L:A'), 10));
    const shaky = play({}, 'L:A', [false]);
    expect(weight(statOf(shaky, 'L:A'), 2)).toBeGreaterThan(weight(statOf(known, 'L:A'), 2));
  });

  it('asks about what has not come up for a while before what was just asked', () => {
    const old = recordAnswer({}, 'L:A', true, 1);
    expect(weight(statOf(old, 'L:A'), 40)).toBeGreaterThan(weight(statOf(old, 'L:A'), 2));
  });

  it('picks distinct concepts, honours avoid and is stable for a seed', () => {
    const a = pickConcepts(ORDER, {}, 3, 1, mulberry32(7));
    const b = pickConcepts(ORDER, {}, 3, 1, mulberry32(7));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
    const c = pickConcepts(ORDER, {}, 2, 1, mulberry32(7), a);
    expect(c.some((x) => a.includes(x))).toBe(false);
  });

  it('favours the shaky concept over many draws, but still sometimes asks the known ones', () => {
    let m: Mastery = {};
    m = play(m, 'L:A', [true, true, true, true]); // known
    m = play(m, 'L:B', [false]); // shaky
    m = play(m, 'L:C', [false]);
    const counts: Record<string, number> = {};
    const rng = mulberry32(1);
    for (let i = 0; i < 400; i++) {
      for (const id of pickConcepts(ORDER, m, 1, 20, rng)) counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(counts['L:B']!).toBeGreaterThan(counts['L:A']!);
    expect(counts['L:A']!).toBeGreaterThan(0);
  });

  it('repeats rather than runs dry when there are fewer concepts than questions', () => {
    const got = pickConcepts(['F:a', 'F:b'], {}, 5, 1, mulberry32(3));
    expect(got.length).toBe(5);
    expect(new Set(got).size).toBe(2);
  });

  it('returns nothing for an empty curriculum', () => {
    expect(pickConcepts([], {}, 3, 1, mulberry32(1))).toEqual([]);
  });

  it('seeds a station stream by topic, plays and turn', () => {
    expect(stationRng('letters', 0, 5)()).toBe(stationRng('letters', 0, 5)());
    expect(stationRng('letters', 0, 5)()).not.toBe(stationRng('letters', 1, 5)());
  });
});
