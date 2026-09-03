import { describe, it, expect } from 'vitest';
import { concatChunks, createMic, detectPitch, normalizeLevel, rms, smooth, trimSilence, waveformBars } from './mic';

/** A sine of `hz`, one second long, as an AnalyserNode would hand it over. */
function sine(hz: number, sampleRate = 44100, samples = 2048, amp = 0.5): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return out;
}

describe('rms', () => {
  it('is 0 for byte silence (128 is the middle)', () => {
    expect(rms(new Uint8Array(64).fill(128))).toBe(0);
  });

  it('is 1 for a full-scale byte square wave', () => {
    const buf = new Uint8Array(64);
    for (let i = 0; i < buf.length; i++) buf[i] = i % 2 === 0 ? 0 : 255;
    expect(rms(buf)).toBeCloseTo(1, 1);
  });

  it('reads float samples directly', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 5);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});

describe('normalizeLevel', () => {
  it('is 0 while the sound stays at the noise floor', () => {
    expect(normalizeLevel(0.02, 0.02)).toBe(0);
    expect(normalizeLevel(0.01, 0.02)).toBe(0);
  });

  it('grows towards 1 as the voice gets louder, and never past it', () => {
    const quiet = normalizeLevel(0.05, 0.01);
    const loud = normalizeLevel(0.12, 0.01);
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(normalizeLevel(0.9, 0.01)).toBe(1);
  });

  it('needs a louder voice in a noisy room', () => {
    expect(normalizeLevel(0.06, 0.05)).toBeLessThan(normalizeLevel(0.06, 0.0));
  });
});

describe('smooth', () => {
  it('rises faster than it falls', () => {
    const up = smooth(0, 1);
    const down = 1 - smooth(1, 0);
    expect(up).toBeGreaterThan(down);
  });

  it('converges on the target', () => {
    let v = 0;
    for (let i = 0; i < 40; i++) v = smooth(v, 1);
    expect(v).toBeCloseTo(1, 2);
  });
});

describe('detectPitch', () => {
  it('finds the frequency of a sung note', () => {
    for (const hz of [220, 330, 440, 660]) {
      const found = detectPitch(sine(hz), 44100);
      expect(found).not.toBeNull();
      expect(Math.abs((found as number) - hz) / hz).toBeLessThan(0.05);
    }
  });

  it('is null for silence and for noise', () => {
    expect(detectPitch(new Float32Array(2048), 44100)).toBeNull();
    const noise = new Float32Array(2048);
    let seed = 7;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 16807) % 2147483647;
      noise[i] = (seed / 2147483647) * 2 - 1;
    }
    expect(detectPitch(noise, 44100)).toBeNull();
  });

  it('is null for a buffer too short to hold a period', () => {
    expect(detectPitch(sine(440, 44100, 64), 44100)).toBeNull();
  });
});

describe('recording helpers', () => {
  it('joins chunks in order', () => {
    const out = concatChunks([new Float32Array([1, 2]), new Float32Array([3])]);
    expect([...out]).toEqual([1, 2, 3]);
    expect(concatChunks([]).length).toBe(0);
  });

  it('trims silence around the voice but keeps a pad', () => {
    const samples = new Float32Array(1000);
    samples[500] = 0.9;
    const trimmed = trimSilence(samples, 0.02, 10);
    expect(trimmed.length).toBe(21);
    expect(Math.max(...trimmed)).toBeCloseTo(0.9, 5);
  });

  it('returns nothing when the child never made a sound', () => {
    expect(trimSilence(new Float32Array(1000)).length).toBe(0);
  });

  it('makes one bar per slice, loudest first when the voice starts loud', () => {
    const samples = new Float32Array(100);
    for (let i = 0; i < 50; i++) samples[i] = 0.8;
    const bars = waveformBars(samples, 4);
    expect(bars.length).toBe(4);
    expect(bars[0]).toBeCloseTo(0.8, 5);
    expect(bars[3]).toBe(0);
    expect(waveformBars(new Float32Array(0), 3)).toEqual([0, 0, 0]);
  });
});

describe('createMic without a microphone', () => {
  it('reports failure instead of throwing, and stays safe to use', async () => {
    const mic = createMic();
    expect(await mic.start()).toBe(false);
    expect(mic.listening).toBe(false);
    mic.record();
    expect(mic.stopRecord()).toBeNull();
    expect(() => mic.stop()).not.toThrow();
  });
});
