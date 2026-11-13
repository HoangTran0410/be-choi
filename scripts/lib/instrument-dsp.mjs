/**
 * The signal work behind scripts/instrument-samples.mjs, kept apart so it can be read (and tried)
 * without the downloading: decode with ffmpeg, find where a sound starts, which pitch it is, how
 * loud an ear hears it (the same A-weighting scripts/loudness.mjs uses), a seamless loop, a WAV.
 * Everything works on mono Float32Arrays at SR.
 */
import { execFileSync } from 'node:child_process';
import { A_GAIN, A_WEIGHT } from './loudness-common.mjs';

export const SR = 44100;

/** Any audio file -> mono Float32Array at SR. */
export function decode(path) {
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], {
    maxBuffer: 1 << 29,
  });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

export const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
export const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** First sample louder than `thresholdDb` under the file's own peak: where the sound really begins. */
export function onsetOf(x, thresholdDb = -42) {
  const lim = peakOf(x) * 10 ** (thresholdDb / 20);
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > lim) return i;
  return 0;
}

/** Last sample louder than `thresholdDb` under the peak, by 10 ms RMS blocks: where the tail has died. */
export function endOf(x, thresholdDb = -55) {
  const lim = peakOf(x) * 10 ** (thresholdDb / 20);
  const block = Math.round(SR * 0.01);
  for (let end = x.length - block; end > 0; end -= block) {
    let s = 0;
    for (let i = end; i < end + block; i++) s += x[i] * x[i];
    if (Math.sqrt(s / block) > lim) return Math.min(x.length, end + block);
  }
  return x.length;
}

/** Same RBJ biquads as the Web Audio ones, including its habit of reading Q as decibels for low/high-pass. */
function biquad(type, freq, qDb, x) {
  const w = (2 * Math.PI * freq) / SR;
  const alpha = Math.sin(w) / (2 * 10 ** (qDb / 20));
  const cos = Math.cos(w);
  let b0, b1, b2;
  if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    y[i] = v;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
  }
  return y;
}

/** Loudest 300 ms window of the A-weighted signal, in dB: the number scripts/loudness.mjs levels to. */
export function momentaryDb(x) {
  let w = x;
  for (const [type, f, q] of A_WEIGHT) w = biquad(type, f, q, w);
  const win = Math.round(SR * 0.3);
  const hop = Math.round(SR * 0.01);
  let sum = 0;
  for (let i = 0; i < Math.min(win, w.length); i++) sum += w[i] * w[i];
  let best = sum;
  for (let s = hop; s + win <= w.length; s += hop) {
    for (let i = s - hop; i < s; i++) sum -= w[i] * w[i];
    for (let i = s + win - hop; i < s + win; i++) sum += w[i] * w[i];
    if (sum > best) best = sum;
  }
  return db(A_GAIN * Math.sqrt(best / Math.min(win, w.length)));
}

/**
 * Fundamental of the loudest steady part, by YIN. Returns { hz, clarity } (clarity 1 = a clean
 * periodic tone, ~0 = noise); hz 0 when nothing periodic is there.
 */
export function pitchOf(x, fmin = 55, fmax = 2200) {
  const N = fmin < 55 ? 8192 : 4096;
  const tauMax = Math.floor(SR / fmin);
  const tauMin = Math.max(2, Math.floor(SR / fmax));
  if (x.length < N + tauMax) return { hz: 0, clarity: 0 };
  // Look at a few windows from the early sustain (after the strike, before the tail) and take the best.
  const start = onsetOf(x);
  let best = { hz: 0, clarity: 0 };
  for (const off of [0.06, 0.12, 0.2, 0.3, 0.45, 0.7]) {
    const at = start + Math.round(off * SR);
    if (at + N + tauMax > x.length) break;
    const d = new Float32Array(tauMax + 1);
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < N; i++) {
        const v = x[at + i] - x[at + i + tau];
        s += v * v;
      }
      d[tau] = s;
    }
    const cm = new Float32Array(tauMax + 1);
    let run = 0;
    cm[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) {
      run += d[tau];
      cm[tau] = run > 0 ? (d[tau] * tau) / run : 1;
    }
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cm[t] < 0.15) {
        while (t + 1 < tauMax && cm[t + 1] < cm[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) continue;
    // Parabolic refinement.
    const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1];
    const den = a - 2 * b + c;
    const t = den !== 0 ? tau + (a - c) / (2 * den) : tau;
    const clarity = 1 - cm[tau];
    if (clarity > best.clarity) best = { hz: SR / t, clarity };
  }
  return best;
}

export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

/**
 * Split a recording of several notes into its notes: a note starts where the 5 ms level jumps
 * well above what it was a moment ago. Returns [start, end) sample pairs.
 */
export function splitNotes(x, { minGap = 0.15, rise = 8, minLen = 0.2 } = {}) {
  // A recording that starts on its first note has no quiet before it to jump up from.
  const pad = Math.round(SR * 0.1);
  const padded = new Float32Array(x.length + pad);
  padded.set(x, pad);
  const cuts = splitPadded(padded, { minGap, rise, minLen });
  return cuts.map(([s, e]) => [Math.max(0, s - pad), Math.max(0, e - pad)]);
}

function splitPadded(x, { minGap, rise, minLen }) {
  const block = Math.round(SR * 0.005);
  const env = [];
  for (let i = 0; i + block <= x.length; i += block) {
    let s = 0;
    for (let j = i; j < i + block; j++) s += x[j] * x[j];
    env.push(Math.sqrt(s / block));
  }
  const peak = Math.max(...env);
  const starts = [];
  const gap = Math.round(minGap / 0.005);
  for (let k = 2; k < env.length; k++) {
    const before = Math.max(...env.slice(Math.max(0, k - gap), k - 1), peak * 0.003);
    if (env[k] > before * rise && env[k] > peak * 0.05 && (starts.length === 0 || k - starts[starts.length - 1] > gap)) starts.push(k);
  }
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const s = Math.max(0, starts[i] * block - block * 2);
    const e = i + 1 < starts.length ? starts[i + 1] * block - block * 2 : x.length;
    if ((e - s) / SR >= minLen) out.push([s, e]);
  }
  return out;
}

/**
 * Make `x[a..b)` loop with no seam: fade the end of the loop into the audio just before its start,
 * so the jump from b back to a lands on the sample that followed it. `x` is changed in place.
 */
export function crossfadeLoop(x, a, b, fadeS = 0.06) {
  const L = Math.min(Math.round(fadeS * SR), a, (b - a) >> 1);
  for (let k = 0; k < L; k++) {
    const w = (k + 0.5) / L;
    const gOut = Math.cos((w * Math.PI) / 2);
    const gIn = Math.sin((w * Math.PI) / 2);
    x[b - L + k] = x[b - L + k] * gOut + x[a - L + k] * gIn;
  }
}

/**
 * Pick loop points inside the steady part of a held note: after the attack, before the release,
 * an exact whole number of periods long when the pitch is known, starting on a rising zero crossing.
 */
export function findLoop(x, hz) {
  const len = x.length / SR;
  if (len < 1.2) return null;
  const startS = Math.min(0.55, len * 0.3);
  const endS = len - Math.min(0.3, len * 0.12);
  let a = Math.round(startS * SR);
  while (a < x.length - 1 && !(x[a] <= 0 && x[a + 1] > 0)) a++;
  let b = Math.round(endS * SR);
  if (hz > 0) {
    const period = SR / hz;
    b = a + Math.round((b - a) / period) * period;
    b = Math.round(b);
  }
  while (b > a && !(x[b - 1] <= 0 && x[b] > 0)) b--;
  if ((b - a) / SR < 0.5) return null;
  return [a, b];
}

/** 16-bit mono WAV bytes. */
export function wav(x) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + x.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return buf;
}
