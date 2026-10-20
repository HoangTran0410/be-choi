/**
 * A cat that sings a note: "mmmi-a-ou" on ONE steady pitch.
 *
 * Why not retune the recorded meows: a real meow glides by two or three
 * semitones (and the kitten take jumps an octave), so playing it faster or slower
 * moves the whole glide and the ear finds no note in it: eight cats sound random
 * and a tune cannot be told. Here the voice is built from harmonics of one
 * fundamental that never moves (apart from a ~1/3-semitone vibrato and a 30 ms
 * scoop into the note), shaped by a vowel that slides m → i → a → u, which is what
 * makes it a meow and not a flute. Pitch and vowel are independent, so the note is
 * exactly the one asked for and `catvoice.test.ts` measures it.
 *
 * Pure maths, no Web Audio: the same function is rendered offline in the tests.
 */

/** Formants (Hz) with their bandwidth and weight: where the mouth makes the voice loud. */
type Formant = readonly [freq: number, bw: number, gain: number];
type Vowel = readonly [Formant, Formant, Formant];

// "m" (lips shut: a low hum, nothing above ~1.2 kHz), then i, a, u.
const M: Vowel = [
  [280, 90, 1],
  [1000, 200, 0.12],
  [2200, 300, 0.02],
];
const I: Vowel = [
  [330, 100, 1],
  [2500, 250, 0.6],
  [3300, 300, 0.25],
];
const A: Vowel = [
  [850, 130, 1],
  [1500, 180, 0.7],
  [2800, 300, 0.2],
];
const U: Vowel = [
  [380, 100, 1],
  [850, 140, 0.45],
  [2300, 300, 0.06],
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function mix(a: Vowel, b: Vowel, t: number): Vowel {
  const k = smooth(t);
  return a.map((f, i) => {
    const g = b[i] as Formant;
    return [lerp(f[0], g[0], k), lerp(f[1], g[1], k), lerp(f[2], g[2], k)] as Formant;
  }) as unknown as Vowel;
}

/** The vowel at `t` seconds of a meow that lasts `dur`: m (0–0.09) → i → a → hold → u. */
function vowelAt(t: number, dur: number): Vowel {
  const end = Math.max(0.3, dur);
  const tM = 0.09;
  const tI = 0.09 + 0.1;
  const tU = end - 0.22;
  if (t < tM) return M;
  if (t < tM + 0.07) return mix(M, I, (t - tM) / 0.07);
  if (t < tI) return I;
  if (t < tI + 0.12) return mix(I, A, (t - tI) / 0.12);
  if (t < tU) return A;
  return mix(A, U, (t - tU) / 0.18);
}

function envelope(t: number, dur: number): number {
  const attack = smooth(t / 0.03);
  const hum = t < 0.09 ? 0.55 : 1; // the "m" is quieter than the open vowel
  const release = smooth((dur - t) / 0.12);
  // Open vowel a little louder than the closed ones: "ow" swells.
  return attack * release * (t < 0.09 ? hum : lerp(0.8, 1, smooth((t - 0.09) / 0.2)));
}

/** Weight of a harmonic at `f` Hz: the sum of the formant bells, over a falling spectrum. */
function spectrum(f: number, v: Vowel): number {
  let s = 0;
  for (const [fc, bw, g] of v) {
    const x = (f - fc) / bw;
    s += g / (1 + x * x);
  }
  return s;
}

export interface CatVoiceOptions {
  /** Length of the note in seconds. Default 0.7. */
  dur?: number;
  /** Sample rate. Default 44100. */
  sampleRate?: number;
  /** Loudness as RMS (default 0.09, what the recorded takes measure), so every pitch is equally loud. */
  rms?: number;
}

/** Shortest and longest note: below it the vowel has no time to slide, above it it just holds. */
export const CAT_NOTE_MIN = 0.3;
export const CAT_NOTE_MAX = 1.6;

/** One cat note at `hz`, mono. Deterministic: the same call gives the same samples. */
export function renderCatNote(hz: number, opts: CatVoiceOptions = {}): Float32Array {
  const sr = opts.sampleRate ?? 44100;
  const dur = Math.min(CAT_NOTE_MAX, Math.max(CAT_NOTE_MIN, opts.dur ?? 0.7));
  const n = Math.round(dur * sr);
  const out = new Float32Array(n);
  if (!(hz > 0) || !Number.isFinite(hz)) return out;
  const harmonics = Math.max(1, Math.floor((Math.min(sr / 2 - 500, 7000)) / hz));
  let phase = 0;
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // A scoop of up to a semitone from below in the first 30 ms, then a 5.5 Hz vibrato of ±5 cents.
    const scoop = -1 * Math.exp(-t / 0.012) * (t < 0.06 ? 1 : 0);
    const vibrato = 0.05 * Math.sin(2 * Math.PI * 5.5 * t) * smooth((t - 0.12) / 0.2);
    const f = hz * Math.pow(2, (scoop + vibrato) / 12);
    phase += (2 * Math.PI * f) / sr;
    const v = vowelAt(t, dur);
    let s = 0;
    for (let k = 1; k <= harmonics; k++) {
      const hf = k * f;
      // 1/k rolloff = a sawtooth-like glottal source; the formants carve it.
      s += (Math.sin(k * phase) * spectrum(hf, v)) / k;
    }
    s *= envelope(t, dur);
    out[i] = s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  // The same loudness at every pitch (a high note has fewer, stronger harmonics, so peaks say little), peaks kept clear of clipping.
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (out[i] as number) ** 2;
  const scale = Math.min((opts.rms ?? 0.09) / Math.sqrt(sum / n || 1e-18), 0.9 / peak);
  for (let i = 0; i < n; i++) out[i] = (out[i] as number) * scale;
  return out;
}
