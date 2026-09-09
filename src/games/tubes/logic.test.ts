import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { SPARE_TUBES, bestLayout, canMove, dealLevel, isSolved, isTubeDone, levelSetup, paletteFor, suggestMove, tubeAt } from './logic';

describe('tubes levels', () => {
  it('climbs colours then ball count, and stays on the last rung', () => {
    expect(levelSetup(0)).toEqual({ colors: 2, height: 3, tubes: 4 });
    expect(levelSetup(1)).toEqual({ colors: 3, height: 3, tubes: 5 });
    expect(levelSetup(3)).toEqual({ colors: 4, height: 4, tubes: 6 });
    expect(levelSetup(6)).toEqual({ colors: 6, height: 5, tubes: 8 });
    expect(levelSetup(99)).toEqual(levelSetup(6));
    // Every level is `colors` full tubes plus the empties to work in.
    for (let i = 0; i < 8; i++) {
      const l = levelSetup(i);
      expect(l.tubes).toBe(l.colors + SPARE_TUBES);
    }
  });
});

describe('tubes deal', () => {
  it('fills one tube per colour, leaves the spares empty, and never hands over a finished tube', () => {
    for (let index = 0; index < 8; index++) {
      const d = dealLevel(index, mulberry32(index + 1));
      const { height, colors } = d.level;
      expect(d.tubes.length).toBe(d.level.tubes);
      expect(d.palette.length).toBe(colors);
      expect(d.tubes.slice(colors).every((t) => t.length === 0)).toBe(true);
      expect(d.tubes.slice(0, colors).every((t) => t.length === height)).toBe(true);
      const counts = new Map<string, number>();
      for (const t of d.tubes) for (const c of t) counts.set(c, (counts.get(c) ?? 0) + 1);
      expect(counts.size).toBe(colors);
      for (const n of counts.values()) expect(n).toBe(height);
      expect(d.tubes.some((t) => isTubeDone(t, height))).toBe(false);
      expect(isSolved(d.tubes, height)).toBe(false);
    }
  });
  it('brings the colours in most different first, and the same order every time', () => {
    expect(paletteFor(2).map((c) => c.id)).toEqual(['red', 'blue']);
    expect(paletteFor(4).map((c) => c.id)).toEqual(['red', 'blue', 'yellow', 'green']);
    // Red next to pink is a colour puzzle a two-year-old cannot see: pink comes last.
    expect(paletteFor(6).map((c) => c.id)).not.toContain('pink');
  });
  it('is deterministic for a given rng', () => {
    expect(dealLevel(2, mulberry32(7)).tubes).toEqual(dealLevel(2, mulberry32(7)).tubes);
  });
});

describe('tubes rules', () => {
  it('a tube is done when it is full and all one colour', () => {
    expect(isTubeDone(['red', 'red', 'red'], 3)).toBe(true);
    expect(isTubeDone(['red', 'red'], 3)).toBe(false);
    expect(isTubeDone(['red', 'red', 'blue'], 3)).toBe(false);
    expect(isTubeDone([], 3)).toBe(false);
  });
  it('the round is won when every tube is empty or done', () => {
    expect(isSolved([['red', 'red'], [], ['blue', 'blue']], 2)).toBe(true);
    expect(isSolved([[], []], 2)).toBe(true);
    // Same colour split over two tubes is not finished, however tidy it looks.
    expect(isSolved([['red'], ['red'], ['blue', 'blue']], 2)).toBe(false);
    expect(isSolved([['red', 'blue'], []], 2)).toBe(false);
  });
  it('any ball goes into any tube that has room', () => {
    const b = [['red', 'blue'], ['green'], []];
    expect(canMove(b, 0, 2, 2)).toBe(true);
    // Colour never blocks a move: only a full tube and an empty one do.
    expect(canMove(b, 0, 1, 2)).toBe(true);
    expect(canMove(b, 1, 0, 2)).toBe(false);
    expect(canMove(b, 2, 0, 2)).toBe(false);
    expect(canMove(b, 0, 0, 2)).toBe(false);
    expect(canMove(b, 0, 9, 2)).toBe(false);
  });
});

describe('tubes hint', () => {
  it('prefers landing on the same colour, and the bigger pile of it', () => {
    expect(suggestMove([['blue', 'red'], ['red'], ['red', 'red'], []], 3)).toEqual({ from: 0, to: 2 });
  });
  it('falls back to an empty tube, and leaves a tube that is already sorted alone', () => {
    expect(suggestMove([['blue', 'red'], []], 3)).toEqual({ from: 0, to: 1 });
    // Tube 0 is pure red: take the red off the blue rather than shuffle tube 0 away.
    expect(suggestMove([['red', 'red'], ['blue', 'red'], []], 3)).toEqual({ from: 1, to: 0 });
  });
  it('looks only at the tube whose ball is already in hand', () => {
    const b = [['blue', 'red'], ['red'], []];
    expect(suggestMove(b, 3)).toEqual({ from: 0, to: 1 });
    expect(suggestMove(b, 3, 1)).toEqual({ from: 1, to: 0 });
  });
  it('has nothing to say about a solved board', () => {
    expect(suggestMove([['red', 'red'], [], ['blue', 'blue']], 2)).toBeNull();
  });
});

describe('tubes layout', () => {
  it('uses one row when it is roomier that way, two when the tubes are cramped', () => {
    // Tablet, 4 tubes: one row, the balls limited by the height of the stage.
    expect(bestLayout(4, 4, 1000, 600)).toMatchObject({ rows: 1, cols: 4 });
    // Phone portrait, 8 tubes of 5: two rows of 4 beat one row of 8.
    expect(bestLayout(8, 5, 390, 700)).toMatchObject({ rows: 2, cols: 4 });
  });
  it('keeps every layout inside the area it was given', () => {
    for (const [tubes, height, w, h] of [
      [4, 3, 390, 700],
      [8, 5, 844, 300],
      [6, 4, 1024, 620],
    ] as const) {
      const lay = bestLayout(tubes, height, w, h);
      expect(lay.ball).toBeGreaterThan(0);
      expect(lay.cols * lay.ball * 1.6).toBeLessThanOrEqual(w + 1);
      expect(lay.ball * (lay.rows * (height + 1.15) + (lay.rows - 1) * 0.35 + 0.55)).toBeLessThanOrEqual(h + 1);
      expect(lay.cols * lay.rows).toBeGreaterThanOrEqual(tubes);
    }
  });
});

describe('tubeAt', () => {
  const rects = [
    { left: 0, top: 0, width: 60, height: 300 },
    { left: 100, top: 0, width: 60, height: 300 },
  ];
  it('finds the tube under the point', () => {
    expect(tubeAt({ x: 30, y: 150 }, rects, 40)).toBe(0);
    expect(tubeAt({ x: 130, y: 10 }, rects, 40)).toBe(1);
  });
  it('picks the nearest tube when the ball lands between them or above the rim', () => {
    expect(tubeAt({ x: 90, y: 150 }, rects, 40)).toBe(1);
    expect(tubeAt({ x: 30, y: -20 }, rects, 40)).toBe(0);
  });
  it('gives up when even the nearest tube is further away than the slack', () => {
    expect(tubeAt({ x: 300, y: 150 }, rects, 40)).toBe(-1);
    expect(tubeAt({ x: 30, y: 150 }, [], 40)).toBe(-1);
  });
});
