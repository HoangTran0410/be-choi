/**
 * Mix the robot band.
 *
 * Renders the robots of "Ban nhạc robot" offline through the real audio engine (the same synth,
 * instrument buffers, bass exciter and master compressor a phone uses), in headless Chromium, and
 * measures them. Nobody listens here: it is arithmetic, and it does not replace a parent's ears.
 *
 *   node scripts/robots-mix.mjs            level every robot in every song (writes src/games/robots/mix.ts)
 *   node scripts/robots-mix.mjs --solo-only  level the robots alone, without the full-stage renders (quicker)
 *   node scripts/robots-mix.mjs --check    measure only; fail on a full stage that clips or a robot that is off level
 *   node scripts/robots-mix.mjs --wav DIR  also write each full-stage render to DIR as a WAV to listen to
 *
 * What is measured:
 *  - per robot, alone: A-weighted momentary loudness (loudest 300 ms) of its medium part, brought to
 *    the target of its role (melody leads, chords sit back, sparkle and shakers whisper);
 *  - per song, with eight busy robots at once: the raw peak (must stay under 1.0 — no clipping),
 *    the loudness, the share of energy per band (a mud check) and the number of notes sounded.
 *
 * Needs playwright's Chromium (CHROMIUM=/path/to/headless_shell when it lives somewhere else).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5188;
const OUT = 'src/games/robots/mix.ts';
const check = process.argv.includes('--check');
/** Level the robots only, without rendering the full stages (a quicker run for tuning). */
const soloOnly = process.argv.includes('--solo-only');
const wavDir = process.argv.includes('--wav') ? process.argv[process.argv.indexOf('--wav') + 1] : null;

/** The whole band moves with the house level (scripts/lib/loudness-common.mjs: -22 → -19). */
const HOUSE_SHIFT_DB = 3;
/** Where each robot should sit when it plays alone, in A-weighted dBFS (momentary), before HOUSE_SHIFT_DB. */
const BASE_DB = {
  kick: -22.5,
  bass: -25,
  piano: -29,
  guitar: -29,
  xylo: -24,
  snare: -27,
  bell: -31,
  shaker: -31,
  flute: -26,
  cowbell: -29,
  tom: -28,
  trumpet: -26,
  sax: -26,
  violin: -28,
  triangle: -32,
  // the newer robots: leads sit with the flute, chords with the guitar, sparkle and shakes in the back
  marimba: -26,
  kalimba: -30,
  vibraphone: -30,
  steelpan: -26,
  handpan: -29,
  chime: -32,
  trung: -26,
  harp: -29,
  tranh: -28,
  ukulele: -29,
  banjo: -29,
  cello: -27,
  harmonica: -26,
  accordion: -29,
  organ: -30,
  panpipe: -27,
  tuba: -26,
  conga: -28,
  bongo: -29,
  tambourine: -31,
  maracas: -31,
  castanets: -30,
  mo: -30,
  beatbox: -24.5,
  timpani: -26,
  gong: -28,
  hihat: -32,
  clap: -31,
  cymbal: -33,
  djembe: -28,
  taiko: -26,
  cajon: -27,
};
const TARGET_DB = Object.fromEntries(Object.entries(BASE_DB).map(([id, db]) => [id, db + HOUSE_SHIFT_DB]));
const TOLERANCE = 2;
const PEAK_CEILING = 0.95;
const SONGS = ['fun', 'disco', 'calm', 'latin', 'east'];

/** Eight-robot stages: a rhythm section with chords, a brass section, and a sparkly one. */
const STAGES = {
  rhythm: ['kick', 'bass', 'piano', 'guitar', 'xylo', 'snare', 'flute', 'shaker'],
  brass: ['kick', 'bass', 'guitar', 'trumpet', 'sax', 'violin', 'tom', 'cowbell'],
  sparkle: ['kick', 'bass', 'piano', 'xylo', 'bell', 'snare', 'triangle', 'violin'],
  // the newer robots, in three bands that can happen: a village band, a world orchestra, a sparkly one
  village: ['kick', 'bass', 'ukulele', 'marimba', 'kalimba', 'conga', 'tambourine', 'harmonica'],
  world: ['timpani', 'tuba', 'accordion', 'harp', 'steelpan', 'castanets', 'cello', 'chime'],
  dream: ['beatbox', 'bass', 'organ', 'trung', 'vibraphone', 'maracas', 'panpipe', 'gong'],
};

/** Runs in the page. */
async function inPage(cfg) {
  const { createAudio } = await import('/src/core/audio.ts');
  const G = await import('/src/games/robots/groove.ts');
  const R = await import('/src/games/robots/robots.ts');
  const SR = 44100;

  async function weighted(data) {
    const off = new OfflineAudioContext(1, data.length, SR);
    const buf = off.createBuffer(1, data.length, SR);
    buf.copyToChannel(data, 0);
    const src = off.createBufferSource();
    src.buffer = buf;
    let head = src;
    for (const [type, freq, q] of [
      ['highpass', 20.6, 0.5],
      ['highpass', 281.9, 0.3334],
      ['lowpass', 12194, 0.5],
    ]) {
      const f = off.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      head = head.connect(f);
    }
    const g = off.createGain();
    g.gain.value = 1.2589;
    head.connect(g).connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  }

  async function play({ song, ids, level, bars, vols, keep }) {
    const s = G.findSong(song);
    const stepS = G.stepMs(s) / 1000;
    const off = new OfflineAudioContext(1, Math.ceil(SR * (bars * 16 * stepS + 3.5)), SR);
    const real = globalThis.AudioContext;
    globalThis.AudioContext = function () {
      return off;
    };
    const audio = createAudio();
    audio.unlock();
    globalThis.AudioContext = real;
    let vt = 0;
    let notes = 0;
    const a = {
      note: (f, d, t, delay = 0, v = 1) => (notes++, audio.note(f, d, t, delay + vt / 1000, v)),
      drum: (k, delay = 0, v = 1) => (notes++, audio.drum(k, delay + vt / 1000, v)),
      inst: (id, f, v, d, delay = 0, damp, gain) => (notes++, audio.inst(id, f, v, d, delay + vt / 1000, damp, gain)),
    };
    let timer = null;
    const g = G.createGroove({ audio: a, now: () => vt, setTimer: (fn) => ((timer = fn), 1), clearTimer: () => {} });
    g.setSong(song);
    ids.forEach((id, i) => {
      const p = R.playerFor(R.findRobot(id));
      if (vols) p.vol = vols[id] ?? 1;
      g.setPlayer(i, p, level);
    });
    g.start();
    while (vt < bars * 16 * stepS * 1000) {
      vt += 25;
      const f = timer;
      timer = null;
      if (f) f();
    }
    const data = (await off.startRendering()).getChannelData(0);
    const w = await weighted(data);
    const WIN = Math.round(SR * 0.3);
    const HOP = Math.round(SR * 0.05);
    let best = 0;
    let sum = 0;
    let n = 0;
    for (let st = 0; st + WIN <= w.length; st += HOP) {
      let e = 0;
      for (let i = st; i < st + WIN; i++) e += w[i] * w[i];
      e = Math.sqrt(e / WIN);
      best = Math.max(best, e);
      sum += e;
      n++;
    }
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const out = { peak, loudDb: 20 * Math.log10(best), meanDb: 20 * Math.log10(sum / n), notes, SR };
    if (keep) {
      const pcm = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) pcm[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
      let bin = '';
      const bytes = new Uint8Array(pcm.buffer);
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      out.b64 = btoa(bin);
    }
    return out;
  }

  const result = { solo: [], stages: [] };
  for (const song of cfg.songs) {
    for (const id of cfg.robots) {
      // The engine adds a hair of random level to every hit, so one render is a little noisy: average three.
      const runs = [];
      for (let k = 0; k < 3; k++) runs.push(await play({ song, ids: [id], level: 2, bars: 4, vols: { [id]: cfg.vols[id]?.[song] ?? 1 } }));
      const mean = (key) => runs.reduce((t, x) => t + x[key], 0) / runs.length;
      result.solo.push({ song, id, ...runs[0], loudDb: mean('loudDb'), meanDb: mean('meanDb') });
    }
    for (const [name, ids] of Object.entries(cfg.stages)) {
      for (const level of [2, 3]) {
        const vols = Object.fromEntries(ids.map((id) => [id, cfg.vols[id]?.[song] ?? 1]));
        const r = await play({ song, ids, level, bars: 8, vols, keep: cfg.wav });
        result.stages.push({ song, name, level, ...r });
      }
    }
  }
  return result;
}

/** Share of energy per band, by a plain DFT on windows spread over the render. */
function bands(b64, sr) {
  const bytes = Buffer.from(b64, 'base64');
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
  const N = 4096;
  const edges = [0, 100, 250, 500, 1000, 2000, 4000, 8000, 24000];
  const acc = new Array(edges.length - 1).fill(0);
  const hops = 24;
  for (let k = 0; k < hops; k++) {
    const start = Math.floor(((pcm.length - N) * (k + 0.5)) / hops);
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (pcm[start + i] / 32768) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let b = 1; b < N / 2; b++) {
      const f = (b * sr) / N;
      const e = re[b] * re[b] + im[b] * im[b];
      for (let j = 0; j < edges.length - 1; j++) if (f >= edges[j] && f < edges[j + 1]) acc[j] += e;
    }
  }
  const tot = acc.reduce((a, b) => a + b, 0) || 1;
  return acc.map((x) => Math.round((100 * x) / tot));
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

function wav(b64, sr) {
  const pcm = Buffer.from(b64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function currentMix() {
  try {
    const text = (await import('node:fs')).readFileSync(OUT, 'utf8');
    const body = text.slice(text.indexOf('= {') + 2);
    const json = body
      .replace(/\/\/.*$/gm, '')
      .replace(/(\w+):/g, '"$1":')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/;\s*$/, '');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  for (let tries = 0; ; tries++) {
    try {
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 4000 });
      break;
    } catch (err) {
      if (tries >= 25) throw err;
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  const robots = Object.keys(TARGET_DB);
  let vols = await currentMix();
  const passes = check ? 1 : 3;
  let last;
  for (let pass = 0; pass < passes; pass++) {
    // The full stages are only measured on the last pass; the passes before only level the robots.
    last = await page.evaluate(inPage, { songs: SONGS, robots, stages: pass === passes - 1 && !soloOnly ? STAGES : {}, vols, wav: pass === passes - 1 && Boolean(wavDir) });
    if (check) break;
    if (pass === passes - 1) break;
    const next = {};
    for (const r of last.solo) {
      const cur = vols[r.id]?.[r.song] ?? 1;
      const want = TARGET_DB[r.id];
      const damp = 0.8;
      const v = cur * 10 ** ((damp * (want - r.loudDb)) / 20);
      (next[r.id] ??= {})[r.song] = Math.min(4, Math.max(0.05, v));
    }
    vols = next;
  }

  console.log('\nrobot alone (medium part): level dB (A, loudest 300 ms) vs target');
  let worst = 0;
  for (const id of robots) {
    const row = last.solo.filter((r) => r.id === id);
    const cells = row.map((r) => {
      const off = r.loudDb - TARGET_DB[id];
      worst = Math.max(worst, Math.abs(off));
      return `${r.song} ${r.loudDb.toFixed(1)}${Math.abs(off) > TOLERANCE ? '!' : ' '}`;
    });
    console.log(`${id.padEnd(10)} want ${String(TARGET_DB[id]).padStart(4)}   ${cells.join('   ')}`);
  }
  console.log(`worst robot ${worst.toFixed(1)} dB off its target`);

  console.log('\neight robots at once: peak, loudness (A), notes, energy % by band <100/250/500/1k/2k/4k/8k/+');
  let clipped = false;
  if (wavDir) mkdirSync(wavDir, { recursive: true });
  for (const r of last.stages) {
    const hot = r.peak >= PEAK_CEILING;
    clipped ||= hot;
    const share = r.b64 ? bands(r.b64, r.SR).join('/') : '';
    console.log(
      `${r.song.padEnd(6)} ${r.name.padEnd(8)} L${r.level}  peak ${r.peak.toFixed(2)}${hot ? ' CLIP' : '     '}  loud ${r.loudDb.toFixed(1)}  mean ${r.meanDb.toFixed(1)}  notes ${String(r.notes).padStart(4)}  ${share}`,
    );
    if (wavDir && r.b64) writeFileSync(`${wavDir}/${r.song}-${r.name}-L${r.level}.wav`, wav(r.b64, r.SR));
  }

  if (check) {
    if (worst > TOLERANCE || clipped) {
      console.error(
        `\nFAIL: a robot is more than ${TOLERANCE} dB off its target, or a full stage peaks at ${PEAK_CEILING} or more. Run: node scripts/robots-mix.mjs`,
      );
      process.exitCode = 1;
    } else console.log('\nOK: every robot sits where it should and no full stage clips.');
  } else {
    const rows = robots
      .map((id) => `  ${id}: { ${SONGS.map((s) => `${s}: ${Number((vols[id][s] ?? 1).toFixed(3))}`).join(', ')} },`)
      .join('\n');
    writeFileSync(
      OUT,
      `import type { SongId } from './groove';

/**
 * Where each robot sits in the mix of each song. Generated by \`node scripts/robots-mix.mjs\`, which
 * renders every robot alone, through the real audio chain, and measures how loud it is (A-weighted,
 * loudest 300 ms) so a flute and a kick, a marimba and a steelpan, land where a listener expects them.
 * Do not edit by hand; re-run the script after changing a pattern, a voice or \`BAND_GAIN\`.
 */
export const MIX: Readonly<Record<string, Partial<Record<SongId, number>>>> = {
${rows}
};
`,
      'utf8',
    );
    console.log(`\nWrote ${OUT}. Re-run with --check to confirm.`);
  }
} finally {
  await browser.close();
  stop();
}
