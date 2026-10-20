import { describe, expect, it } from 'vitest';
import { makePath, sampleTrack } from '../trace/logic';
import { PICTURES } from '../trace/pictures';
import { brightness, completeAll, distToSegment2, drawnCount, makeTemplate, nextToDraw, progressOf, strokeCoverage, templateDone, touchTemplate } from './template';

const house = PICTURES.find((p) => p.id === 'house')!;

/** The child traces a stroke of the picture with a steady hand. */
function trace(tpl: ReturnType<typeof makeTemplate>, i: number, tol = 0.05) {
  const pts = makePath(sampleTrack(house.strokes[i]!.segs)).pts;
  let prev = null as (typeof pts)[number] | null;
  for (const q of pts) {
    touchTemplate(tpl, prev, q, tol);
    prev = q;
  }
}

describe('template', () => {
  it('samples every stroke of a picture, none lit at first', () => {
    const t = makeTemplate(house);
    expect(t.strokes.length).toBe(house.strokes.length);
    for (const s of t.strokes) {
      expect(s.samples.length).toBeGreaterThanOrEqual(3);
      expect(s.litCount).toBe(0);
      expect(brightness(s)).toBe(0);
    }
    expect(templateDone(t)).toBe(false);
    expect(progressOf(t)).toBe(0);
  });

  it('measures the distance to a segment', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    expect(distToSegment2({ x: 0.5, y: 0.3 }, a, b)).toBeCloseTo(0.09);
    expect(distToSegment2({ x: 2, y: 0 }, a, b)).toBeCloseTo(1);
    expect(distToSegment2({ x: 1, y: 1 }, a, a)).toBeCloseTo(2);
  });

  it('lines far from the template change nothing (nothing is wrong, nothing counts)', () => {
    const t = makeTemplate(house);
    const r = touchTemplate(t, { x: 0, y: 0 }, { x: 0.01, y: 0.01 }, 0.05);
    expect(r.lit).toBe(0);
    expect(r.finished).toEqual([]);
    expect(drawnCount(t)).toBe(0);
  });

  it('drawing close to a stroke lights it more and more, then finishes it once', () => {
    const t = makeTemplate(house);
    const pts = makePath(sampleTrack(house.strokes[0]!.segs)).pts;
    const half = pts.slice(0, Math.floor(pts.length / 2));
    let prev = null as (typeof pts)[number] | null;
    for (const q of half) {
      touchTemplate(t, prev, q, 0.05);
      prev = q;
    }
    const mid = brightness(t.strokes[0]!);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(1);
    const finishedAt: number[] = [];
    for (const q of pts) {
      const r = touchTemplate(t, prev, q, 0.05);
      finishedAt.push(...r.finished);
      prev = q;
    }
    expect(finishedAt).toEqual([0]);
    expect(t.strokes[0]!.done).toBe(true);
    expect(brightness(t.strokes[0]!)).toBe(1);
    // drawing it again never "finishes" it twice
    expect(touchTemplate(t, null, pts[3]!, 0.05).finished).toEqual([]);
  });

  it('the order does not matter: tracing every stroke, last first, completes the picture', () => {
    const t = makeTemplate(house);
    for (let i = house.strokes.length - 1; i >= 0; i--) trace(t, i);
    expect(templateDone(t)).toBe(true);
    expect(progressOf(t)).toBe(1);
  });

  it('a tap lights the samples under it', () => {
    const t = makeTemplate(house);
    const p = t.strokes[0]!.samples[0]!;
    expect(touchTemplate(t, null, p, 0.04).lit).toBeGreaterThan(0);
  });

  it('points at the unfinished stroke closest to done', () => {
    const t = makeTemplate(house);
    expect(nextToDraw(t)).toBe(0);
    trace(t, 2, 0.06);
    t.strokes[1]!.litCount = 3;
    t.strokes[1]!.lit.fill(false, 0);
    expect(nextToDraw(t)).not.toBe(2);
    completeAll(t);
    expect(nextToDraw(t)).toBe(-1);
    expect(strokeCoverage(t.strokes[0]!)).toBe(1);
  });
});
