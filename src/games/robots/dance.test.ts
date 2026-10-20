import { describe, it, expect } from 'vitest';
import { DANCES, pose, type Pose } from './dance';

const KEYS: (keyof Pose)[] = ['y', 'rot', 'sx', 'sy', 'head', 'armL', 'armR', 'prop'];

describe('dances', () => {
  it('give finite, bounded poses at every beat for every level', () => {
    for (const d of DANCES) {
      for (const level of [1, 2, 3]) {
        for (let b = 0; b <= 4; b += 0.05) {
          const p = pose(d, b, level, 0.5);
          for (const k of KEYS) expect(Number.isFinite(p[k]), `${d} ${k}`).toBe(true);
          expect(Math.abs(p.y)).toBeLessThan(0.25);
          expect(Math.abs(p.rot)).toBeLessThan(25);
          expect(Math.abs(p.head)).toBeLessThan(30);
          expect(Math.abs(p.armL)).toBeLessThan(70);
          expect(Math.abs(p.armR)).toBeLessThan(70);
          expect(p.sx).toBeGreaterThan(0.8);
          expect(p.sy).toBeGreaterThan(0.8);
        }
      }
    }
  });

  it('repeat exactly every 4 beats, so the loop has no seam', () => {
    for (const d of DANCES) {
      for (const level of [1, 3]) {
        for (const b of [0, 0.3, 1.25, 2.9, 3.7]) {
          const a = pose(d, b, level);
          const c = pose(d, b + 4, level);
          for (const k of KEYS) expect(c[k], `${d} ${k} @${b}`).toBeCloseTo(a[k], 6);
        }
      }
    }
  });

  it('every dance is different from the others', () => {
    const sig = DANCES.map((d) =>
      [0, 0.25, 0.5, 0.75, 1, 1.5, 2.2, 3]
        .map((b) => {
          const p = pose(d, b, 2);
          return KEYS.map((k) => p[k].toFixed(2)).join(',');
        })
        .join(';'),
    );
    expect(new Set(sig).size).toBe(DANCES.length);
  });

  it('the feet land on the beat: no lift exactly on a whole beat for the hopping dances', () => {
    for (const d of ['tap', 'bob', 'strum', 'mallet', 'bow', 'ring'] as const) {
      expect(pose(d, 1, 2).y).toBeCloseTo(0, 6);
      expect(pose(d, 1.5, 2).y).toBeGreaterThan(0.02);
    }
  });

  it('a played note makes the robot pop, and bigger levels dance bigger', () => {
    const calm = pose('bob', 1.5, 2, 0);
    const hit = pose('bob', 1.5, 2, 1);
    expect(hit.sy).toBeGreaterThan(calm.sy);
    expect(hit.y).toBeGreaterThan(calm.y);
    expect(pose('bob', 1.5, 3).y).toBeGreaterThan(pose('bob', 1.5, 1).y);
  });
});
