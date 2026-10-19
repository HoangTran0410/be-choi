import { describe, expect, it } from 'vitest';
import { PICTURES } from './pictures';
import { arc, circle, line, p, polygon, rect, smooth, strokeEnds } from './shapes';
import type { Cubic } from './logic';

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
const joined = (segs: readonly Cubic[]) => segs.every((s, i) => i === 0 || near(segs[i - 1]![3], s[0]));

describe('shape helpers', () => {
  it('a line runs from a to b', () => {
    const [s] = line(p(0.1, 0.2), p(0.9, 0.8));
    expect(near(s![0], p(0.1, 0.2))).toBe(true);
    expect(near(s![3], p(0.9, 0.8))).toBe(true);
  });

  it('circles and polygons close on themselves and stay joined', () => {
    for (const segs of [circle(0.5, 0.5, 0.3), polygon([p(0.2, 0.8), p(0.5, 0.2), p(0.8, 0.8)]), rect(0.2, 0.2, 0.5, 0.4)]) {
      expect(joined(segs)).toBe(true);
      const [a, b] = strokeEnds({ segs, color: '#000' });
      expect(near(a, b)).toBe(true);
    }
  });

  it('an arc covers the requested sweep and a smooth curve passes through its points', () => {
    const half = arc(0.5, 0.5, 0.3, 0, Math.PI);
    const [a, b] = strokeEnds({ segs: half, color: '#000' });
    expect(near(a, p(0.8, 0.5))).toBe(true);
    expect(near(b, p(0.2, 0.5))).toBe(true);
    const pts = [p(0.1, 0.5), p(0.4, 0.2), p(0.7, 0.8), p(0.9, 0.5)];
    const wave = smooth(pts);
    expect(joined(wave)).toBe(true);
    expect(near(strokeEnds({ segs: wave, color: '#000' })[1], pts[3]!)).toBe(true);
  });
});

describe('pictures', () => {
  it('have unique ids, are inside the unit square, and every stroke is one joined line', () => {
    expect(new Set(PICTURES.map((x) => x.id)).size).toBe(PICTURES.length);
    for (const pic of PICTURES) {
      expect(pic.strokes.length, pic.id).toBeGreaterThan(0);
      for (const s of pic.strokes) {
        expect(joined(s.segs), `${pic.id} stroke is not joined`).toBe(true);
        for (const seg of s.segs)
          for (const pt of seg) {
            expect(pt.x, pic.id).toBeGreaterThanOrEqual(-0.001);
            expect(pt.x, pic.id).toBeLessThanOrEqual(1.001);
            expect(pt.y, pic.id).toBeGreaterThanOrEqual(-0.001);
            expect(pt.y, pic.id).toBeLessThanOrEqual(1.001);
          }
      }
    }
  });
});
