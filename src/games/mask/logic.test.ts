import { describe, it, expect } from 'vitest';
import { MASKS, STAR_AFTER, CENTER, nextIndex, trackMask, placeOnStage, smooth } from './logic';
import { FX } from '../../core/audio';

describe('mask logic', () => {
  it('has unique masks, each with a real voice', () => {
    expect(MASKS.length).toBeGreaterThanOrEqual(STAR_AFTER + 2);
    expect(new Set(MASKS.map((m) => m.id)).size).toBe(MASKS.length);
    for (const m of MASKS) {
      expect(FX).toContain(m.voice);
      expect(m.say.length).toBeGreaterThan(0);
    }
    expect(MASKS.map((m) => m.emoji)).toEqual(expect.arrayContaining(['🐻', '🐱', '🐰', '🦖']));
  });

  it('nextIndex wraps around', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
  });

  it('rewards after STAR_AFTER different masks, never for repeats', () => {
    let st = { seen: [] as readonly string[] };
    for (let i = 0; i < 10; i++) {
      const r = trackMask(st, 'bear');
      expect(r.reward).toBe(false);
      st = r.state;
    }
    let rewarded = 0;
    for (const m of MASKS.slice(0, STAR_AFTER)) {
      const r = trackMask(st, m.id);
      st = r.state;
      if (r.reward) rewarded++;
    }
    expect(rewarded).toBe(1);
    expect(st.seen).toEqual([]);
  });

  it('places a face mirrored on a cover-fit stage', () => {
    const video = { w: 640, h: 480 };
    const stage = { w: 640, h: 480 };
    // Face on the left of the picture shows on the right of a mirror.
    const p = placeOnStage({ x: 40, y: 200, width: 100, height: 100 }, video, stage)!;
    expect(p.x).toBeGreaterThan(0.8);
    const mid = placeOnStage({ x: 270, y: 190, width: 100, height: 100 }, video, stage)!;
    expect(mid.x).toBeCloseTo(0.5, 2);
  });

  it('accounts for cropping when the stage is taller than the video', () => {
    const p = placeOnStage({ x: 270, y: 190, width: 100, height: 100 }, { w: 640, h: 480 }, { w: 390, h: 844 })!;
    expect(p.x).toBeCloseTo(0.5, 1);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(1);
  });

  it('refuses unknown sizes and empty boxes', () => {
    expect(placeOnStage({ x: 0, y: 0, width: 10, height: 10 }, { w: 0, h: 0 }, { w: 100, h: 100 })).toBeNull();
    expect(placeOnStage({ x: 0, y: 0, width: 0, height: 0 }, { w: 10, h: 10 }, { w: 100, h: 100 })).toBeNull();
  });

  it('smooth eases toward the target', () => {
    const s = smooth({ x: 0, y: 0, size: 0.2 }, CENTER, 0.5);
    expect(s.x).toBeCloseTo(CENTER.x / 2);
    expect(smooth(CENTER, CENTER)).toEqual(CENTER);
  });
});
