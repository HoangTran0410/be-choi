/**
 * How loud the recorded instruments really come out: renders each one through the real engine and
 * master chain (the same way scripts/loudness.mjs does the synth) and prints its A-weighted
 * 300 ms level against the house level.
 *
 *   node scripts/instrument-loudness.mjs           measure and print
 *   node scripts/instrument-loudness.mjs --check   also exit 1 when a set is > 3 dB off
 *
 * The files are levelled at build time (scripts/instrument-samples.mjs, SAMPLE_DB); this is the
 * proof that the level survives the compressor and limiter in front of the speaker.
 */
import { A_GAIN, A_WEIGHT, INTENT_DB, TARGET_DB, withPage } from './lib/loudness-common.mjs';

const check = process.argv.includes('--check');
const TOLERANCE = 3;

async function measure(cfg) {
  const { createAudio } = await import('/src/core/audio.ts');
  const { SAMPLE_SETS } = await import('/src/core/samplesManifest.ts');
  const { INSTRUMENT_REF } = await import('/src/core/instruments.ts');
  Object.defineProperty(globalThis, 'Worker', { value: undefined, configurable: true, writable: true });
  const SR = 48000;
  const SETTLE = 1;
  const SECONDS = 3;
  const WINDOW = Math.round(SR * 0.3);
  const HOP = Math.round(SR * 0.01);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);

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
  function momentary(d) {
    let sum = 0;
    for (let i = 0; i < Math.min(WINDOW, d.length); i++) sum += d[i] * d[i];
    let best = sum;
    for (let s = HOP; s + WINDOW <= d.length; s += HOP) {
      for (let i = s - HOP; i < s; i++) sum -= d[i] * d[i];
      for (let i = s + WINDOW - HOP; i < s + WINDOW; i++) sum += d[i] * d[i];
      if (sum > best) best = sum;
    }
    return Math.sqrt(best / WINDOW);
  }

  async function one(key, play) {
    const off = new OfflineAudioContext(1, SR * (SECONDS + SETTLE), SR);
    const realCtor = globalThis.AudioContext;
    globalThis.AudioContext = function () {
      return off;
    };
    try {
      const audio = createAudio();
      audio.unlock();
      audio.preloadInstruments([key]);
      await sleep(600); // fetched and decoded for real, in the page
      const realResume = off.resume.bind(off);
      off.suspend(SETTLE).then(async () => {
        off.resume = () => Promise.resolve();
        try {
          play(audio);
        } finally {
          off.resume = realResume;
          await realResume();
        }
      });
      const raw = (await off.startRendering()).getChannelData(0).subarray(SR * SETTLE);
      let peak = 0;
      for (const v of raw) peak = Math.max(peak, Math.abs(v));
      return { key, peak, peakDb: db(peak), db: db(momentary(await weigh(raw))) };
    } finally {
      globalThis.AudioContext = realCtor;
    }
  }

  const rows = [];
  for (const key of Object.keys(SAMPLE_SETS)) {
    const [kind, name] = key.split(':');
    const play =
      kind === 'note' ? (a) => a.note(440, 0.5, name) : kind === 'drum' ? (a) => a.drum(name) : (a) => a.inst(name, INSTRUMENT_REF[name], 1);
    rows.push({ goal: cfg.target + (cfg.intent[key] ?? 0), ...(await one(key, play)) });
  }
  return rows;
}

await withPage(0, async (page) => {
  const rows = await page.evaluate(measure, { target: TARGET_DB, intent: INTENT_DB, weighting: A_WEIGHT, weightGain: A_GAIN });
  console.log('name                level dB   want dB    off   peak dB');
  let bad = 0;
  for (const r of rows) {
    const off = r.db - r.goal;
    const flag = Math.abs(off) > TOLERANCE || r.peak > 1 ? '  <-- off' : '';
    if (flag) bad++;
    console.log(`${r.key.padEnd(20)} ${r.db.toFixed(1).padStart(7)}  ${r.goal.toFixed(1).padStart(8)}  ${off.toFixed(1).padStart(5)}  ${r.peakDb.toFixed(1).padStart(8)}${flag}`);
  }
  const offs = rows.map((r) => r.db - r.goal);
  console.log(`\nmean ${(offs.reduce((a, b) => a + b, 0) / offs.length).toFixed(1)} dB, spread ${(Math.max(...rows.map((r) => r.db)) - Math.min(...rows.map((r) => r.db))).toFixed(1)} dB`);
  if (check && bad) process.exit(1);
});
