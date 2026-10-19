import { describe, expect, it } from 'vitest';
import { PICTURES } from './pictures';

describe('picture library', () => {
  it('has at least 24 pictures with the first four in teaching order', () => {
    expect(PICTURES.length).toBeGreaterThanOrEqual(24);
    expect(PICTURES.slice(0, 4).map((x) => x.id)).toEqual(['sun', 'house', 'flower', 'mountain']);
  });

  it('gives every picture a name, icon, paper colour, a few strokes and at least one fill', () => {
    expect(new Set(PICTURES.map((x) => x.bg)).size).toBe(PICTURES.length);
    for (const pic of PICTURES) {
      expect(pic.name.trim().length, pic.id).toBeGreaterThan(0);
      expect(pic.icon.length, pic.id).toBeGreaterThan(0);
      expect(pic.strokes.length, pic.id).toBeGreaterThanOrEqual(2);
      expect(pic.strokes.length, pic.id).toBeLessThanOrEqual(12);
      expect(pic.fills.length, pic.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps strokes and fills clear of the edge of the square', () => {
    for (const pic of PICTURES) {
      const pts = [...pic.strokes.flatMap((s) => s.segs.flat()), ...pic.fills.flatMap((f) => f.pts)];
      for (const pt of pts) {
        expect(pt.x, pic.id).toBeGreaterThanOrEqual(0.04);
        expect(pt.x, pic.id).toBeLessThanOrEqual(0.96);
        expect(pt.y, pic.id).toBeGreaterThanOrEqual(0.04);
        expect(pt.y, pic.id).toBeLessThanOrEqual(0.96);
      }
      for (const f of pic.fills) expect(f.pts.length, pic.id).toBeGreaterThanOrEqual(3);
    }
  });
});
