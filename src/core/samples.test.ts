import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_SHIFT, freqToMidi, nearestRoot, pickHit, pickPitched, playbackRate, roundRobin, velocityGain, type SampleSet } from './samples';
import { createSampleBank } from './samplesBank';
import { SAMPLE_SETS } from './samplesManifest';
import { INSTRUMENT_IDS } from './instruments';
import { DRUMS, TIMBRES } from './audio';

const pitched = (midis: number[], extra: Partial<SampleSet> = {}): SampleSet => ({
  kind: 'pitched',
  files: midis.map((midi, i) => ({ f: `x-${i}.m4a`, dur: 1, midi })),
  ...extra,
});

describe('freqToMidi / playbackRate', () => {
  it('maps A4 to 69 and an octave to 12', () => {
    expect(freqToMidi(440)).toBeCloseTo(69, 6);
    expect(freqToMidi(880)).toBeCloseTo(81, 6);
    expect(freqToMidi(261.6256)).toBeCloseTo(60, 3);
  });
  it('plays at the recorded speed on the root, double an octave up, half an octave down', () => {
    expect(playbackRate(60, 60)).toBe(1);
    expect(playbackRate(60, 72)).toBeCloseTo(2, 9);
    expect(playbackRate(72, 60)).toBeCloseTo(0.5, 9);
    expect(playbackRate(60, 67)).toBeCloseTo(1.4983, 3);
  });
});

describe('nearestRoot', () => {
  const roots = [48, 55, 60, 67];
  it('picks the closest root', () => {
    expect(nearestRoot(roots, 49)).toBe(0);
    expect(nearestRoot(roots, 52)).toBe(1);
    expect(nearestRoot(roots, 61)).toBe(2);
    expect(nearestRoot(roots, 90)).toBe(3);
    expect(nearestRoot(roots, 10)).toBe(0);
  });
  it('is exact on a root, and a tie goes to the lower one', () => {
    expect(nearestRoot(roots, 55)).toBe(1);
    expect(nearestRoot(roots, 51.5)).toBe(0);
    expect(nearestRoot([67, 60], 63.5)).toBe(1); // 60 is the lower root, at index 1
  });
  it('does not need the roots in order and says -1 when there are none', () => {
    expect(nearestRoot([72, 48, 60], 50)).toBe(1);
    expect(nearestRoot([], 60)).toBe(-1);
  });
});

describe('pickPitched', () => {
  const set = pitched([48, 60, 72]);
  it('uses the nearest root and the rate that lands on the note', () => {
    const p = pickPitched(set, 440)!; // A4 = 69: nearest 72, three semitones down
    expect(p.index).toBe(2);
    expect(p.rate).toBeCloseTo(2 ** (-3 / 12), 9);
  });
  it('plays a note on a root as recorded', () => {
    const p = pickPitched(set, 261.6256)!;
    expect(p.index).toBe(1);
    expect(p.rate).toBeCloseTo(1, 3);
  });
  it('refuses a note further than a buffer can be bent, so the synth plays it', () => {
    expect(pickPitched(set, 2000)).toBeNull(); // ~B6, 14 semitones over the top root
    expect(pickPitched(set, 40)).toBeNull();
    expect(DEFAULT_MAX_SHIFT).toBe(7);
    expect(pickPitched(pitched([60], { maxShift: 12 }), 440)).not.toBeNull();
  });
  it('keeps every note of a recorded instrument on its recordings, however far the repitch', () => {
    const tight = pitched([67, 79], { maxShift: 4, edgeShift: 7 });
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    // A xylophone recorded from G4 up still plays its low C from G4, not from the synth.
    expect(pickPitched(tight, hz(60))).toEqual({ index: 0, rate: expect.closeTo(2 ** (-7 / 12), 5) });
    expect(pickPitched(tight, hz(73))).not.toBeNull(); // 6 from both roots
    expect(pickPitched(tight, hz(55))).not.toBeNull(); // 12 under the lowest root
    expect(pickPitched(tight, hz(67 - 17))).toBeNull(); // past MIN_RATE: the buffer would sound broken
  });
  it('plays the first root as recorded when no pitch is asked for', () => {
    expect(pickPitched(set, 0)).toEqual({ index: 0, rate: 1 });
    expect(pickPitched(set, Number.NaN)).toEqual({ index: 0, rate: 1 });
  });
  it('gives up on a set with a root that has no pitch', () => {
    expect(pickPitched({ kind: 'pitched', files: [{ f: 'a.m4a', dur: 1 }] }, 440)).toBeNull();
    expect(pickPitched({ kind: 'pitched', files: [] }, 440)).toBeNull();
  });
});

describe('roundRobin', () => {
  it('never gives the same take twice in a row, for any number of takes', () => {
    for (const n of [2, 3, 4, 7]) {
      const next = roundRobin(n);
      let last = -1;
      for (let i = 0; i < 2000; i++) {
        const v = next();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(n);
        expect(v).not.toBe(last);
        last = v;
      }
    }
  });
  it('holds even when the random source is stuck on one value', () => {
    for (const stuck of [0, 0.5, 0.999999]) {
      const next = roundRobin(4, () => stuck);
      let last = -1;
      for (let i = 0; i < 50; i++) {
        const v = next();
        expect(v).not.toBe(last);
        last = v;
      }
    }
  });
  it('uses every take, and has no choice with one', () => {
    const next = roundRobin(4);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(next());
    expect(seen.size).toBe(4);
    const one = roundRobin(1);
    expect([one(), one(), one()]).toEqual([0, 0, 0]);
  });
});

describe('pickHit', () => {
  const hits: SampleSet = { kind: 'hits', files: [{ f: 'a.m4a', dur: 1 }, { f: 'b.m4a', dur: 1 }, { f: 'c.m4a', dur: 1 }] };
  it('takes the round-robin pick and ignores the pitch of an unpitched hit', () => {
    expect(pickHit(hits, () => 2, 880, 440)).toEqual({ index: 2, rate: 1 });
  });
  it('lets a hit that follows pitch move part of the way, within limits', () => {
    const t = { ...hits, follow: 0.5 };
    expect(pickHit(t, () => 0, 880, 440)!.rate).toBeCloseTo(2 ** 0.5 > 1.35 ? 1.35 : 2 ** 0.5, 6);
    expect(pickHit(t, () => 0, 440, 440)!.rate).toBe(1);
    expect(pickHit(t, () => 0, 20, 440)!.rate).toBe(0.75);
  });
  it('has nothing to play without takes', () => {
    expect(pickHit({ kind: 'hits', files: [] }, () => 0)).toBeNull();
  });
});

describe('velocityGain', () => {
  it('rises with the touch and a soft one is never silent', () => {
    expect(velocityGain(1)).toBe(1);
    expect(velocityGain(0)).toBe(0.25);
    expect(velocityGain(0.5)).toBeGreaterThan(velocityGain(0.2));
    expect(velocityGain(Number.NaN)).toBe(1);
    expect(velocityGain(3)).toBe(1);
  });
});

describe('the generated manifest', () => {
  const sets = Object.entries(SAMPLE_SETS);
  it('only names sounds the engine has', () => {
    const known = new Set<string>([...INSTRUMENT_IDS.map((i) => `inst:${i}`), ...TIMBRES.map((t) => `note:${t}`), ...DRUMS.map((d) => `drum:${d}`)]);
    for (const [key] of sets) expect(known.has(key), key).toBe(true);
  });
  it('gives every pitched root a pitch and every held one a loop inside its file', () => {
    for (const [key, set] of sets) {
      expect(set.files.length, key).toBeGreaterThan(0);
      for (const f of set.files) {
        if (set.kind === 'pitched') expect(Number.isFinite(f.midi), `${key} ${f.f}`).toBe(true);
        if (f.loop) {
          expect(f.loop[0], key).toBeGreaterThanOrEqual(0);
          expect(f.loop[1], key).toBeGreaterThan(f.loop[0] + 0.4);
          expect(f.loop[1], key).toBeLessThanOrEqual(f.dur + 0.01);
        }
      }
    }
  });
  it('has no two roots on the same note', () => {
    for (const [key, set] of sets) {
      if (set.kind !== 'pitched') continue;
      const names = set.files.map((f) => Math.round(f.midi!));
      expect(new Set(names).size, key).toBe(names.length);
    }
  });
});

describe('the sample bank', () => {
  const sets: Record<string, SampleSet> = { 'inst:test': pitched([60, 72], { held: true }), 'drum:test': { kind: 'hits', files: [{ f: 'h0.m4a', dur: 1 }, { f: 'h1.m4a', dur: 1 }] } };

  function fakeCtx() {
    const started: { buffer: unknown; rate: number; t0: number }[] = [];
    const ctx = {
      currentTime: 0,
      decodeAudioData: async (raw: ArrayBuffer) => ({ id: new Uint8Array(raw)[0] }),
      createBufferSource() {
        const src = {
          buffer: null as unknown,
          playbackRate: { value: 1 },
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          onended: null as null | (() => void),
          connect: (n: unknown) => n,
          disconnect() {},
          start(t: number) {
            started.push({ buffer: src.buffer, rate: src.playbackRate.value, t0: t });
          },
          stop() {},
        };
        return src;
      },
      createGain() {
        const g = { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect: (n: unknown) => n, disconnect() {} };
        return g;
      },
    };
    return { ctx: ctx as unknown as AudioContext, started };
  }

  async function withFetch<T>(ok: boolean, run: () => Promise<T>): Promise<T> {
    const real = globalThis.fetch;
    let n = 0;
    globalThis.fetch = (async () => (ok ? { ok: true, arrayBuffer: async () => new Uint8Array([++n]).buffer } : { ok: false })) as unknown as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = real;
    }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('plays nothing (so the synth plays) until the set has been decoded, then plays the recording', async () => {
    await withFetch(true, async () => {
      const { ctx, started } = fakeCtx();
      const bank = createSampleBank({ ctx: () => ctx, master: () => ({}) as AudioNode, base: '/', sets });
      expect(bank.play('inst:test', 261.6256, { level: 1, t0: 0, dur: 1 })).toBeNull(); // first tap: loads, synth plays
      await tick();
      const voice = bank.play('inst:test', 261.6256, { level: 1, t0: 0.5, dur: 1 });
      expect(voice).not.toBeNull();
      expect(started).toHaveLength(1);
      expect(started[0]!.t0).toBe(0.5);
      expect(started[0]!.rate).toBeCloseTo(1, 2);
      voice!.stop();
    });
  });

  it('falls back to the synth, with no throw, when the files cannot be fetched', async () => {
    await withFetch(false, async () => {
      const { ctx, started } = fakeCtx();
      let t = 0;
      const bank = createSampleBank({ ctx: () => ctx, master: () => ({}) as AudioNode, base: '/', sets, now: () => t });
      bank.request(['inst:test']);
      await tick();
      expect(bank.play('inst:test', 440, { level: 1, t0: 0 })).toBeNull();
      expect(started).toHaveLength(0);
      t = 60_000; // a minute later it tries again
      expect(bank.play('inst:test', 440, { level: 1, t0: 0 })).toBeNull();
    });
  });

  it('does nothing without a context, and starts the wanted sets once there is one', async () => {
    await withFetch(true, async () => {
      const { ctx, started } = fakeCtx();
      let live: AudioContext | null = null;
      const bank = createSampleBank({ ctx: () => live, master: () => ({}) as AudioNode, base: '/', sets });
      bank.request(['drum:test']);
      expect(bank.play('drum:test', 0, { level: 1, t0: 0 })).toBeNull();
      live = ctx;
      bank.flush();
      await tick();
      expect(bank.play('drum:test', 0, { level: 1, t0: 0 })).not.toBeNull();
      expect(started).toHaveLength(1);
    });
  });

  it('plays different takes on consecutive hits', async () => {
    await withFetch(true, async () => {
      const { ctx, started } = fakeCtx();
      const bank = createSampleBank({ ctx: () => ctx, master: () => ({}) as AudioNode, base: '/', sets });
      bank.request(['drum:test']);
      await tick();
      for (let i = 0; i < 40; i++) bank.play('drum:test', 0, { level: 1, t0: 0 });
      for (let i = 1; i < started.length; i++) expect(started[i]!.buffer).not.toBe(started[i - 1]!.buffer);
    });
  });

  it('ignores a set it does not have', () => {
    const { ctx } = fakeCtx();
    const bank = createSampleBank({ ctx: () => ctx, master: () => ({}) as AudioNode, base: '/', sets });
    expect(bank.play('inst:nothing', 440, { level: 1, t0: 0 })).toBeNull();
  });
});
