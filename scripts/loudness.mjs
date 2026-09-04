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
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

/** House level, in A-weighted dBFS momentary. Sits near the middle of the untrimmed set. */
const TARGET_DB = -22;
/**
 * A-weighting as three biquads: a double pole at 20.6 Hz, single poles at 107.7 and
 * 737.9 Hz (one biquad at their geometric mean, with the Q that puts the two real
 * poles back where they belong), a double pole at 12194 Hz, and the four zeros at
 * DC that the highpasses bring with them. `A_GAIN` is the standard +2.0 dB
 * normalisation, which puts 1 kHz at unity so the numbers stay on the same scale as
 * the flat ones they replace.
 */
const A_WEIGHT = [
  ['highpass', 20.6, 0.5],
  ['highpass', 281.9, 0.3334],
  ['lowpass', 12194, 0.5],
];
const A_GAIN = 1.2589;
/**
 * Sounds meant to sit off the house level. A UI click as loud as a lion is not
 * levelling, it is nagging; a reward no louder than a click is not a reward.
 * Everything absent from here is levelled flat.
 */
const INTENT_DB = {
  // A click is a click: it should be heard without ever being the loudest thing
  // in the room. Now that it has some body it can reach this and stay there.
  tick: -7,
  pop: -3,
  jingle: 2,
  'fx:cheer': 2,
};
/** How far one sound may be pushed. Beyond this a sound needs fixing, not trimming. */
const TRIM_MIN = 0.15;
const TRIM_MAX = 12;
/** A trimmed sound must still leave headroom before the compressor. */
const PEAK_CEILING = 0.98;
/** How far a sound may end up from where it is meant to be, in dB. */
const TOLERANCE = 3;
/** Measure-and-correct rounds, and how much of each correction to apply. */
const PASSES = 8;
const DAMPING = 0.7;
const PORT = 5199;
const OUT = 'src/core/loudness.ts';

const check = process.argv.includes('--check');

/** Runs in the page: renders and measures every sound, correcting as it goes. */
async function levelInPage(cfg) {
  const { createAudio, FX, DRUMS, TIMBRES } = await import('/src/core/audio.ts');
  const { LOUDNESS } = await import('/src/core/loudness.ts');
  const { SFX_TAKES } = await import('/src/core/sfx.ts');
  const SR = 48000;
  const SECONDS = 4;
  const WINDOW = Math.round(SR * 0.3);
  const HOP = Math.round(SR * 0.01);

  /** Render one sound on its own, through the same chain the child hears. */
  async function render(play) {
    const off = new OfflineAudioContext(1, SR * SECONDS, SR);
    const realCtor = globalThis.AudioContext;
    globalThis.AudioContext = function () {
      return off;
    };
    try {
      const audio = createAudio();
      audio.unlock();
      await play(audio);
    } finally {
      globalThis.AudioContext = realCtor;
    }
    return (await off.startRendering()).getChannelData(0);
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
    ...TIMBRES.map((t) => [`note:${t}`, (a) => a.note(440, 0.5, t)]),
    ...DRUMS.map((d) => [`drum:${d}`, (a) => a.drum(d)]),
    ...FX.map((f) => [`fx:${f}`, (a) => a.fx(f)]),
  ];

  // The recorded voices are already level with each other, so one of them stands
  // for the group; --check then confirms the rest landed with it.
  const sampled = Object.keys(SFX_TAKES);
  if (sampled.length > 0) {
    jobs.push([
      'sample',
      async (a) => {
        await a.ready();
        a.fx(sampled[0]);
      },
    ]);
  }

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

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stopServer = () => server.kill('SIGTERM');
process.on('exit', stopServer);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (let tries = 0; ; tries++) {
    try {
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 4000 });
      break;
    } catch (err) {
      if (tries >= 20) throw err;
      await new Promise((r) => setTimeout(r, 700));
    }
  }

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
      ['effects and animal voices', (id) => id.startsWith('fx:')],
    ];
    let body = '';
    for (const [title, belongs] of groups) {
      body += `  // ${title}\n`;
      for (const r of after.filter((x) => belongs(x.id))) body += `  '${r.id}': ${Number(r.trim.toFixed(4))},\n`;
    }
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
} finally {
  await browser.close();
  stopServer();
}
