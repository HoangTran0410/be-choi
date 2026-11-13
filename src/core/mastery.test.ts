import { describe, expect, it } from 'vitest';
import { applyAnswer, dayNumber, domainOf, dueIds, emptySkills, loadSkills, recordSkill, summarize, SKILLS_KEY } from './mastery';
import type { Backend } from './save';

function memory(): Backend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('mastery', () => {
  it('climbs one box per day on right answers and drops to 1 on a miss', () => {
    let s = emptySkills();
    s = applyAnswer(s, 'num:3', true, 100);
    expect(s.skills['num:3']!.b).toBe(1);
    s = applyAnswer(s, 'num:3', true, 100); // same day: no extra climb
    expect(s.skills['num:3']!.b).toBe(1);
    s = applyAnswer(s, 'num:3', true, 101);
    s = applyAnswer(s, 'num:3', true, 103);
    expect(s.skills['num:3']!.b).toBe(3);
    s = applyAnswer(s, 'num:3', false, 104);
    expect(s.skills['num:3']!.b).toBe(1);
    expect(s.skills['num:3']!.a).toBe(5);
    expect(s.skills['num:3']!.r).toBe(4);
  });

  it('brings concepts back after their box interval, most overdue first', () => {
    let s = emptySkills();
    s = applyAnswer(s, 'letter:a', true, 10); // box 1 → due day 11
    s = applyAnswer(s, 'letter:b', false, 10); // box 0 → due day 10
    expect(dueIds(s, 10)).toEqual(['letter:b']);
    expect(dueIds(s, 11)).toEqual(['letter:b', 'letter:a']);
    expect(dueIds(s, 11, (id) => id === 'letter:a')).toEqual(['letter:a']);
  });

  it('summarizes per domain', () => {
    let s = emptySkills();
    for (const d of [1, 2, 4]) s = applyAnswer(s, 'color:red', true, d);
    s = applyAnswer(s, 'color:blue', true, 4);
    s = applyAnswer(s, 'num:1', true, 4);
    const sum = summarize(s, 4);
    expect(sum[0]).toEqual({ domain: 'color', met: 2, solid: 1, due: 0 });
    expect(sum[1]!.domain).toBe('num');
  });

  it('persists, survives corrupt storage and splits domains', () => {
    const st = memory();
    recordSkill('tone:sắc', true, new Date(2026, 10, 13), st);
    expect(loadSkills(st).skills['tone:sắc']!.b).toBe(1);
    st.data.set(SKILLS_KEY, '{bad');
    expect(loadSkills(st)).toEqual(emptySkills());
    expect(domainOf('tone:sắc')).toBe('tone');
    expect(dayNumber(new Date(2026, 10, 14)) - dayNumber(new Date(2026, 10, 13))).toBe(1);
  });
});
