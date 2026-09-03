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
  sparkAim,
  sparkFade,
  advanceSpark,
  makeBurst,
  makeRocket,
  stepRocket,
  stepSpark,
  stepFirefly,
  warmth,
  windFrom,
  SHOOT_MIN_MS,
  SHOOT_MAX_MS,
  BURSTS,
  MAX_SPARKS,
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
    // Both bottom corners belong to buttons; a candle under one cannot be lit.
    expect(Math.min(...xs)).toBeGreaterThan(0.19);
    expect(Math.max(...xs)).toBeLessThan(0.81);
    expect(CANDLE_LEFT + CANDLE_SPAN).toBeLessThanOrEqual(0.8);
    // In order, and none on top of another.
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan((xs[i - 1] ?? 0) + 0.03);
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

describe('firefly: fireworks', () => {
  it('draws a ring at one distance and a ball at every distance', () => {
    const rng = mulberry32(21);
    const ring = Array.from({ length: 30 }, (_, i) => sparkAim('ring', i, 30, rng));
    for (const a of ring) expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 5);

    const ball = Array.from({ length: 60 }, (_, i) => sparkAim('burst', i, 60, rng));
    const spread = ball.map((a) => Math.hypot(a.x, a.y));
    expect(Math.min(...spread)).toBeLessThan(0.6);
    expect(Math.max(...spread)).toBeGreaterThan(0.9);
  });

  it('gives the flower six petals', () => {
    const n = 240;
    const radii = Array.from({ length: n }, (_, i) => {
      const a = sparkAim('flower', i, n);
      return Math.hypot(a.x, a.y);
    });
    let petals = 0;
    for (let i = 0; i < n; i++) {
      const prev = radii[(i - 1 + n) % n] ?? 0;
      const here = radii[i] ?? 0;
      const next = radii[(i + 1) % n] ?? 0;
      if (here > prev && here >= next) petals++;
    }
    expect(petals).toBe(6);
  });

  it('draws two rings, one inside the other', () => {
    const n = 48;
    const radii = Array.from({ length: n }, (_, i) => {
      const a = sparkAim('rings', i, n);
      return +Math.hypot(a.x, a.y).toFixed(4);
    });
    expect(new Set(radii).size).toBe(2);
    expect(Math.min(...radii)).toBeLessThan(Math.max(...radii) * 0.7);
  });

  it('draws the moon as a crescent whose two edges meet at the horns', () => {
    const n = 40;
    const pts = Array.from({ length: n }, (_, i) => sparkAim('moon', i, n));
    const half = Math.floor(n / 2);
    const outer = pts.slice(0, half);
    const inner = pts.slice(half);
    const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

    // Nothing outside the circle it was cut from.
    for (const a of pts) expect(Math.hypot(a.x, a.y)).toBeLessThan(1.02);
    // The two edges start and finish at the same two points: the horns.
    expect(gap(outer[0]!, inner[0]!)).toBeLessThan(0.05);
    expect(gap(outer.at(-1)!, inner.at(-1)!)).toBeLessThan(0.05);
    // And they are well apart in the middle, or it would be a closed ring.
    const middle = gap(outer[Math.floor(half / 2)]!, inner[Math.floor((n - half) / 2)]!);
    expect(middle).toBeGreaterThan(0.15);
    expect(middle).toBeLessThan(0.7);
  });

  it('draws a face: two eyes above a mouth that curves up at the ends', () => {
    const n = 56;
    const pts = Array.from({ length: n }, (_, i) => sparkAim('smile', i, n));
    const eyes = pts.filter((a) => a.y < -0.15);
    // Two clusters, one either side of the middle.
    expect(eyes.filter((a) => a.x < 0).length).toBeGreaterThan(4);
    expect(eyes.filter((a) => a.x > 0).length).toBeGreaterThan(4);
    // Screen coordinates grow downwards, so a smile is lowest in the middle.
    const mouth = pts.filter((a) => a.y > 0.2);
    expect(mouth.length).toBeGreaterThan(20);
    const middle = mouth.reduce((a, b) => (Math.abs(a.x) < Math.abs(b.x) ? a : b));
    const ends = mouth.reduce((a, b) => (Math.abs(a.x) > Math.abs(b.x) ? a : b));
    expect(middle.y).toBeGreaterThan(ends.y);
  });

  it('draws a heart the right way up, with a dip at the top and a point below', () => {
    const n = 60;
    const heart = Array.from({ length: n }, (_, i) => sparkAim('heart', i, n));
    // Screen coordinates: y grows downwards, so the point of the heart is the largest y.
    const lowest = heart.reduce((a, b) => (a.y > b.y ? a : b));
    expect(Math.abs(lowest.x)).toBeLessThan(0.2);
    expect(lowest.y).toBeGreaterThan(0.6);
    // The dip between the lobes sits above the widest part.
    const middle = heart.filter((a) => Math.abs(a.x) < 0.06);
    expect(Math.min(...middle.map((a) => a.y))).toBeLessThan(0);
    // Symmetric about the middle.
    const left = heart.filter((a) => a.x < 0).length;
    expect(Math.abs(left - n / 2)).toBeLessThanOrEqual(2);
  });

  it('gives the star five points', () => {
    const n = 240;
    const radii = Array.from({ length: n }, (_, i) => {
      const a = sparkAim('star', i, n);
      return Math.hypot(a.x, a.y);
    });
    let peaks = 0;
    for (let i = 0; i < n; i++) {
      const prev = radii[(i - 1 + n) % n] ?? 0;
      const here = radii[i] ?? 0;
      const next = radii[(i + 1) % n] ?? 0;
      if (here > prev && here >= next) peaks++;
    }
    expect(peaks).toBe(5);
  });

  it('throws a willow upwards and lets gravity do the rest', () => {
    const rng = mulberry32(2);
    const up = Array.from({ length: 40 }, (_, i) => sparkAim('willow', i, 40, rng));
    expect(up.filter((a) => a.y < 0).length).toBeGreaterThan(30);

    // A spark thrown up comes back down, and slows on the way.
    let spark = makeBurst('willow', 0.5, 0.4, 40, mulberry32(6))[0];
    if (!spark) throw new Error('no spark');
    const climb = spark.vy;
    const sideways = Math.abs(spark.vx);
    for (let i = 0; i < 60; i++) spark = stepSpark(spark, 1 / 30);
    // Thrown up, now falling: that turn is what makes a willow droop.
    expect(climb).toBeLessThan(0);
    expect(spark.vy).toBeGreaterThan(0);
    // Air has taken the sideways speed away, so it hangs rather than flies off.
    expect(Math.abs(spark.vx)).toBeLessThan(sideways);
    expect(spark.px).not.toBe(spark.x);
  });

  it('burns every spark out, and never floods the sky', () => {
    for (const kind of BURSTS) {
      const made = makeBurst(kind, 0.5, 0.3, 200, mulberry32(3));
      expect(made.length).toBeGreaterThan(20);
      expect(made.length).toBeLessThanOrEqual(MAX_SPARKS);
      for (const spark of made) {
        expect(spark.life).toBeGreaterThan(0);
        expect(spark.hue).toBeGreaterThanOrEqual(0);
        expect(spark.hue).toBeLessThanOrEqual(360);
      }
      // Given long enough, every one of them is gone.
      const alive = made.map((sp) => {
        let cur = sp;
        for (let i = 0; i < 200; i++) cur = stepSpark(cur, 1 / 30);
        return cur;
      });
      expect(alive.every((sp) => sp.life <= 0)).toBe(true);
    }
  });

  it('steps a spark in place, and the copy that reads it agrees', () => {
    const spark = makeBurst('ring', 0.5, 0.4, 200, mulberry32(11))[0];
    if (!spark) throw new Error('no spark');
    const copy = stepSpark(spark, 1 / 30);
    // Hundreds of these run every frame, so the hot path writes into the spark
    // it was given rather than handing back a new one.
    advanceSpark(spark, 1 / 30);
    expect(spark.x).toBe(copy.x);
    expect(spark.y).toBe(copy.y);
    expect(spark.life).toBe(copy.life);
    expect(spark.px).toBe(copy.px);
  });

  it('fades a spark only at the end of its life', () => {
    expect(sparkFade(2)).toBe(1);
    expect(sparkFade(0)).toBe(0);
    expect(sparkFade(0.25)).toBeGreaterThan(0);
    expect(sparkFade(0.25)).toBeLessThan(1);
  });

  it('sends rockets up the middle of the sky, never into a corner', () => {
    const rng = mulberry32(17);
    for (let i = 0; i < 60; i++) {
      const r = makeRocket(rng);
      expect(r.x).toBeGreaterThan(0.1);
      expect(r.x).toBeLessThan(0.9);
      expect(r.top).toBeGreaterThan(0.1);
      expect(r.top).toBeLessThan(0.5);
      // Starts in the grass and climbs.
      expect(r.y).toBeGreaterThan(r.top);
      expect(r.vy).toBeLessThan(0);
      expect(BURSTS).toContain(r.shape);
    }
  });

  it('slows a rocket as it climbs, so it opens near the top of its arc', () => {
    let r = makeRocket(mulberry32(8));
    const start = r.vy;
    for (let i = 0; i < 20; i++) r = stepRocket(r, 1 / 30);
    expect(r.y).toBeLessThan(0.86);
    expect(r.vy).toBeGreaterThan(start);
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
