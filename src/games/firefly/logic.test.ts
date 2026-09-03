import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { BLOW_THRESHOLD } from '../birthday/logic';
import {
  BLADES,
  CANDLES,
  CANDLE_LEFT,
  CANDLE_SPAN,
  BREEZE_THRESHOLD,
  CHIRP_MAX_MS,
  CHIRP_MIN_MS,
  FLY_BOTTOM,
  FLY_TOP,
  MAX_WIND,
  glow,
  leanDeg,
  makeBlade,
  makeCandle,
  makeFirefly,
  makeSkyStar,
  nextChirpMs,
  nextShootMs,
  stepFirefly,
  warmth,
  windFrom,
  SHOOT_MIN_MS,
  SHOOT_MAX_MS,
} from './logic';

describe('firefly: what the field is made of', () => {
  it('puts fireflies inside the field and off the grass', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const f = makeFirefly(rng);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(1);
      expect(f.y).toBeGreaterThanOrEqual(FLY_TOP);
      expect(f.y).toBeLessThanOrEqual(FLY_BOTTOM);
      expect(f.size).toBeGreaterThan(0);
    }
  });

  it('keeps every star above the grass line', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const s = makeSkyStar(rng);
      expect(s.y).toBeLessThan(0.62);
      expect(s.size).toBeGreaterThan(0);
      expect(s.dur).toBeGreaterThan(0);
      // A negative delay starts the twinkle mid-cycle, so they never blink in step.
      expect(s.delay).toBeLessThanOrEqual(0);
    }
  });

  it('spreads the blades across the width without leaving the field', () => {
    const rng = mulberry32(3);
    const xs = Array.from({ length: BLADES }, (_, i) => makeBlade(i, BLADES, rng).x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
    // Evenly spread, so no half of the strip is bare.
    expect(xs.filter((x) => x < 0.5).length).toBeGreaterThan(BLADES / 3);
    expect(xs.filter((x) => x >= 0.5).length).toBeGreaterThan(BLADES / 3);
  });
});

describe('firefly: the row of candles', () => {
  it('stands them across the meadow, clear of the microphone button', () => {
    const rng = mulberry32(9);
    const xs = Array.from({ length: CANDLES }, (_, i) => makeCandle(i, CANDLES, rng).x);
    expect(Math.min(...xs)).toBeGreaterThan(0.04);
    // The bottom right corner belongs to 🎤; a candle under it cannot be lit.
    expect(Math.max(...xs)).toBeLessThan(CANDLE_LEFT + CANDLE_SPAN + 0.03);
    // In order, and none on top of another.
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan((xs[i - 1] ?? 0) + 0.04);
  });

  it('gives them different heights and colours', () => {
    const rng = mulberry32(4);
    const made = Array.from({ length: 40 }, (_, i) => makeCandle(i % CANDLES, CANDLES, rng));
    expect(new Set(made.map((c) => c.height.toFixed(3))).size).toBeGreaterThan(20);
    expect(new Set(made.map((c) => c.hue)).size).toBeGreaterThan(20);
    for (const c of made) {
      expect(c.height).toBeGreaterThan(0.5);
      expect(c.hue).toBeGreaterThanOrEqual(0);
      expect(c.hue).toBeLessThanOrEqual(360);
    }
  });

  it('warms the meadow by half on the first flame, and the rest as the row fills', () => {
    expect(warmth(0)).toBe(0);
    expect(warmth(1)).toBe(0.5);
    expect(warmth(CANDLES)).toBe(1);
    // Never goes backwards as more are lit.
    for (let i = 1; i <= CANDLES; i++) expect(warmth(i)).toBeGreaterThanOrEqual(warmth(i - 1));
  });
});

describe('firefly: drift', () => {
  const f = { x: 0.5, y: 0.5, vx: 0, vy: 0, phase: 0, size: 0.06 };

  it('a blow pushes fireflies to the right', () => {
    const still = stepFirefly(f, 0.1, 0, 0);
    const blown = stepFirefly(f, 0.1, 0, MAX_WIND);
    expect(blown.x).toBeGreaterThan(still.x);
  });

  it('never leaves the field, however long the blow lasts', () => {
    let bug = f;
    for (let i = 0; i < 400; i++) bug = stepFirefly(bug, 0.05, i * 0.05, MAX_WIND);
    expect(bug.x).toBeLessThanOrEqual(1);
    expect(bug.y).toBeGreaterThanOrEqual(FLY_TOP);
    expect(bug.y).toBeLessThanOrEqual(FLY_BOTTOM);
  });

  it('turns its own drift around at an edge instead of sticking to it', () => {
    const atEdge = stepFirefly({ ...f, x: 0.999, vx: 0.05 }, 0.1, 0, 0);
    expect(atEdge.x).toBe(1);
    expect(atEdge.vx).toBeLessThan(0);
  });

  it('glows between dim and bright, and no two in step', () => {
    for (let t = 0; t < 12; t += 0.37) {
      const g = glow(f, t);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
    expect(glow(f, 1)).not.toBe(glow({ ...f, phase: 1.7 }, 1));
  });
});

describe('firefly: the breath', () => {
  it('ignores a room that is merely not silent', () => {
    expect(windFrom(0)).toBe(0);
    expect(windFrom(BREEZE_THRESHOLD)).toBe(0);
  });

  it('answers a gentle breath, well before the blow that puts the candle out', () => {
    const gentle = windFrom(BLOW_THRESHOLD / 2);
    expect(gentle).toBeGreaterThan(0);
    expect(gentle).toBeLessThan(MAX_WIND);
  });

  it('is capped, so a shout cannot blow the field away', () => {
    expect(windFrom(1)).toBe(MAX_WIND);
    expect(leanDeg(windFrom(1))).toBe(32);
    expect(leanDeg(0)).toBe(0);
  });
});

describe('firefly: the sky on its own', () => {
  it('leaves a long, uneven wait between shooting stars', () => {
    const rng = mulberry32(13);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const ms = nextShootMs(rng);
      expect(ms).toBeGreaterThanOrEqual(SHOOT_MIN_MS);
      expect(ms).toBeLessThanOrEqual(SHOOT_MAX_MS);
      seen.add(ms);
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe('firefly: night noises', () => {
  it('leaves an uneven gap between chirps', () => {
    const rng = mulberry32(5);
    const gaps = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const ms = nextChirpMs(rng);
      expect(ms).toBeGreaterThanOrEqual(CHIRP_MIN_MS);
      expect(ms).toBeLessThanOrEqual(CHIRP_MAX_MS);
      gaps.add(ms);
    }
    expect(gaps.size).toBeGreaterThan(10);
  });
});
