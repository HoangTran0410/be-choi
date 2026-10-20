import { describe, expect, it } from 'vitest';
import { PER_ROW, cellRects, countLayout } from './countgrid';

/** Boxes from a tiny phone's stimulus strip to a tablet's answer tile. */
const BOXES: Array<[number, number]> = [
  [100, 80],
  [160, 96],
  [166, 100],
  [220, 120],
  [250, 190],
  [300, 64],
  [120, 120],
  [200, 200],
  [336, 150],
  [600, 260],
  [1000, 500],
  [72, 72],
  [40, 40],
];

describe('countLayout', () => {
  it('has a picture for every number from 0 to 20 in every box', () => {
    for (let n = 0; n <= 20; n++)
      for (const [w, h] of BOXES) {
        const l = countLayout(n, w, h);
        expect(l.rows.reduce((a, b) => a + b, 0)).toBe(n);
        expect(cellRects(l).length).toBe(n);
      }
  });

  it('never goes outside the box', () => {
    for (let n = 0; n <= 20; n++)
      for (const [w, h] of BOXES) {
        const l = countLayout(n, w, h);
        expect(l.width, `n=${n} ${w}x${h}`).toBeLessThanOrEqual(w + 1e-6);
        expect(l.height, `n=${n} ${w}x${h}`).toBeLessThanOrEqual(h + 1e-6);
        for (const r of cellRects(l)) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, `n=${n} ${w}x${h}`).toBeLessThanOrEqual(w + 1e-6);
          expect(r.y + r.h, `n=${n} ${w}x${h}`).toBeLessThanOrEqual(h + 1e-6);
        }
      }
  });

  it('never lets two pictures overlap', () => {
    for (let n = 2; n <= 20; n++)
      for (const [w, h] of BOXES) {
        const rs = cellRects(countLayout(n, w, h));
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i]!;
            const b = rs[j]!;
            const apart = a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6;
            expect(apart, `n=${n} ${w}x${h} cells ${i}/${j}`).toBe(true);
          }
      }
  });

  it('keeps pictures readable: big enough for the box, never tiny while the box has room', () => {
    for (let n = 1; n <= 20; n++) {
      // the strip on a small phone (about 166 × 100): at least ~14 px even for twenty
      expect(countLayout(n, 166, 100).cell, `n=${n}`).toBeGreaterThanOrEqual(14);
      // an answer tile of 120 px
      expect(countLayout(n, 104, 104).cell, `n=${n}`).toBeGreaterThanOrEqual(12);
    }
    // up to ten (all the game asks) stays comfortably large
    for (let n = 1; n <= 10; n++) expect(countLayout(n, 220, 120).cell, `n=${n}`).toBeGreaterThanOrEqual(24);
  });

  it('past a full row, more pictures never get bigger cells than fewer (four may sit 2 + 2, so it is not asked below five)', () => {
    for (const [w, h] of BOXES)
      for (let n = 5; n < 20; n++) expect(countLayout(n + 1, w, h).cell).toBeLessThanOrEqual(countLayout(n, w, h).cell);
  });

  it('groups in fives with a border once there are more than five', () => {
    for (let n = 1; n <= 20; n++) {
      const l = countLayout(n, 300, 200);
      expect(l.framed).toBe(n > PER_ROW);
      if (n > PER_ROW) {
        expect(l.rows.slice(0, -1).every((r) => r === PER_ROW)).toBe(true);
        expect(l.rows.at(-1)).toBeLessThanOrEqual(PER_ROW);
      } else {
        expect(l.rows.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('stays inside a pathological box too', () => {
    const l = countLayout(20, 0, 0);
    expect(l.cell).toBeGreaterThanOrEqual(1);
    expect(countLayout(-3, 100, 100).rows).toEqual([]);
    expect(countLayout(7, 100, 100, 30).cell).toBeLessThanOrEqual(30);
  });
});
