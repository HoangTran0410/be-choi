import { describe, expect, it } from 'vitest';
import { LETTERS, TAP_LENGTH, emptySave, levelFor, loadSave, nextLetter, newStroke, persist, placeStrokes, stepStroke, tolPx } from './logic';

describe('writing letters', () => {
  it('has the starter letters, each with a word and strokes inside the paper', () => {
    expect(LETTERS.length).toBeGreaterThanOrEqual(12);
    for (const l of LETTERS) {
      expect(l.word.length).toBeGreaterThan(0);
      expect(l.strokes.length).toBeGreaterThan(0);
      for (const s of placeStrokes(l)) {
        expect(s.path.pts.length).toBeGreaterThan(1);
        for (const pt of s.path.pts) {
          expect(pt.x).toBeGreaterThan(0.02);
          expect(pt.x).toBeLessThan(0.98);
          expect(pt.y).toBeGreaterThan(0.05);
          expect(pt.y).toBeLessThan(0.95);
        }
      }
    }
  });

  it('every stroke can be walked from start to end by a finger on the line', () => {
    for (const l of LETTERS) {
      for (const [i, s] of placeStrokes(l).entries()) {
        const st = newStroke();
        let started = true;
        for (const pt of s.path.pts) {
          stepStroke(s, st, pt, 0.06, started);
          started = false;
        }
        expect(st.done, `${l.ch} stroke ${i}`).toBe(true);
      }
    }
  });

  it('ignores a finger that starts far from the stroke start or runs backwards', () => {
    const s = placeStrokes(LETTERS.find((l) => l.ch === 'n')!)[0]!;
    const st = newStroke();
    const end = s.path.pts[s.path.pts.length - 1]!;
    expect(stepStroke(s, st, end, 0.05, true).moved).toBe(false);
    expect(st.progress).toBe(0);
    for (const pt of s.path.pts.slice(0, 20)) stepStroke(s, st, pt, 0.05, false);
    const was = st.progress;
    stepStroke(s, st, s.path.pts[2]!, 0.05, false);
    expect(st.progress).toBe(was);
  });

  it('dots are touched, not dragged', () => {
    const dot = placeStrokes(LETTERS.find((l) => l.ch === 'i')!)[1]!;
    expect(dot.tap).toBe(true);
    expect(dot.path.total).toBeLessThan(TAP_LENGTH);
    const st = newStroke();
    expect(stepStroke(dot, st, { x: 0.9, y: 0.9 }, 0.1, true).done).toBe(false);
    expect(stepStroke(dot, st, dot.path.pts[0]!, 0.1, true).done).toBe(true);
  });

  it('gets stricter with progress but never too tight', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(20)).toBe(3);
    expect(tolPx(390, 844, 3)).toBeLessThan(tolPx(390, 844, 1));
    expect(tolPx(100, 100, 3)).toBeGreaterThanOrEqual(40);
  });

  it('suggests the next unwritten letter and saves versioned progress', () => {
    expect(nextLetter('o', ['c'])).toBe('a');
    expect(nextLetter('o', LETTERS.map((l) => l.ch))).toBe('c');
    expect(loadSave()).toEqual(emptySave());
    persist({ v: 1, done: ['o', 'zz'], last: 'c' });
    expect(JSON.parse(localStorage.getItem('be-choi:writing')!).v).toBe(1);
    expect(loadSave().done).toEqual(['o']);
    localStorage.clear();
  });
});
