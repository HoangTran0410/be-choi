/**
 * Level every sound in the synth.
 *
 * Renders each sound offline through the real master chain, measures how loud it
 * actually is, and writes `src/core/loudness.ts` with the trim that brings it to
 * the house level. Without this the set spans some 30 dB: a parent turns the
 * volume up for the pig, then gets startled by the cow.
 *
 *   node scripts/loudness.mjs           measure and rewrite the table
 *   node scripts/loudness.mjs --check   measure only, fail if anything is off level
 *
 * The measurement is A-weighted momentary loudness (the loudest 300 ms window),
 * which is roughly what an ear reports for a one-shot sound: a 20 ms click really
 * is quieter than a held note that peaks just as high, and a 50 Hz thump really is
 * quieter than a 3 kHz ting that meters the same. The weighting is the whole point
 * of the exercise — levelled on a flat meter the drum kit ends up inaudible under
 * the bells, which is what a phone speaker had been telling us all along. The
 * compressor on the master bus makes the chain non-linear, so the trims are found
 * by measuring and correcting a few times rather than by one division.
 */
import { writeFileSync } from 'node:fs';
import { A_GAIN, A_WEIGHT, DAMPING, INTENT_DB, PASSES, PEAK_CEILING, TARGET_DB, TRIM_MAX, TRIM_MIN, withPage } from './lib/loudness-common.mjs';

/** How far a sound may end up from where it is meant to be, in dB. */
const TOLERANCE = 3;
const PORT = 5199;
const OUT = 'src/core/loudness.ts';

const check = process.argv.includes('--check');

/** Runs in the page: renders and measures every sound, correcting as it goes. */
async function levelInPage(cfg) {
  const { createAudio, FX, DRUMS, TIMBRES, INSTRUMENTS } = await import('/src/core/audio.ts');
  const { INSTRUMENT_REF } = await import('/src/core/instruments.ts');
  const { LOUDNESS } = await import('/src/core/loudness.ts');
  // The engine renders computed notes on a worker in the app; here they must be the real
  // samples, in this thread, or the numbers would be those of the stand-in tone.
  Object.defineProperty(globalThis, 'Worker', { value: undefined, configurable: true, writable: true });
  const SR = 48000;
  const SECONDS = 4;
  const SETTLE = 1;
  const WINDOW = Math.round(SR * 0.3);
  const HOP = Math.round(SR * 0.01);

  /** Render one sound on its own, through the same chain the child hears. */
  async function render(play) {
    const off = new OfflineAudioContext(1, SR * (SECONDS + SETTLE), SR);
    const realCtor = globalThis.AudioContext;
    const realRandom = Math.random;
    globalThis.AudioContext = function () {
      return off;
    };
    // A fixed seed: the noise in a clap or a drum roll must not move the numbers between runs.
    let seed = 0x9e3779b9;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      const audio = createAudio();
      audio.unlock();
      // Nothing starts at t = 0. A sound in the first moments of a fresh context comes out
      // some 10 dB quieter than the same sound a moment later (measured: the same piano
      // note at 0, 0.5 and 1.0 s reads -11, -1.5 and -1 dB peak), so levelling on it would
      // set every trim too hot for the running app. The engine resumes a suspended context
      // whenever a sound is made, which would let the render run on while the sound is still
      // being built; resuming is held back until it is done.
      const realResume = off.resume.bind(off);
      off.suspend(Math.ceil((SETTLE * SR) / 128) * (128 / SR)).then(async () => {
        off.resume = () => Promise.resolve();
        try {
          await play(audio);
        } finally {
          off.resume = realResume;
          await realResume();
        }
      });
      return (await off.startRendering()).getChannelData(0).subarray(Math.round(SR * SETTLE));
    } finally {
      globalThis.AudioContext = realCtor;
      Math.random = realRandom;
    }
  }

  /** The same sound as an ear weights it. Loudness is read off this, headroom off the raw. */
  async function weigh(data) {
    const off = new OfflineAudioContext(1, data.length, SR);
    const buf = off.createBuffer(1, data.length, SR);
    buf.copyToChannel(data, 0);
    const src = off.createBufferSource();
    src.buffer = buf;
    let head = src;
    for (const [type, freq, q] of cfg.weighting) {
      const f = off.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      head = head.connect(f);
    }
    const g = off.createGain();
    g.gain.value = cfg.weightGain;
    head.connect(g).connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  }

  /** The loudest 300 ms window of `data`, as an amplitude. */
  function momentary(data) {
    let sum = 0;
    for (let i = 0; i < Math.min(WINDOW, data.length); i++) sum += data[i] * data[i];
    let best = sum;
    for (let start = HOP; start + WINDOW <= data.length; start += HOP) {
      for (let i = start - HOP; i < start; i++) sum -= data[i] * data[i];
      for (let i = start + WINDOW - HOP; i < start + WINDOW; i++) sum += data[i] * data[i];
      if (sum > best) best = sum;
    }
    return Math.sqrt(best / WINDOW);
  }

  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);

  /** Headroom off the signal as it really is; loudness off the weighted copy. */
  async function score(play) {
    const raw = await render(play);
    let peak = 0;
    for (let i = 0; i < raw.length; i++) {
      const v = Math.abs(raw[i]);
      if (v > peak) peak = v;
    }
    return { peak, peakDb: db(peak), db: db(momentary(await weigh(raw))) };
  }

  const jobs = [
    ['pop', (a) => a.pop()],
    ['ding', (a) => a.ding()],
    ['boing', (a) => a.boing()],
    ['chomp', (a) => a.chomp()],
    ['tick', (a) => a.tick()],
    ['jingle', (a) => a.jingle()],
    ['puff', (a) => a.puff()],
    ['cat', (a) => a.pitched('meow', 784)],
    ...TIMBRES.map((t) => [`note:${t}`, (a) => a.note(440, 0.5, t)]),
    ...DRUMS.map((d) => [`drum:${d}`, (a) => a.drum(d)]),
    ...FX.map((f) => [`fx:${f}`, (a) => a.fx(f)]),
    ...INSTRUMENTS.map((i) => [`inst:${i}`, (a) => a.inst(i, INSTRUMENT_REF[i], 1)]),
  ];

  // The recordings are not levelled here: each file carries its own trim, found by
  // `node scripts/loudness-audit.mjs --fix` (src/core/loudness-files.ts).

  const goalOf = (id) => cfg.target + (cfg.intent[id] ?? 0);
  const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);

  async function sweep() {
    const rows = [];
    for (const [id, play] of jobs) {
      rows.push({ id, goal: goalOf(id), trim: LOUDNESS[id] ?? 1, ...(await score(play)) });
    }
    return rows;
  }

  const before = await sweep();
  if (cfg.measureOnly) return { before, after: before };

  for (let pass = 0; pass < cfg.passes; pass++) {
    const rows = pass === 0 ? before : await sweep();
    for (const r of rows) {
      const cur = LOUDNESS[r.id] ?? 1;
      // Compression makes the chain non-linear, so only part of the correction is
      // applied each round; a few rounds land on it without ringing.
      let next = clamp(cur * 10 ** ((cfg.damping * (r.goal - r.db)) / 20), cfg.trimMin, cfg.trimMax);
      const peakAt = (r.peak / cur) * next;
      if (peakAt > cfg.peakCeiling) next *= cfg.peakCeiling / peakAt;
      LOUDNESS[r.id] = next;
    }
  }
  return { before, after: await sweep() };
}

await withPage(PORT, async (page) => {
  const { before, after } = await page.evaluate(levelInPage, {
    target: TARGET_DB,
    intent: INTENT_DB,
    passes: PASSES,
    damping: DAMPING,
    trimMin: TRIM_MIN,
    trimMax: TRIM_MAX,
    peakCeiling: PEAK_CEILING,
    measureOnly: check,
    weighting: A_WEIGHT,
    weightGain: A_GAIN,
  });

  const worst = (rows) => Math.max(...rows.map((r) => Math.abs(r.db - r.goal)));
  const spread = (rows) => Math.max(...rows.map((r) => r.db)) - Math.min(...rows.map((r) => r.db));

  if (check) {
    console.log('name                level dB   want dB    off   peak dB');
    for (const r of after) {
      const off = r.db - r.goal;
      const flag = Math.abs(off) > TOLERANCE ? '  <-- off level' : '';
      console.log(
        `${r.id.padEnd(20)} ${r.db.toFixed(1).padStart(7)}  ${r.goal.toFixed(1).padStart(8)}  ${off.toFixed(1).padStart(5)}  ${r.peakDb.toFixed(1).padStart(8)}${flag}`,
      );
    }
    const clipping = after.filter((r) => r.peak > 1);
    console.log(`\nspread ${spread(after).toFixed(1)} dB, worst ${worst(after).toFixed(1)} dB off its mark`);
    if (clipping.length > 0) console.log(`clipping: ${clipping.map((r) => r.id).join(', ')}`);
    if (worst(after) > TOLERANCE || clipping.length > 0) {
      console.error(`\nFAIL: something is more than ${TOLERANCE} dB off. Run: node scripts/loudness.mjs`);
      process.exitCode = 1;
    } else {
      console.log('\nOK: every sound sits where it is meant to.');
    }
  } else {
    const groups = [
      ['interface and rewards', (id) => !id.includes(':')],
      ['musical notes, per instrument', (id) => id.startsWith('note:')],
      ['the drum kit', (id) => id.startsWith('drum:')],
      ['world instruments (museum)', (id) => id.startsWith('inst:')],
      ['effects and animal voices', (id) => id.startsWith('fx:')],
    ];
    let body = '';
    for (const [title, belongs] of groups) {
      body += `  // ${title}\n`;
      for (const r of after.filter((x) => belongs(x.id))) body += `  '${r.id}': ${Number(r.trim.toFixed(4))},\n`;
    }
    body += '  // recordings: unity here, each file has its own trim in loudness-files.ts\n  sample: 1,\n';
    writeFileSync(
      OUT,
      `import type { SoundId } from './audio';

/**
 * How much each sound is turned down (or up) so they all land at the same
 * loudness. Without this the set spans some 30 dB — the pig is inaudible at the
 * volume that makes the cow bearable — and a parent spends the afternoon on the
 * volume rocker. A few sounds sit deliberately off the house level: see
 * \`INTENT_DB\` in the script.
 *
 * Loudness here is A-weighted, so a kick and a bell that meter the same on a flat
 * meter do not get the same trim: the kick, which both an ear and a small speaker
 * hear far less of, is given the room it needs.
 *
 * Generated by \`node scripts/loudness.mjs\`, which renders every sound offline
 * through the real master chain and measures it. Do not edit by hand: re-run the
 * script after changing any sound, and commit what it writes.
 */
export const LOUDNESS: Readonly<Record<SoundId, number>> = {
${body}};
`,
      'utf8',
    );

    console.log('name                  was     now    want    trim');
    for (const [i, r] of after.entries()) {
      console.log(
        `${r.id.padEnd(20)} ${before[i].db.toFixed(1).padStart(6)}  ${r.db.toFixed(1).padStart(6)}  ${r.goal.toFixed(1).padStart(6)}  ${r.trim.toFixed(3).padStart(6)}`,
      );
    }
    console.log(`\nspread ${spread(before).toFixed(1)} dB → ${spread(after).toFixed(1)} dB`);
    console.log(`worst ${worst(before).toFixed(1)} dB → ${worst(after).toFixed(1)} dB off its mark. Wrote ${OUT}.`);
  }
});
