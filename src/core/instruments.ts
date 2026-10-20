/**
 * The world-instrument synthesizer behind the museum game.
 *
 * Each instrument is rendered offline, in plain JavaScript, into a mono
 * `Float32Array` — no Web Audio nodes, no recordings. `audio.inst()` drops that
 * buffer into an `AudioBuffer` and plays it, so the maths here can be unit-tested
 * in Node (does it make sound? does it decay? do two instruments really differ?).
 *
 * HONEST NOTE: these are *physical-model-flavoured approximations*. A marimba bar
 * rings at 1 : 4 : 10 times its pitch, a kalimba tine at 1 : 6.3 : 17.5, a gong at
 * a crowd of inharmonic ratios, a string is a Karplus–Strong loop, a reed is a
 * pile of harmonics — and that is why they sound *different from each other*.
 * They do not sound like the real instruments, and nobody has listened to them
 * on a real phone speaker yet. Treat them as toy versions.
 */

export type InstrumentId =
  | 'marimba'
  | 'vibraphone'
  | 'steelpan'
  | 'handpan'
  | 'djembe'
  | 'gong'
  | 'harp'
  | 'ukulele'
  | 'banjo'
  | 'kalimba'
  | 'organ'
  | 'accordion'
  | 'harmonica'
  | 'panflute'
  | 'maracas'
  | 'tambourine'
  | 'chimes'
  | 'castanets';

export const INSTRUMENT_IDS: readonly InstrumentId[] = [
  'marimba',
  'vibraphone',
  'steelpan',
  'handpan',
  'djembe',
  'gong',
  'harp',
  'ukulele',
  'banjo',
  'kalimba',
  'organ',
  'accordion',
  'harmonica',
  'panflute',
  'maracas',
  'tambourine',
  'chimes',
  'castanets',
];

/** Pitch (Hz) used when none is given, and the one the loudness script measures at. */
export const INSTRUMENT_REF: Readonly<Record<InstrumentId, number>> = {
  marimba: 392,
  vibraphone: 523.25,
  steelpan: 523.25,
  handpan: 392,
  djembe: 300,
  gong: 147,
  harp: 392,
  ukulele: 392,
  banjo: 392,
  kalimba: 659.25,
  organ: 392,
  accordion: 392,
  harmonica: 523.25,
  panflute: 659.25,
  maracas: 440,
  tambourine: 440,
  chimes: 1318.5,
  castanets: 1900,
};

/** How long a note of this instrument is held when it has a "held" sound (seconds). */
const HELD_DEFAULT = 0.9;
export const HELD: ReadonlySet<InstrumentId> = new Set<InstrumentId>(['organ', 'accordion', 'harmonica', 'panflute']);
/** Longest tail rendered, so a cached gong stays small. */
const MAX_SECONDS = 4.2;

const TAU = Math.PI * 2;
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- DSP helpers

function makeRng(seed: number): () => number {
  let a = seed | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ctx {
  sr: number;
  rng: () => number;
  out: Float32Array;
  /** 0…1 — how hard the instrument is played. */
  v: number;
  /** Upper partials are scaled by this ^ index: a soft touch is a dark one. */
  bright: number;
}

/** Slower decay for lower notes, as on a real bar or string. */
const pitchDecay = (f: number, ref: number, k = 0.55): number => clamp(Math.pow(ref / f, k), 0.35, 2.2);

/**
 * A damped sine, added into `out`. Uses a rotating phasor so a 4-second gong with
 * ten modes costs a few hundred thousand multiplications, not a few million sines.
 */
function ring(c: Ctx, f: number, amp: number, t60: number, start = 0, attack = 0.0008, phase = 0): void {
  const { sr, out } = c;
  if (f <= 0 || f >= sr * 0.46 || amp <= 0 || t60 <= 0) return;
  const w = (TAU * f) / sr;
  const r = Math.pow(0.001, 1 / (t60 * sr));
  const mc = r * Math.cos(w);
  const ms = r * Math.sin(w);
  let re = Math.cos(phase);
  let im = Math.sin(phase);
  const s0 = Math.max(0, Math.floor(start * sr));
  const att = Math.max(1, Math.floor(attack * sr));
  const end = Math.min(out.length, s0 + Math.floor(t60 * sr * 1.05));
  for (let n = s0; n < end; n++) {
    const k = n - s0;
    out[n]! += amp * (k < att ? k / att : 1) * im;
    const nre = re * mc - im * ms;
    im = re * ms + im * mc;
    re = nre;
  }
}

/** A damped sine whose pitch glides from `f * from` down/up to `f` — a drum skin settling. */
function glide(c: Ctx, f: number, from: number, glideSec: number, amp: number, t60: number, start = 0): void {
  const { sr, out } = c;
  const s0 = Math.max(0, Math.floor(start * sr));
  const end = Math.min(out.length, s0 + Math.floor(t60 * sr * 1.05));
  let ph = 0;
  const decay = Math.pow(0.001, 1 / (t60 * sr));
  let env = 1;
  for (let n = s0; n < end; n++) {
    const t = (n - s0) / sr;
    const ff = f * (1 + (from - 1) * Math.exp(-t / glideSec));
    ph += (TAU * ff) / sr;
    const k = n - s0;
    out[n]! += amp * env * Math.sin(ph) * (k < 24 ? k / 24 : 1);
    env *= decay;
  }
}

interface Filt {
  type: 'lp' | 'hp' | 'bp' | 'peak';
  f: number;
  q?: number;
  gainDb?: number;
}

function biquad(sr: number, { type, f, q = 0.707, gainDb = 0 }: Filt): [number, number, number, number, number] {
  const fc = clamp(f, 20, sr * 0.45);
  const w0 = (TAU * fc) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === 'lp') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else if (type === 'hp') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else if (type === 'bp') {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else {
    const A = Math.pow(10, gainDb / 40);
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function filter(buf: Float32Array, sr: number, f: Filt, from = 0, to = buf.length): void {
  const [b0, b1, b2, a1, a2] = biquad(sr, f);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let n = from; n < to; n++) {
    const x = buf[n]!;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    buf[n] = y;
  }
}

/** Run `f` over a scratch copy of the whole signal and mix `wet` of the result back in (a resonance). */
function resonate(c: Ctx, f: Filt, wet: number): void {
  const tmp = Float32Array.from(c.out);
  filter(tmp, c.sr, f);
  for (let n = 0; n < tmp.length; n++) c.out[n]! += tmp[n]! * wet;
}

/** A burst of (filtered) noise with an exponential decay. */
function burst(c: Ctx, start: number, dur: number, amp: number, t60: number, f?: Filt): void {
  const { sr, out, rng } = c;
  const s0 = Math.max(0, Math.floor(start * sr));
  const len = Math.min(out.length - s0, Math.max(2, Math.floor(dur * sr)));
  if (len <= 0 || amp <= 0) return;
  const tmp = new Float32Array(len);
  const r = Math.pow(0.001, 1 / (t60 * sr));
  let env = 1;
  for (let i = 0; i < len; i++) {
    tmp[i] = (rng() * 2 - 1) * env * (i < 8 ? i / 8 : 1);
    env *= r;
  }
  if (f) filter(tmp, sr, f);
  for (let i = 0; i < len; i++) out[s0 + i]! += tmp[i]! * amp;
}

/** The sound of a bar or skin being hit: lets the first few milliseconds have a body. */
const thump = (c: Ctx, f: number, amp: number, t60 = 0.05, start = 0): void => ring(c, f, amp, t60, start, 0.0005);

/** Karplus–Strong string with a fractionally-tuned loop, `t60` seconds to fall 60 dB. */
function string(c: Ctx, f: number, amp: number, t60: number, opts: { tone: number; pick: number; soft: number; start?: number }): void {
  const { sr, out, rng } = c;
  if (f <= 20 || f > sr * 0.2) return;
  const L = sr / f;
  const w = clamp(opts.tone, 0.5, 0.98); // 0.5 = darkest (plain average), → 1 = brightest
  const delayOfFilter = 1 - w;
  const N = Math.max(2, Math.floor(L - delayOfFilter - 0.1));
  const D = L - delayOfFilter - N;
  const ap = (1 - D) / (1 + D);
  const buf = new Float32Array(N);
  // Excitation: noise, smoothed (a soft touch) and combed at the pick position.
  let prev = 0;
  const sm = clamp(opts.soft, 0, 0.95);
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const nz = rng() * 2 - 1;
    prev = sm * prev + (1 - sm) * nz;
    raw[i] = prev;
  }
  const pk = Math.max(1, Math.floor(N * opts.pick));
  for (let i = 0; i < N; i++) buf[i] = raw[i]! - (raw[(i + N - pk) % N] ?? 0);
  const rho = Math.pow(0.001, 1 / (t60 * f));
  const s0 = Math.floor((opts.start ?? 0) * sr);
  const end = Math.min(out.length, s0 + Math.floor(t60 * sr * 1.1));
  let idx = 0;
  let lastS = 0;
  let lastA = 0;
  let lastY = 0;
  for (let n = s0; n < end; n++) {
    const s = buf[idx]!;
    out[n]! += s * amp;
    const a = rho * (w * s + (1 - w) * lastS);
    lastS = s;
    const y = ap * a + lastA - ap * lastY;
    lastA = a;
    lastY = y;
    buf[idx] = y;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
}

/** A held tone made of harmonics `amps[0]` (×1), `amps[1]` (×2)… with an attack/release envelope and optional vibrato. */
function held(
  c: Ctx,
  f: number,
  amps: readonly number[],
  dur: number,
  o: {
    attack: number;
    release: number;
    vibHz?: number;
    vibDepth?: number;
    vibDelay?: number;
    tremHz?: number;
    tremDepth?: number;
    gain?: number;
  },
): void {
  const { sr, out } = c;
  const n0 = Math.min(out.length, Math.floor((dur + o.release) * sr));
  let ph = 0;
  const att = Math.max(1, o.attack * sr);
  const relStart = dur * sr;
  const rel = Math.max(1, o.release * sr);
  const nMax = Math.min(amps.length, Math.max(1, Math.floor((sr * 0.45) / f)));
  for (let n = 0; n < n0; n++) {
    const t = n / sr;
    const vib = o.vibHz ? 1 + (o.vibDepth ?? 0) * Math.sin(TAU * o.vibHz * t) * clamp((t - (o.vibDelay ?? 0)) / 0.25, 0, 1) : 1;
    ph += (TAU * f * vib) / sr;
    let env = n < att ? n / att : 1;
    if (n > relStart) env *= Math.max(0, 1 - (n - relStart) / rel);
    if (o.tremHz) env *= 1 - (o.tremDepth ?? 0) * (0.5 + 0.5 * Math.sin(TAU * o.tremHz * t));
    let s = 0;
    for (let k = 0; k < nMax; k++) s += amps[k]! * Math.sin(ph * (k + 1));
    out[n]! += s * env * (o.gain ?? 1);
  }
}

function finish(c: Ctx, peak = 0.62): Float32Array {
  const { out, sr } = c;
  let mx = 0;
  for (let n = 0; n < out.length; n++) {
    const x = out[n]!;
    if (!Number.isFinite(x)) out[n] = 0;
    else if (Math.abs(x) > mx) mx = Math.abs(x);
  }
  if (mx < 1e-9) return out;
  const level = 0.22 + 0.78 * Math.pow(c.v, 1.3);
  const g = (peak / mx) * level;
  const fade = Math.min(out.length, Math.floor(sr * 0.012));
  for (let n = 0; n < out.length; n++) out[n]! *= g;
  for (let i = 0; i < fade; i++) out[out.length - 1 - i]! *= i / fade;
  return out;
}

// ---------------------------------------------------------------- instruments

type Maker = (c: Ctx, f: number, dur: number) => void;

/** Modes of a bar: `ratios` × pitch, each with its own loudness and ring time. */
function bar(c: Ctx, f: number, ratios: readonly number[], amps: readonly number[], t60s: readonly number[], decayScale: number): void {
  ratios.forEach((r, i) => ring(c, f * r, (amps[i] ?? 0) * Math.pow(c.bright, i), (t60s[i] ?? 0.1) * decayScale));
}

const MAKERS: Readonly<Record<InstrumentId, Maker>> = {
  // Wooden bars tuned 1 : 4 : 10 — a warm, round "doong" with a woody knock, gone in a second.
  marimba(c, f) {
    bar(c, f, [1, 3.99, 9.9], [1, 0.38, 0.14], [1.4, 0.45, 0.16], pitchDecay(f, 330));
    thump(c, f * 0.5, 0.22, 0.09); // the resonator tube under the bar
    burst(c, 0, 0.012, 0.18, 0.01, { type: 'lp', f: 1100 });
  },

  // Metal bars with a motor fan: a long glassy ring that shimmers 5.5 times a second.
  vibraphone(c, f) {
    bar(c, f, [1, 4.0, 10.1], [1, 0.34, 0.1], [3.4, 1.2, 0.4], pitchDecay(f, 440, 0.4));
    burst(c, 0, 0.008, 0.07, 0.006, { type: 'bp', f: 3000, q: 1 });
    const { out, sr } = c;
    for (let n = 0; n < out.length; n++) out[n]! *= 0.62 + 0.38 * Math.sin(TAU * 5.4 * (n / sr) + 1.2);
  },

  // A tuned dome of steel: fundamental, octave and twelfth, bright "tink", two slightly
  // different copies of the fundamental beating against each other.
  steelpan(c, f) {
    const ds = pitchDecay(f, 523, 0.45);
    bar(c, f, [1, 2.0, 3.01, 4.04, 5.9], [1, 0.7, 0.42, 0.24, 0.12], [1.5, 0.95, 0.55, 0.3, 0.16], ds);
    ring(c, f * 1.0042, 0.55, 1.3 * ds);
    burst(c, 0, 0.014, 0.28, 0.012, { type: 'bp', f: 2800, q: 2.5 });
    thump(c, f * 0.5, 0.12, 0.08);
  },

  // The same idea played with the soft of the hand: darker, hushed attack, a long airy bloom.
  handpan(c, f) {
    const ds = pitchDecay(f, 392, 0.4);
    bar(c, f, [1, 2.0, 2.98], [1, 0.46, 0.2], [3.2, 1.7, 0.7], ds);
    ring(c, f * 1.0025, 0.5, 2.8 * ds);
    ring(c, f * 2.0045, 0.2, 1.4 * ds);
    burst(c, 0, 0.03, 0.2, 0.02, { type: 'lp', f: 520 });
    filter(c.out, c.sr, { type: 'lp', f: 2200, q: 0.6 });
    // the hand lands softly: a 25 ms swell instead of a strike
    const swell = Math.floor(c.sr * 0.025);
    for (let n = 0; n < swell; n++) c.out[n]! *= n / swell;
  },

  // A goblet drum: one skin, three voices. Low = bass (deep, long), middle = tone,
  // high = slap (a crack of noise and a short ring). The morph is continuous.
  djembe(c, f) {
    const slap = clamp((f - 230) / 520, 0, 1);
    const bass = clamp((200 - f) / 110, 0, 1);
    const body = 1 - 0.75 * slap;
    glide(c, f, 1.5 - 0.2 * slap, 0.03 + 0.03 * bass, 0.9 * body, 0.55 * (1 - 0.65 * slap) + 0.25 * bass);
    ring(c, f * 1.62, 0.22 * body, 0.16 * (1 - 0.6 * slap) + 0.05);
    ring(c, f * 2.3, 0.1 * body, 0.09);
    burst(c, 0, 0.1, 0.18 + 1.0 * slap, 0.02 + 0.05 * slap, { type: 'bp', f: 700 + 2400 * slap, q: 0.9 });
    if (slap > 0.2) ring(c, 3100, 0.2 * slap, 0.05);
  },

  // A big bronze disc: a crowd of inharmonic partials that bloom, then fade for seconds.
  gong(c, f) {
    const ratios = [1, 1.51, 1.86, 2.48, 2.95, 3.78, 4.42, 5.31, 6.7, 8.3];
    const amps = [1, 0.72, 0.58, 0.5, 0.4, 0.3, 0.25, 0.2, 0.12, 0.08];
    const t60 = [4.0, 3.5, 3.1, 2.7, 2.3, 1.9, 1.5, 1.2, 0.9, 0.6];
    ratios.forEach((r, i) => {
      const jit = 1 + (c.rng() - 0.5) * 0.012;
      const a = amps[i]! * Math.pow(c.bright, i * 0.6);
      // Higher partials swell later: the gong "opens".
      ring(c, f * r * jit, a, t60[i]!, 0, 0.012 + i * 0.018);
      if (i < 4) ring(c, f * r * jit * 1.0045, a * 0.6, t60[i]! * 0.9, 0, 0.02 + i * 0.02);
    });
    burst(c, 0, 1.6, 0.1 * c.bright, 0.9, { type: 'bp', f: 1500, q: 0.4 });
  },

  // A plucked string with the pick at 30%, so the even harmonics are thin; a clean, long bloom.
  harp(c, f) {
    const ds = pitchDecay(f, 330, 0.5);
    for (let k = 1; k <= 10; k++) {
      const kf = f * k * Math.sqrt(1 + 0.00008 * k * k);
      const a = (1 / Math.pow(k, 0.85)) * Math.abs(Math.sin(k * Math.PI * 0.3)) * Math.pow(c.bright, (k - 1) * 0.7);
      ring(c, kf, a * 1.4, (3.2 * ds) / Math.pow(k, 0.8), 0, 0.0015);
    }
    burst(c, 0, 0.01, 0.04, 0.008, { type: 'bp', f: 2500, q: 1 });
    filter(c.out, c.sr, { type: 'lp', f: 7500, q: 0.5 });
  },

  // Nylon strings on a small wooden box: round and soft, with a "boxy" body resonance.
  ukulele(c, f) {
    string(c, f, 1, 1.2 * pitchDecay(f, 330, 0.4), { tone: 0.6, pick: 0.17, soft: 0.45 - 0.2 * c.v });
    resonate(c, { type: 'bp', f: 330, q: 3.5 }, 0.35);
    resonate(c, { type: 'bp', f: 640, q: 4 }, 0.18);
    burst(c, 0, 0.012, 0.07, 0.01, { type: 'bp', f: 1400, q: 1 });
  },

  // Steel strings over a drum-head: bright, twangy, nasal and quick to die.
  banjo(c, f) {
    string(c, f, 1, 0.62 * pitchDecay(f, 330, 0.3), { tone: 0.93, pick: 0.09, soft: 0.05 });
    resonate(c, { type: 'bp', f: 1250, q: 4 }, 0.6);
    resonate(c, { type: 'bp', f: 2400, q: 5 }, 0.4);
    burst(c, 0, 0.01, 0.2, 0.008, { type: 'bp', f: 3400, q: 1.5 });
    filter(c.out, c.sr, { type: 'hp', f: 140 });
  },

  // A tine on a wooden box (thumb piano): 1 : 6.3 : 17.5 — a "plink" that is mostly the first partial.
  kalimba(c, f) {
    bar(c, f, [1, 6.27, 17.55], [1, 0.3, 0.05], [1.0, 0.2, 0.07], pitchDecay(f, 659, 0.35));
    ring(c, 190, 0.28, 0.1); // the wooden box answering
    burst(c, 0, 0.01, 0.12, 0.008, { type: 'bp', f: 3200, q: 1.2 });
  },

  // Drawbars: sixteen-foot to fourth-foot pipes, steady as a wall, a little leslie wobble and a key click.
  organ(c, f, dur) {
    held(c, f, [0.9, 0.75, 0.38, 0.5, 0.0, 0.2, 0.0, 0.12], dur, {
      attack: 0.014,
      release: 0.09,
      vibHz: 6.3,
      vibDepth: 0.0035,
      vibDelay: 0.05,
    });
    held(c, f * 0.5, [0.55], dur, { attack: 0.014, release: 0.09 });
    burst(c, 0, 0.012, 0.1, 0.01, { type: 'bp', f: f * 4, q: 2 });
  },

  // Two reeds a hair apart (the musette beat), an octave coupler, bellows breath and a shaken swell.
  accordion(c, f, dur) {
    const saw = Array.from({ length: 14 }, (_, k) => 1 / Math.pow(k + 1, 0.8));
    held(c, f * 0.9972, saw, dur, { attack: 0.05, release: 0.12, tremHz: 5.6, tremDepth: 0.16, gain: 0.55 });
    held(c, f * 1.0033, saw, dur, { attack: 0.05, release: 0.12, tremHz: 5.6, tremDepth: 0.16, gain: 0.55 });
    held(c, f * 2, saw.slice(0, 6), dur, { attack: 0.06, release: 0.12, gain: 0.25 });
    burst(c, 0, Math.min(dur, 0.25), 0.05, 0.25, { type: 'bp', f: 1800, q: 0.7 });
    filter(c.out, c.sr, { type: 'lp', f: 3300, q: 0.8 });
  },

  // One reed, cupped by a hand: nasal (a hump around 2 kHz) and "wah" with slower hand motion.
  harmonica(c, f, dur) {
    const saw = Array.from({ length: 16 }, (_, k) => 1 / (k + 1));
    held(c, f, saw, dur, { attack: 0.03, release: 0.1, vibHz: 5.2, vibDepth: 0.004, vibDelay: 0.15, tremHz: 4.6, tremDepth: 0.22 });
    resonate(c, { type: 'bp', f: 2100, q: 1.4 }, 0.9);
    burst(c, 0, 0.07, 0.12, 0.05, { type: 'bp', f: 3000, q: 1 });
  },

  // Bamboo pipes: nearly a pure whistle tone riding on a lot of breath, a "chiff" at the start.
  panflute(c, f, dur) {
    held(c, f, [1, 0.05, 0.1], dur, { attack: 0.07, release: 0.15, vibHz: 5, vibDepth: 0.004, vibDelay: 0.3, gain: 0.8 });
    const breath = new Float32Array(c.out.length);
    const lenN = Math.min(breath.length, Math.floor((dur + 0.15) * c.sr));
    for (let n = 0; n < lenN; n++) {
      const t = n / c.sr;
      const env = Math.min(1, t / 0.05) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.15) : 1);
      breath[n] = (c.rng() * 2 - 1) * env;
    }
    filter(breath, c.sr, { type: 'bp', f, q: 7 });
    for (let n = 0; n < lenN; n++) c.out[n]! += breath[n]! * 1.6;
    burst(c, 0, 0.05, 0.14, 0.04, { type: 'bp', f: f * 2, q: 3 });
  },

  // Seeds in a gourd: two quick grainy "ch-ka"s. `f` slides the size of the maraca.
  maracas(c, f) {
    const hp = 3600 * Math.pow(f / 440, 0.35);
    for (const [t, a] of [
      [0, 1],
      [0.075, 0.6],
    ] as const) {
      const { sr, out, rng } = c;
      const s0 = Math.floor(t * sr);
      const len = Math.floor(0.09 * sr);
      const tmp = new Float32Array(len);
      let grain = 1;
      for (let i = 0; i < len; i++) {
        if (i % Math.floor(sr * 0.003) === 0) grain = 0.25 + rng() * 0.75;
        const env = Math.pow(1 - i / len, 2) * Math.min(1, i / 40);
        tmp[i] = (rng() * 2 - 1) * grain * env;
      }
      filter(tmp, sr, { type: 'hp', f: hp, q: 0.8 });
      filter(tmp, sr, { type: 'bp', f: 6200, q: 0.5 });
      for (let i = 0; i < len && s0 + i < out.length; i++) out[s0 + i]! += tmp[i]! * a;
    }
  },

  // A skin ring with a handful of tiny cymbals: a dull thump, then a fast shiver of high metal.
  tambourine(c, f) {
    const s = Math.pow(f / 440, 0.25);
    const jingles = [3100, 3900, 4700, 5600, 6500, 7400];
    [0, 0.017, 0.034].forEach((t, hit) => {
      jingles.forEach((jf, i) =>
        ring(c, jf * s * (1 + 0.012 * ((i * 7 + hit) % 5)), (0.4 - hit * 0.1) * (1 - i * 0.08), 0.16 + 0.05 * ((i * 3) % 4), t, 0.0004),
      );
    });
    const thumpAmt = clamp((560 - f) / 300, 0.15, 1);
    ring(c, 220 * s, 0.6 * thumpAmt, 0.09);
    burst(c, 0, 0.015, 0.12 + 0.2 * thumpAmt, 0.012, { type: 'bp', f: 1100, q: 1 });
    filter(c.out, c.sr, { type: 'hp', f: 180 });
  },

  // Metal tubes in a breeze: a high shimmer of 1 : 2.76 : 5.4 : 8.9 that rings and rings.
  chimes(c, f) {
    const ds = pitchDecay(f, 1200, 0.35);
    bar(c, f, [1, 2.76, 5.4, 8.93], [1, 0.5, 0.24, 0.1], [3.6, 2.3, 1.4, 0.8], ds);
    ring(c, f * 1.0032, 0.45, 3.0 * ds);
    burst(c, 0, 0.006, 0.1, 0.005, { type: 'bp', f: 6200, q: 1 });
  },

  // Two hollow shells clacking twice. `f` is the pitch of the clack.
  castanets(c, f) {
    [
      [0, 1],
      [0.03, 0.65],
    ].forEach(([t, a]) => {
      burst(c, t!, 0.03, 0.9 * a!, 0.016, { type: 'bp', f: f * 1.3, q: 2 });
      ring(c, f, 0.55 * a!, 0.035, t!, 0.0004);
      ring(c, f * 0.45, 0.4 * a!, 0.05, t!, 0.0004);
    });
  },
};

/** Seconds of sound `renderInstrument` makes for this instrument (before any `dur`). */
function tailOf(id: InstrumentId, dur: number): number {
  switch (id) {
    case 'gong':
      return 4;
    case 'handpan':
      return 3.2;
    case 'vibraphone':
    case 'chimes':
      return 3.4;
    case 'harp':
      return 3.2;
    case 'steelpan':
      return 1.8;
    case 'marimba':
      return 1.5;
    case 'ukulele':
    case 'kalimba':
    case 'djembe':
      return 1.2;
    case 'banjo':
      return 0.9;
    case 'tambourine':
      return 0.8;
    case 'maracas':
    case 'castanets':
      return 0.3;
    default:
      return dur + 0.4; // the held ones
  }
}

export interface RenderOptions {
  /** How long a held note (organ, accordion, harmonica, pan flute) is held. */
  dur?: number;
  /** Seed for the noise. Same seed, same sound. */
  seed?: number;
}

/**
 * One note of `id` at `freq` Hz, `vel` 0…1 (how hard it is played), as mono samples.
 * Peak-normalised, so loudness between instruments is `audio.ts`'s job (LOUDNESS).
 */
export function renderInstrument(id: InstrumentId, freq: number, vel: number, sr: number, opts: RenderOptions = {}): Float32Array {
  const v = clamp(Number.isFinite(vel) ? vel : 1, 0, 1);
  const f = clamp(Number.isFinite(freq) && freq > 0 ? freq : INSTRUMENT_REF[id], 30, 6000);
  const dur = clamp(opts.dur ?? HELD_DEFAULT, 0.15, 3);
  const seconds = Math.min(MAX_SECONDS, tailOf(id, HELD.has(id) ? dur : 0));
  const out = new Float32Array(Math.max(8, Math.floor(seconds * sr)));
  const c: Ctx = { sr, rng: makeRng(opts.seed ?? 1 + Math.floor(f * 7)), out, v, bright: 0.45 + 0.55 * v };
  MAKERS[id](c, f, dur);
  return finish(c, HELD.has(id) ? 0.3 : 0.62);
}

/** Human-checkable fingerprints, used by the tests (and handy in a REPL). */
export function describe(data: Float32Array, sr: number): { peak: number; rms: number; centroid: number; t60: number; seconds: number } {
  let peak = 0;
  let sum = 0;
  let cross = 0;
  for (let n = 0; n < data.length; n++) {
    const x = data[n]!;
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
    if (n > 0 && data[n - 1]! < 0 !== x < 0) cross++;
  }
  // Time until the short-time energy has dropped 40 dB below its loudest 20 ms.
  const win = Math.floor(sr * 0.02);
  const energies: number[] = [];
  for (let s = 0; s + win <= data.length; s += win) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += data[i]! * data[i]!;
    energies.push(e / win);
  }
  const top = Math.max(...energies, 1e-12);
  let last = 0;
  energies.forEach((e, i) => {
    if (e > top * 1e-4) last = i + 1;
  });
  return {
    peak,
    rms: Math.sqrt(sum / data.length),
    centroid: (cross / 2 / (data.length / sr)) | 0,
    t60: (last * win) / sr,
    seconds: data.length / sr,
  };
}
