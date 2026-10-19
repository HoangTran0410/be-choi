import { describe, it, expect } from 'vitest';
import { TRACKS, sampleTrack, makePath, advance, pointAt, isHome, toleranceFor, toBox, cumulative } from './logic';

function pathOf(i: number, w = 400, h = 700, landscape = false) {
  return makePath(sampleTrack(TRACKS[i]!).map((pt) => toBox(pt, w, h, landscape)));
}

describe('trace logic', () => {
  it('every track stays inside the unit box and is long enough', () => {
    for (const t of TRACKS) {
      for (const pt of sampleTrack(t)) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(1);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(1);
      }
    }
    expect(TRACKS.length).toBeGreaterThanOrEqual(5);
  });
  it('cumulative length is monotonic', () => {
    expect(cumulative([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 5 }])).toEqual([0, 5, 6]);
  });
  it('landscape swaps the axes', () => {
    const a = toBox({ x: 0.2, y: 0.9 }, 800, 400, false, 0);
    const b = toBox({ x: 0.2, y: 0.9 }, 800, 400, true, 0);
    expect(a).toEqual({ x: 160, y: 360 });
    expect(b.x).toBeCloseTo(80);
    expect(b.y).toBeCloseTo(80);
  });
  it('following the line reaches home', () => {
    for (let i = 0; i < TRACKS.length; i++) {
      const path = pathOf(i);
      const tol = toleranceFor(400, 700);
      let progress = 0;
      for (let s = 0; s <= path.total; s += 15) progress = advance(path, progress, pointAt(path, s), tol, path.total * 0.3);
      progress = advance(path, progress, pointAt(path, path.total), tol, path.total * 0.3);
      expect(isHome(path, progress)).toBe(true);
    }
  });
  it('is generous: a finger 40 px off the line still pulls the bee along', () => {
    const path = pathOf(1);
    const tol = toleranceFor(400, 700);
    let progress = 0;
    for (let s = 0; s <= path.total; s += 15) {
      const pt = pointAt(path, s);
      progress = advance(path, progress, { x: pt.x + 40, y: pt.y }, tol, path.total * 0.3);
    }
    expect(progress).toBeGreaterThan(path.total * 0.8);
  });
  it('never goes backwards, and ignores a finger far from the line', () => {
    const path = pathOf(0);
    const tol = toleranceFor(400, 700);
    const mid = path.total / 2;
    expect(advance(path, mid, pointAt(path, 10), tol, 200)).toBe(mid);
    expect(advance(path, mid, { x: -500, y: -500 }, tol, 200)).toBe(mid);
    expect(advance(path, 0, { x: 5000, y: 5000 }, tol, 200)).toBe(0);
  });
  it('cannot skip far ahead in one touch', () => {
    const path = pathOf(1);
    const tol = toleranceFor(400, 700);
    const far = pointAt(path, path.total * 0.9);
    expect(advance(path, 0, far, tol, path.total * 0.2)).toBe(0);
  });
  it('pointAt clamps and tolerance has a floor', () => {
    const path = pathOf(0);
    expect(pointAt(path, -5)).toEqual(path.pts[0]);
    expect(pointAt(path, path.total + 5)).toEqual(path.pts[path.pts.length - 1]);
    expect(toleranceFor(200, 200)).toBe(56);
    expect(toleranceFor(1000, 1000)).toBe(140);
  });
});
