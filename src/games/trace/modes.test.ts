import { describe, expect, it } from 'vitest';
import { isHome } from './logic';
import {
  BAR_SPACE,
  coverage,
  deriveDots,
  dotsDone,
  fillReady,
  fitBox,
  followTouch,
  hitDot,
  makeFillGrid,
  paintGrid,
  pointInPoly,
  strokePath,
  toPixels,
  toUnit,
  walked,
} from './modes';
import { circle, line, p, polygon, rectFill, type Stroke } from './shapes';

const hLine: Stroke = { segs: line(p(0.1, 0.5), p(0.9, 0.5)), color: '#000' };
const vLine: Stroke = { segs: line(p(0.5, 0.1), p(0.5, 0.9)), color: '#000' };

describe('fitBox', () => {
  it('keeps a square inside the stage, clear of the mode bar, in both orientations', () => {
    for (const [w, h] of [[390, 760], [844, 330], [1024, 700], [300, 300]] as const) {
      const b = fitBox(w, h);
      expect(b.size).toBeGreaterThanOrEqual(100);
      expect(b.x).toBeGreaterThanOrEqual(w > h ? BAR_SPACE : 0);
      expect(b.x + b.size).toBeLessThanOrEqual(w + 0.001);
      expect(b.y).toBeGreaterThanOrEqual(0);
      if (w <= h) expect(b.y + b.size).toBeLessThanOrEqual(h - BAR_SPACE + 0.001);
      else expect(b.y + b.size).toBeLessThanOrEqual(h + 0.001);
    }
  });
  it('maps between pixels and unit coordinates', () => {
    const b = fitBox(400, 600);
    const u = p(0.25, 0.75);
    const back = toUnit(b, toPixels(b, u));
    expect(back.x).toBeCloseTo(0.25);
    expect(back.y).toBeCloseTo(0.75);
  });
});

describe('followTouch', () => {
  const paths = [strokePath(hLine), strokePath(vLine)];
  it('starts any stroke at its start and ignores the middle of an untouched one', () => {
    expect(followTouch(paths, [0, 0], -1, p(0.1, 0.5), 0.1)?.index).toBe(0);
    expect(followTouch(paths, [0, 0], -1, p(0.5, 0.1), 0.1)?.index).toBe(1);
    expect(followTouch(paths, [0, 0], -1, p(0.7, 0.5), 0.1)).toBeNull();
    expect(followTouch(paths, [0, 0], -1, p(0.9, 0.1), 0.1)).toBeNull();
  });
  it('keeps going along the stroke being drawn and never goes backwards', () => {
    const path = paths[0]!;
    const r = followTouch(paths, [path.total * 0.3, 0], 0, p(0.5, 0.52), 0.1)!;
    expect(r.index).toBe(0);
    expect(r.progress).toBeGreaterThan(path.total * 0.3);
    expect(followTouch(paths, [path.total * 0.6, 0], 0, p(0.3, 0.5), 0.05)).toBeNull();
  });
  it('skips finished strokes', () => {
    const done = [paths[0]!.total, 0];
    expect(followTouch(paths, done, -1, p(0.1, 0.5), 0.1)).toBeNull();
    expect(isHome(paths[0]!, done[0]!)).toBe(true);
  });
  it('walked ends exactly at the progress point', () => {
    const w = walked(paths[0]!, paths[0]!.total / 2);
    expect(w[w.length - 1]!.x).toBeCloseTo(0.5);
  });
});

describe('deriveDots', () => {
  it('uses the corners of straight runs', () => {
    const d = deriveDots([{ segs: line(p(0.2, 0.2), p(0.8, 0.8)), color: '#000' }])[0]!;
    expect(d.pts).toHaveLength(2);
    expect(d.closed).toBe(false);
    expect(d.s[0]).toBe(0);
    expect(d.s[1]).toBeCloseTo(d.path.total);
  });
  it('closed polygons get one dot per corner and no duplicate', () => {
    const d = deriveDots([{ segs: polygon([p(0.2, 0.2), p(0.8, 0.2), p(0.8, 0.8), p(0.2, 0.8)]), color: '#000' }])[0]!;
    expect(d.closed).toBe(true);
    expect(d.pts).toHaveLength(4);
  });
  it('samples curves evenly, 8 to 16 dots on a circle, in increasing arc length', () => {
    const d = deriveDots([{ segs: circle(0.5, 0.5, 0.25), color: '#000' }])[0]!;
    expect(d.closed).toBe(true);
    expect(d.pts.length).toBeGreaterThanOrEqual(8);
    expect(d.pts.length).toBeLessThanOrEqual(16);
    for (let i = 1; i < d.s.length; i++) expect(d.s[i]!).toBeGreaterThan(d.s[i - 1]!);
  });
  it('stays within the budget when a picture has many strokes', () => {
    const strokes = Array.from({ length: 12 }, (_, i) => ({ segs: circle(0.5, 0.5, 0.1 + i * 0.03), color: '#000' }));
    const total = deriveDots(strokes, 80).reduce((n, d) => n + d.pts.length, 0);
    expect(total).toBeLessThan(110);
  });
});

describe('hitDot', () => {
  const dots = deriveDots([hLine, vLine]);
  it('only the next dot joins; the wrong dot does nothing', () => {
    expect(hitDot(dots, [-1, -1], -1, p(0.9, 0.5), 0.08)).toBeNull();
    expect(hitDot(dots, [-1, -1], -1, p(0.1, 0.5), 0.08)).toEqual({ stroke: 0, dot: 0 });
    expect(hitDot(dots, [0, -1], 0, p(0.9, 0.5), 0.08)).toEqual({ stroke: 0, dot: 1 });
    expect(hitDot(dots, [0, -1], 0, p(0.1, 0.5), 0.08)).toBeNull();
  });
  it('any stroke may start, and a finished stroke is out of play', () => {
    expect(hitDot(dots, [-1, -1], -1, p(0.5, 0.1), 0.08)?.stroke).toBe(1);
    expect(dotsDone(dots[0]!, 1)).toBe(true);
    expect(hitDot(dots, [1, -1], -1, p(0.9, 0.5), 0.08)).toBeNull();
  });
});

describe('fill grids', () => {
  const fill = rectFill(0.2, 0.2, 0.4, 0.4, '#f00');
  it('finds the cells inside the region', () => {
    expect(pointInPoly(p(0.3, 0.3), fill.pts)).toBe(true);
    expect(pointInPoly(p(0.7, 0.3), fill.pts)).toBe(false);
    const g = makeFillGrid(fill);
    expect(g.cells.length).toBeGreaterThan(100);
    expect(g.cells.every((c) => pointInPoly(c, fill.pts))).toBe(true);
  });
  it('rubbing outside paints nothing; rubbing across fills it up to done', () => {
    const g = makeFillGrid(fill);
    expect(paintGrid(g, null, p(0.9, 0.9), 0.07)).toHaveLength(0);
    expect(coverage(g)).toBe(0);
    let y = 0.2;
    while (!fillReady(g) && y < 0.62) {
      paintGrid(g, p(0.2, y), p(0.6, y), 0.07);
      y += 0.07;
    }
    expect(fillReady(g)).toBe(true);
    expect(coverage(g)).toBeLessThan(1.0001);
  });
  it('a thin sliver still has something to paint', () => {
    const g = makeFillGrid(rectFill(0.1, 0.1, 0.5, 0.004, '#0f0'));
    expect(g.cells.length).toBeGreaterThan(0);
  });
});
