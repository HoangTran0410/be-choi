/**
 * Audit every source of sound in the app against one house level.
 *
 * loudness.mjs levels the synthesized sounds. This covers everything a child can
 * hear, and says which of it sticks out:
 *
 *   - the synth (every SoundId), and each timbre at four pitches, because a
 *     triangle at C6 does not sit where it does at A4;
 *   - every recording in public/ (sounds/, sfx/, ambience/), played through the
 *     engine's own clip()/loop(), so its trim and the master chain are included;
 *   - the music the games make with the synth: every song as sing/xylo/birthday
 *     play it, the band's phrases, the orchestra's grooves (whole band and each
 *     animal), and the jam backing beats.
 *
 * Each is rendered offline through the real master chain and scored on
 *   level  A-weighted momentary maximum (loudest 300 ms), as in loudness.mjs;
 *   peak   sample peak and true peak (4x oversampled), after the chain;
 *   edge   how much of the loudest window sits in 2-5 kHz, where a small speaker
 *          is sharpest and a child's ear most sensitive. A sound is called "harsh"
 *          when that band is both a large share of it and loud in its own right:
 *          a quiet hiss is not a problem, a pure 3 kHz tone at the house level is.
 *
 *   node scripts/loudness-audit.mjs            print the ranking
 *   node scripts/loudness-audit.mjs --check    same, exit 1 if anything is flagged
 *   node scripts/loudness-audit.mjs --fix      re-level the recordings (writes
 *                                              src/core/loudness-files.ts)
 *   --json <path>   also write the rows as JSON
 *   --only <text>   only sources whose id contains <text>
 *
 * Synth trims are written by loudness.mjs, not here: run that first.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { A_GAIN, A_WEIGHT, DAMPING, INTENT_DB, PEAK_CEILING, TARGET_DB, TRIM_MAX, TRIM_MIN, withPage } from './lib/loudness-common.mjs';

const PORT = 5198;
const OUT = 'src/core/loudness-files.ts';
/** How far a source may sit from its mark before it is called out, in dB. */
const TOLERANCE = 4;
/** True peak above this is flagged: the speaker's own limiter will be the one to catch it. */
const TRUE_PEAK_MAX_DB = -0.5;
/** "Harsh": at least this share of the loudest window is in 2-5 kHz ... */
const EDGE_SHARE_DB = -2;
/** ... and that band alone is at least this loud (flat dBFS, after the chain). */
const EDGE_LEVEL_DB = -25;
/**
 * Recordings that are a bed rather than a voice sit under whatever else is on:
 * scripts/ambience.mjs masters them to -26 LUFS, a few dB under the house level.
 */
const INTENT_GROUP_DB = { ambience: -3 };

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const check = flag('--check');
const fix = flag('--fix');
const only = option('--only');

const files = ['sounds', 'sfx', 'ambience']
  .flatMap((dir) => readdirSync(`public/${dir}`).filter((f) => f.endsWith('.m4a')).map((f) => `${dir}/${f}`))
  .sort();

/** Runs in the page. Renders and scores every source; with `cfg.fix`, re-levels the recordings. */
async function auditInPage(cfg) {
  const { createAudio, TIMBRES, DRUMS, FX, INSTRUMENTS: WORLD } = await import('/src/core/audio.ts');
  const { INSTRUMENT_REF } = await import('/src/core/instruments.ts');
  const { LOUDNESS } = await import('/src/core/loudness.ts');
  const { FILE_TRIM } = await import('/src/core/loudness-files.ts');
  const { SONGS, noteFreq } = await import('/src/core/music.ts');
  const { INSTRUMENTS, isDrumKind } = await import('/src/games/band/logic.ts');
  const orch = await import('/src/games/orchestra/logic.ts');
  const jam = await import('/src/games/jam/logic.ts');
  const { allAmbients } = await import('/src/games/ambience/logic.ts');


  // The engine renders computed notes on a worker in the app; here they must be the real
  // samples, in this thread, or the numbers would be those of the stand-in tone.
  Object.defineProperty(globalThis, 'Worker', { value: undefined, configurable: true, writable: true });
  const SR = 48000;
  const SETTLE = 1;
  const WINDOW = Math.round(SR * 0.3);
  const HOP = Math.round(SR * 0.01);
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
  const pow = (x) => (x > 0 ? 10 * Math.log10(x) : -120);

  /** A fixed-seed Math.random, so noise-based sounds measure the same every run. */
  function seeded() {
    let s = 0x9e3779b9;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Render one source through the same chain the child hears. `play(audio, at)`
   * starts what it can straight away and registers the rest with `at(seconds, fn)`,
   * which runs `fn(audio)` when the offline clock reaches that time.
   */
  async function render(play, seconds) {
    const off = new OfflineAudioContext(1, Math.ceil(SR * (seconds + SETTLE)), SR);
    const realCtor = globalThis.AudioContext;
    const realRandom = Math.random;
    globalThis.AudioContext = function () {
      return off;
    };
    Math.random = seeded();
    try {
      const audio = createAudio();
      audio.unlock();
      const quantum = 128 / SR;
      const slots = new Map();
      const realResume = off.resume.bind(off);
      /**
       * Build sounds while the clock is stopped. The engine resumes a suspended context
       * on every call (right for a phone), and an offline context that resumes mid-callback
       * keeps rendering while the sound is still being built: the first of its automation
       * lands in the past and the sound starts late, or, if building it is slow (a sung
       * cat), after the render has ended. Resuming is held back until the work is done.
       */
      const whileStopped = async (work) => {
        off.resume = () => Promise.resolve();
        try {
          await work();
        } finally {
          off.resume = realResume;
          await realResume();
        }
      };
      const at = (t, fn) => {
        if (t <= 0) return fn(audio);
        const key = Math.ceil((SETTLE + t) / quantum) * quantum;
        if (key >= seconds + SETTLE) return;
        const list = slots.get(key);
        if (list) list.push(fn);
        else {
          slots.set(key, [fn]);
          off.suspend(key).then(() => whileStopped(() => slots.get(key).forEach((f) => f(audio))));
        }
      };
      // Nothing starts at t = 0. A sound in the first moments of a fresh context comes out
      // some 10 dB quieter than the same sound a moment later (measured: the same piano
      // note at 0, 0.5 and 1.0 s reads -11, -1.5 and -1 dB peak), so levelling on it would
      // set every trim too hot for the running app.
      off.suspend(Math.ceil(SETTLE / quantum) * quantum).then(() => whileStopped(() => play(audio, at)));
      return (await off.startRendering()).getChannelData(0).subarray(Math.round(SR * SETTLE));
    } finally {
      globalThis.AudioContext = realCtor;
      Math.random = realRandom;
    }
  }

  async function filtered(data, chain, gain = 1) {
    const off = new OfflineAudioContext(1, data.length, SR);
    const buf = off.createBuffer(1, data.length, SR);
    buf.copyToChannel(data, 0);
    const src = off.createBufferSource();
    src.buffer = buf;
    let head = src;
    for (const [type, freq, q] of chain) {
      const f = off.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      head = head.connect(f);
    }
    const g = off.createGain();
    g.gain.value = gain;
    head.connect(g).connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  }

  /** Mean square over every WINDOW; returns the loudest one and where it starts. */
  function loudest(data) {
    let sum = 0;
    for (let i = 0; i < Math.min(WINDOW, data.length); i++) sum += data[i] * data[i];
    let best = sum;
    let at = 0;
    for (let start = HOP; start + WINDOW <= data.length; start += HOP) {
      for (let i = start - HOP; i < start; i++) sum -= data[i] * data[i];
      for (let i = start + WINDOW - HOP; i < start + WINDOW; i++) sum += data[i] * data[i];
      if (sum > best) {
        best = sum;
        at = start;
      }
    }
    return { ms: Math.max(0, best) / Math.min(WINDOW, data.length), at };
  }

  function meanSquare(data, from) {
    let sum = 0;
    const to = Math.min(data.length, from + WINDOW);
    for (let i = from; i < to; i++) sum += data[i] * data[i];
    return sum / Math.max(1, to - from);
  }

  /** 4x oversampled peak, with a 16-tap windowed sinc. Only looks where it could matter. */
  function truePeak(data, samplePeak) {
    const taps = 8;
    const kernels = [1, 2, 3].map((p) => {
      const k = [];
      for (let n = -taps + 1; n <= taps; n++) {
        const x = n - p / 4;
        const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
        const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / (taps + 0.5));
        k.push(sinc * w);
      }
      return k;
    });
    let best = samplePeak;
    const gate = samplePeak * 0.5;
    for (let i = taps; i < data.length - taps; i++) {
      if (Math.abs(data[i]) < gate && Math.abs(data[i + 1]) < gate) continue;
      for (const k of kernels) {
        let s = 0;
        for (let j = 0; j < k.length; j++) s += data[i + j - taps + 1] * k[j];
        if (Math.abs(s) > best) best = Math.abs(s);
      }
    }
    return best;
  }

  async function score(raw) {
    let peak = 0;
    for (let i = 0; i < raw.length; i++) {
      const v = Math.abs(raw[i]);
      if (v > peak) peak = v;
    }
    const weighted = await filtered(raw, cfg.weighting, cfg.weightGain);
    const { ms, at } = loudest(weighted);
    const band = await filtered(raw, [
      // Q is in dB for these filter types: -3.01 is the flat Butterworth response.
      ['highpass', 2000, -3.01],
      ['lowpass', 5000, -3.01],
    ]);
    const whole = meanSquare(raw, at);
    const hi = meanSquare(band, at);
    return {
      db: pow(ms),
      peak,
      peakDb: db(peak),
      tpDb: db(truePeak(raw, peak)),
      edgeShareDb: whole > 0 ? pow(hi / whole) : -120,
      edgeDb: pow(hi),
      atMs: Math.round((at / SR) * 1000),
    };
  }

  // ---- the sources -------------------------------------------------------------
  const sources = [];
  const add = (id, group, seconds, play, extra = {}) => sources.push({ id, group, seconds, play, ...extra });

  const synth = [
    ['pop', (a) => a.pop()],
    ['ding', (a) => a.ding()],
    ['boing', (a) => a.boing()],
    ['chomp', (a) => a.chomp()],
    ['tick', (a) => a.tick()],
    ['jingle', (a) => a.jingle()],
    ['puff', (a) => a.puff()],
    ...TIMBRES.map((t) => [`note:${t}`, (a) => a.note(440, 0.5, t)]),
    ...DRUMS.map((d) => [`drum:${d}`, (a) => a.drum(d)]),
    ...FX.map((f) => [`fx:${f}`, (a) => a.fx(f)]),
    ...WORLD.map((i) => [`inst:${i}`, (a) => a.inst(i, INSTRUMENT_REF[i], 1)]),
  ];
  for (const [id, fn] of synth) add(id, 'synth', 4, fn);

  // Pitch matters: the levelling is done at 440 Hz, the games play C2 to G5.
  for (const t of TIMBRES) {
    for (const n of ['C3', 'C4', 'C5', 'C6']) add(`pitch:${t}@${n}`, 'pitch', 4, (a) => a.note(noteFreq(n), 0.5, t));
  }

  // Catband: a cat singing each note of its scale, and the same one singing along softly.
  for (const [i, n] of ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'].entries()) {
    add(`cat:${i}:${n}`, 'cats', 3, (a) => a.pitched('meow', noteFreq(n) * 2));
  }

  // Recordings, through the engine so that the trim they get is the trim they are heard with.
  const gains = new Map(allAmbients().map((a) => [`ambience/${a.id}.m4a`, a.gain ?? 1]));
  for (const url of cfg.files) {
    const dir = url.split('/')[0];
    const gain = gains.get(url) ?? 1;
    add(
      `file:${url}`,
      dir,
      14,
      async (a) => {
        if (dir === 'ambience') {
          // Played as the game plays it: a loop, from the top so that it is repeatable.
          const keep = Math.random;
          Math.random = () => 0;
          try {
            await a.loop(url, gain);
          } finally {
            Math.random = keep;
          }
        } else {
          await a.clip(url);
        }
      },
      { url, gainDb: db(gain) },
    );
  }

  // Music, as the games schedule it.
  const beatSec = (bpm) => 60 / bpm;
  function playSong(song, timbre, a, at) {
    let t = 0;
    for (const n of song.notes) {
      const dur = n.d * beatSec(song.bpm);
      if (n.n !== 'R') at(t, () => a.note(noteFreq(n.n), dur * 0.9, timbre));
      t += dur;
    }
    return t;
  }
  const songLength = (song) => song.notes.reduce((s, n) => s + n.d * beatSec(song.bpm), 0) + 1.5;
  for (const song of SONGS) {
    for (const timbre of ['bell', 'xylo', 'piano']) {
      add(`song:${song.id}@${timbre}`, 'music', Math.min(songLength(song), 40), (a, at) => void playSong(song, timbre, a, at));
    }
  }
  for (const inst of INSTRUMENTS) {
    const len = inst.phrase.reduce((s, n) => s + n.d * beatSec(inst.bpm), 0) + 1.5;
    add(`band:${inst.id}`, 'music', len, (a, at) => {
      let t = 0;
      for (const n of inst.phrase) {
        const dur = n.d * beatSec(inst.bpm);
        if (n.n !== 'R') {
          if (inst.timbre === 'drum') {
            if (isDrumKind(n.n)) at(t, () => a.drum(n.n));
          } else at(t, () => a.note(noteFreq(n.n), dur * 0.9, inst.timbre));
        }
        t += dur;
      }
    });
  }
  function playOrchestra(active, groove, a, at, bars) {
    const step = orch.stepMs(groove.bpm) / 1000;
    for (let i = 0; i < bars * orch.STEPS; i++) {
      for (const ev of orch.stepEvents(active, i % orch.STEPS, Math.floor(i / orch.STEPS))) {
        at(i * step, () => {
          if (ev.part.kind === 'drum') {
            if (orch.isDrumKind(ev.value)) a.drum(ev.value);
            return;
          }
          const dur = orch.noteSeconds(ev.part, groove.bpm);
          for (const n of ev.value.split('+')) a.note(noteFreq(orch.transpose(n, groove.semitones)), dur, ev.part.timbre);
        });
      }
    }
  }
  for (const groove of orch.GROOVES) {
    const secs = (orch.stepMs(groove.bpm) / 1000) * orch.STEPS * 2 + 1.5;
    add(`orchestra:${groove.id}:all`, 'music', secs, (a, at) => playOrchestra(new Set(orch.PARTS.map((p) => p.id)), groove, a, at, 2));
  }
  const vui = orch.GROOVES[0];
  for (const part of orch.PARTS) {
    const secs = (orch.stepMs(vui.bpm) / 1000) * orch.STEPS * 2 + 1.5;
    add(`orchestra:${part.id}`, 'music', secs, (a, at) => playOrchestra(new Set([part.id]), vui, a, at, 2));
  }
  for (const beat of jam.BEATS) {
    const step = jam.stepMs(beat.bpm) / 1000;
    add(`jam:${beat.id}`, 'music', step * jam.STEPS * 2 + 1.5, (a, at) => {
      for (let i = 0; i < jam.STEPS * 2; i++) {
        const s = i % jam.STEPS;
        for (const kind of beat.steps[s] ?? []) at(i * step, () => a.drum(kind));
        const bass = beat.bass[s];
        if (bass) at(i * step, () => a.note(noteFreq(bass), step * jam.BASS_HOLD, 'bass'));
      }
    });
  }

  const wanted = sources.filter((s, i) => (!cfg.only || s.id.includes(cfg.only)) && i % cfg.of === cfg.part);
  const goalOf = (s) => cfg.target + (cfg.intent[s.id] ?? 0) + (cfg.groupIntent[s.group] ?? 0) + (s.gainDb ?? 0);

  /** The file's own loudest sample, before the chain: what a boost has to leave room for. */
  const sourcePeaks = new Map();
  async function sourcePeak(url) {
    if (sourcePeaks.has(url)) return sourcePeaks.get(url);
    let peak = 1;
    try {
      const res = await fetch(`/${url}`);
      const buf = await new OfflineAudioContext(1, 1, SR).decodeAudioData(await res.arrayBuffer());
      peak = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    } catch {
      /* leave it at 1: the boost is then as careful as it can be */
    }
    sourcePeaks.set(url, peak);
    return peak;
  }

  async function sweep(list) {
    const rows = [];
    for (const s of list) {
      const raw = await render(s.play, s.seconds);
      rows.push({ id: s.id, group: s.group, goal: goalOf(s), url: s.url, ...(await score(raw)) });
    }
    return rows;
  }

  const before = await sweep(wanted);
  if (!cfg.fix) return { rows: before, before };

  // Re-level the recordings. The chain is nearly linear for them (they sit under the
  // compressor's threshold), so a couple of rounds at full strength is enough.
  const fileSources = wanted.filter((s) => s.url);
  const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);
  let rows = before;
  for (let pass = 0; pass < 4; pass++) {
    const todo = rows.filter((r) => r.url && Math.abs(r.db - r.goal) > 0.4);
    if (todo.length === 0) break;
    for (const r of todo) {
      const cur = FILE_TRIM[r.url] ?? 1;
      let next = clamp(cur * 10 ** ((cfg.damping * (r.goal - r.db)) / 20), cfg.trimMin, cfg.trimMax);
      // Never ask the master for more than the recording can give without the limiter working.
      const room = cfg.peakCeiling / (0.85 * (await sourcePeak(r.url)) * (LOUDNESS.sample ?? 1));
      if (next > room && next > cur) next = Math.max(cur, room);
      FILE_TRIM[r.url] = next;
    }
    const again = await sweep(fileSources.filter((s) => todo.some((r) => r.id === s.id)));
    rows = rows.map((r) => again.find((x) => x.id === r.id) ?? r);
  }
  return { rows, before, trims: Object.fromEntries(fileSources.filter((s) => FILE_TRIM[s.url] !== undefined).map((s) => [s.url, FILE_TRIM[s.url]])) };
}

/**
 * The sources are measured in a few slices, reloading the page between them: several
 * hundred offline renders in one page is enough to run a laptop's tab out of memory.
 */
const SLICES = 6;
const result = { rows: [], trims: {} };
await withPage(PORT, async (page) => {
  for (let part = 0; part < SLICES; part++) {
    if (part > 0) await page.reload({ waitUntil: 'domcontentloaded' });
    const slice = await page.evaluate(auditInPage, {
      target: TARGET_DB,
      intent: INTENT_DB,
      groupIntent: INTENT_GROUP_DB,
      weighting: A_WEIGHT,
      weightGain: A_GAIN,
      files,
      only,
      fix,
      part,
      of: SLICES,
      damping: Math.min(1, DAMPING + 0.3),
      trimMin: TRIM_MIN,
      trimMax: TRIM_MAX,
      peakCeiling: PEAK_CEILING,
    });
    result.rows.push(...slice.rows);
    Object.assign(result.trims, slice.trims);
  }
});

const rows = result.rows;
// Music is a run of notes, so its momentary maximum sits well above a single note's: there
// is no absolute mark for it. It is held against the other music instead, which is what a
// child hears when one game's backing is twice as loud as the next one's.
const music = rows.filter((r) => r.group === 'music').map((r) => r.db).sort((a, b) => a - b);
if (music.length > 0) {
  const median = music[Math.floor(music.length / 2)];
  for (const r of rows) if (r.group === 'music') r.goal = median;
}
/**
 * The same note an octave or two away is expected to wander more than a different sound,
 * and a tune more than a note (it adds its own overlaps).
 */
const toleranceOf = (r) => (r.group === 'pitch' ? 7 : r.group === 'music' ? 5.5 : TOLERANCE);
const verdict = (r) => {
  const marks = [];
  const off = r.db - r.goal;
  if (off > toleranceOf(r)) marks.push('QUÁ TO');
  if (off < -toleranceOf(r)) marks.push('QUÁ NHỎ');
  if (r.edgeShareDb > EDGE_SHARE_DB && r.edgeDb > EDGE_LEVEL_DB) marks.push('CHÓI');
  if (r.tpDb > TRUE_PEAK_MAX_DB) marks.push('PEAK');
  return marks;
};

const sorted = [...rows].sort((a, b) => b.db - b.goal - (a.db - a.goal));
const w = Math.max(...rows.map((r) => r.id.length), 4);
console.log(`${'source'.padEnd(w)}  level  vs mark   peak  true-pk  2-5k share  2-5k lvl`);
for (const r of sorted) {
  const marks = verdict(r);
  console.log(
    `${r.id.padEnd(w)}  ${r.db.toFixed(1).padStart(5)}  ${(r.db - r.goal >= 0 ? '+' : '') + (r.db - r.goal).toFixed(1).padStart(5)}  ${r.peakDb.toFixed(1).padStart(5)}  ${r.tpDb.toFixed(1).padStart(7)}  ${r.edgeShareDb.toFixed(1).padStart(10)}  ${r.edgeDb.toFixed(1).padStart(8)}${marks.length ? '  <-- ' + marks.join(' ') : ''}`,
  );
}

const byGroup = new Map();
for (const r of rows) byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), r]);
console.log('\ngroup        n   median vs mark   worst');
for (const [group, list] of byGroup) {
  const offs = list.map((r) => r.db - r.goal).sort((a, b) => a - b);
  const worst = offs.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
  console.log(`${group.padEnd(11)} ${String(list.length).padStart(3)}   ${offs[Math.floor(offs.length / 2)].toFixed(1).padStart(14)}   ${worst.toFixed(1).padStart(5)}`);
}

const flagged = rows.filter((r) => verdict(r).length > 0);
console.log(`\n${rows.length} sources, ${flagged.length} flagged (off by more than ${TOLERANCE} dB, harsh, or true peak over ${TRUE_PEAK_MAX_DB} dBTP).`);

const jsonPath = option('--json');
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(rows, null, 1));

if (fix) {
  const entries = Object.entries(result.trims)
    .filter(([, v]) => Math.abs(v - 1) > 1e-3)
    .sort(([a], [b]) => a.localeCompare(b));
  const body = entries.map(([url, v]) => `  '${url}': ${Number(v.toFixed(4))},`).join('\n');
  writeFileSync(
    OUT,
    `/**
 * How much each recording in \`public/\` is turned down (or up) to land at the house
 * level, keyed by its URL as the engine plays it (\`sounds/pig.m4a\`,
 * \`sfx/bark-0.m4a\`, \`ambience/rain.m4a\`). Without it a file is as loud as it was
 * mastered, and the set spans some 25 dB: the quiet ones vanish on a phone speaker
 * and the loud ones make a parent reach for the volume rocker.
 *
 * Applied on top of \`LOUDNESS.sample\`. A file absent from here plays as it is.
 *
 * Generated by \`node scripts/loudness-audit.mjs --fix\`, which renders every file
 * through the real master chain and measures it. Do not edit by hand: re-run the
 * script after replacing any file, and commit what it writes.
 */
export const FILE_TRIM: Readonly<Record<string, number>> = {
${body}
};
`,
    'utf8',
  );
  console.log(`Wrote ${OUT} (${entries.length} recordings trimmed).`);
}

if (check && flagged.length > 0) {
  console.error('\nFAIL: see the rows marked above. Run: node scripts/loudness.mjs, then node scripts/loudness-audit.mjs --fix');
  process.exitCode = 1;
}
