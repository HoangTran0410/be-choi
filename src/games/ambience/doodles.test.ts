import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { DOODLE_NAMES, doodle } from './doodles';

describe('doodles', () => {
  it('knows plenty of different pictures', () => {
    expect(DOODLE_NAMES.length).toBeGreaterThanOrEqual(12);
  });

  it('draws every picture as strokes that stay inside the box', () => {
    for (let seed = 0; seed < 200; seed++) {
      const d = doodle(mulberry32(seed));
      expect(d.strokes.length).toBeGreaterThan(0);
      for (const st of d.strokes) {
        expect(st.pts.length).toBeGreaterThan(0);
        for (const [x, y] of st.pts) {
          expect(Math.abs(x)).toBeLessThanOrEqual(1.05);
          expect(Math.abs(y)).toBeLessThanOrEqual(1.05);
        }
      }
    }
  });

  it('never draws the same picture twice running, and gets round to all of them', () => {
    const rng = mulberry32(7);
    const seen = new Set<string>();
    let last: string | undefined;
    for (let i = 0; i < 400; i++) {
      const d = doodle(rng, last);
      expect(d.name).not.toBe(last);
      seen.add(d.name);
      last = d.name;
    }
    expect(seen.size).toBe(DOODLE_NAMES.length);
  });
});
