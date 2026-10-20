import { describe, expect, it } from 'vitest';
import { CAT_COUNT, catHz, songSteps } from '../games/catband/logic';
import { renderCatNote } from './catvoice';
import { SONGS, findSong } from './music';

const SR = 44100;

/** YIN (de Cheveigné & Kawahara 2002): the fundamental of one frame, or 0 when unvoiced. */
function yin(x: Float32Array, start: number, sr: number, fmin = 200, fmax = 2400, size = 1536, thr = 0.12): number {
  const tMax = Math.floor(sr / fmin);
  const tMin = Math.floor(sr / fmax);
  const d = new Float64Array(tMax + 1);
  for (let t = 1; t <= tMax; t++) {
    let s = 0;
    for (let i = 0; i < size; i++) {
      const diff = (x[start + i] as number) - (x[start + i + t] as number);
      s += diff * diff;
    }
    d[t] = s;
  }
  const c = new Float64Array(tMax + 1);
  let run = 0;
  for (let t = 1; t <= tMax; t++) {
    run += d[t] as number;
    c[t] = run > 0 ? ((d[t] as number) * t) / run : 1;
  }
  for (let t = tMin; t < tMax; t++) {
    if ((c[t] as number) < thr) {
      while (t + 1 < tMax && (c[t + 1] as number) < (c[t] as number)) t++;
      // Parabolic interpolation for a sub-sample period.
      const a = c[t - 1] as number;
      const b = c[t] as number;
      const e = c[t + 1] as number;
      const den = a - 2 * b + e;
      const shift = den !== 0 ? (a - e) / (2 * den) : 0;
      return sr / (t + shift);
    }
  }
  return 0;
}

const cents = (hz: number, target: number): number => 1200 * Math.log2(hz / target);

/** F0 of every 10 ms hop between `from` and `to` seconds. */
function track(x: Float32Array, from: number, to: number): number[] {
  const out: number[] = [];
  for (let s = Math.floor(from * SR); s + 1536 + 2205 < Math.min(x.length, to * SR + 3800); s += 441) out.push(yin(x, s, SR));
  return out;
}

describe('a cat singing a note', () => {
  const NAMES = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];

  it('is deterministic, finite, and silent for silly pitches', () => {
    const a = renderCatNote(660);
    const b = renderCatNote(660);
    expect(a.length).toBe(b.length);
    expect(a.every((v, i) => v === b[i] && Number.isFinite(v))).toBe(true);
    const rms = (x: Float32Array) => Math.sqrt(x.reduce((t, v) => t + v * v, 0) / x.length);
    expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(0.9);
    // Every pitch is equally loud, so no cat is the loud one.
    for (const hz of [catHz(0), catHz(4), catHz(7)]) expect(rms(renderCatNote(hz))).toBeCloseTo(0.09, 2);
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(renderCatNote(bad).every((v) => v === 0)).toBe(true);
  });

  it.each([...Array(CAT_COUNT).keys()])('cat %i sings its note within 30 cents, and holds it', (cat) => {
    const target = catHz(cat);
    const x = renderCatNote(target, { sampleRate: SR, dur: 0.7 });
    // Skip the 60 ms scoop into the note; everything after must be on the note.
    const f = track(x, 0.08, 0.5);
    expect(f.length).toBeGreaterThan(20);
    for (const hz of f) {
      expect(hz, `${NAMES[cat]} unvoiced frame`).toBeGreaterThan(0);
      expect(Math.abs(cents(hz, target)), `${NAMES[cat]} ${hz.toFixed(1)} Hz vs ${target.toFixed(1)}`).toBeLessThan(30);
    }
    const sorted = [...f].sort((p, q) => p - q);
    const median = sorted[Math.floor(sorted.length / 2)] as number;
    expect(Math.abs(cents(median, target))).toBeLessThan(10);
    // No glide: the whole held part stays inside a quarter of a semitone.
    expect(cents(sorted[sorted.length - 1] as number, sorted[0] as number)).toBeLessThan(50);
  });

  it('the eight cats make a major scale: C D E F G A B C, in semitones 2 2 1 2 2 2 1', () => {
    const measured = [...Array(CAT_COUNT).keys()].map((cat) => {
      const f = track(renderCatNote(catHz(cat), { sampleRate: SR }), 0.15, 0.45).sort((p, q) => p - q);
      return f[Math.floor(f.length / 2)] as number;
    });
    const steps = measured.slice(1).map((hz, i) => (1200 * Math.log2(hz / (measured[i] as number))) / 100);
    [2, 2, 1, 2, 2, 2, 1].forEach((want, i) => expect(Math.abs((steps[i] as number) - want)).toBeLessThan(0.3));
  });

  it('twinkle, tapped cat by cat in order, comes out as the tune (every interval right)', () => {
    const song = findSong('twinkle') ?? SONGS[0];
    expect(song?.id).toBe('twinkle');
    const steps = songSteps(song as NonNullable<typeof song>);
    const heard: number[] = [];
    const cache = new Map<number, number>();
    for (const s of steps) {
      let hz = cache.get(s.cat);
      if (hz === undefined) {
        const f = track(renderCatNote(catHz(s.cat, s.semis), { sampleRate: SR }), 0.15, 0.45).sort((p, q) => p - q);
        hz = f[Math.floor(f.length / 2)] as number;
        cache.set(s.cat, hz);
      }
      heard.push(hz);
    }
    expect(heard.length).toBe(42);
    // Written melody in semitones above the first note vs. what the ear is given.
    const major = [0, 2, 4, 5, 7, 9, 11, 12];
    for (let i = 1; i < steps.length; i++) {
      const want = (major[(steps[i] as { cat: number }).cat] as number) - (major[(steps[i - 1] as { cat: number }).cat] as number);
      const got = (1200 * Math.log2((heard[i] as number) / (heard[i - 1] as number))) / 100;
      expect(Math.abs(got - want), `interval ${i}`).toBeLessThan(0.3);
    }
  });

  it('a longer note holds the same pitch, a shorter one is clamped to something playable', () => {
    const long = renderCatNote(catHz(4), { sampleRate: SR, dur: 1.4 });
    const f = track(long, 0.1, 1.2);
    for (const hz of f) expect(Math.abs(cents(hz, catHz(4)))).toBeLessThan(30);
    expect(renderCatNote(catHz(4), { sampleRate: SR, dur: 0.01 }).length).toBeGreaterThan(SR * 0.25);
  });
});
