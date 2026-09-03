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
 * The measurement is momentary loudness (the loudest 300 ms window), which is
 * what an ear reports for a one-shot sound: a 20 ms click really is quieter than
 * a held note that peaks just as high. The compressor on the master bus makes the
 * chain non-linear, so the trims are found by measuring and correcting a few
 * times rather than by one division.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

/** House level, in dBFS momentary. Sits near the middle of the untrimmed set. */
const TARGET_DB = -22;
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

  /** Peak, and the loudest 300 ms window, both in dBFS. */
  function measure(data) {
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    let sum = 0;
    for (let i = 0; i < Math.min(WINDOW, data.length); i++) sum += data[i] * data[i];
    let best = sum;
    for (let start = HOP; start + WINDOW <= data.length; start += HOP) {
      for (let i = start - HOP; i < start; i++) sum -= data[i] * data[i];
      for (let i = start + WINDOW - HOP; i < start + WINDOW; i++) sum += data[i] * data[i];
      if (sum > best) best = sum;
    }
    const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
    return { peak, peakDb: db(peak), db: db(Math.sqrt(best / WINDOW)) };
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
      rows.push({ id, goal: goalOf(id), trim: LOUDNESS[id] ?? 1, ...measure(await render(play)) });
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
