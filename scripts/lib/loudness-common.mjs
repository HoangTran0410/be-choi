/**
 * What the two loudness scripts share: the house level, the A-weighting, and a
 * browser pointed at the dev server (the sounds are rendered by the real engine,
 * so there is no way to measure them without one).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

/**
 * House level, in A-weighted dBFS momentary. It was -22 while the old script measured each
 * sound in the first moments of a fresh context (some 10 dB low), so the app then really played
 * hotter than this; measured properly at -22, the music came out 4.4 dB and the synth 1.9 dB
 * quieter than the app had been, and it was heard as too quiet. -19 brings it back, and the
 * master limiter now keeps it from clipping as the old levels did.
 */
export const TARGET_DB = -19;

/**
 * A-weighting as three biquads: a double pole at 20.6 Hz, single poles at 107.7 and
 * 737.9 Hz (one biquad at their geometric mean, with the Q that puts the two real
 * poles back where they belong), a double pole at 12194 Hz, and the four zeros at
 * DC that the highpasses bring with them. `A_GAIN` is the standard +2.0 dB
 * normalisation, which puts 1 kHz at unity so the numbers stay on the same scale as
 * the flat ones they replace.
 */
export const A_WEIGHT = [
  ['highpass', 20.6, 0.5],
  ['highpass', 281.9, 0.3334],
  ['lowpass', 12194, 0.5],
];
export const A_GAIN = 1.2589;

/**
 * Sounds meant to sit off the house level. A UI click as loud as a lion is not
 * levelling, it is nagging; a reward no louder than a click is not a reward.
 * Everything absent from here is levelled flat.
 */
export const INTENT_DB = {
  // A click is a click: it should be heard without ever being the loudest thing
  // in the room. Now that it has some body it can reach this and stay there.
  tick: -7,
  pop: -3,
  // Like the tick, a woodblock is heard by its attack, not by its energy.
  'drum:wood': -3,
  'inst:castanets': -3,
  // Held notes sound softer than struck ones at the same one-note level, because a tune of
  // them never lets go: in the band they sat 4-5 dB under the piano and the bell.
  'note:sax': 2,
  'note:trumpet': 2,
  jingle: 2,
  'fx:cheer': 2,
  // Bright, thin sounds (birds, squeaks, a kettle, a triangle) are sharpest exactly where a
  // tablet speaker and a small child's ear are most sensitive (2-5 kHz). At the house level
  // the audit calls them harsh; a few dB under it they still carry.
  'fx:chirp': -3,
  'fx:penguin': -3,
  'fx:squeak': -3,
  'fx:cluck': -3,
  'fx:parrot': -3,
  // A frog's croak is all attack: at the house level its peak reaches the ceiling.
  'fx:frog': -1.5,
  'drum:triangle': -3,
  'file:sounds/bird.m4a': -3,
  'file:sfx/chirp-0.m4a': -3,
  'file:sounds/kettle.m4a': -3,
  'file:sounds/kiss.m4a': -3,
};

/**
 * The balance the app had before the levelling of 2026-10-20, kept on purpose: each synth sound's
 * level relative to the house level, as measured (properly, by loudness-audit) on commit a2283ff.
 * Levelling every sound to one meter reading took that balance apart (the bass and the horns came
 * up 2.5-5 dB, piano, xylophone, guitar, the hats and shakers went down 2-5 dB), and the band was
 * heard as heavy and muffled, the kick smothering the rest. Here it is again, now without clipping.
 */
const BY_EAR_MEASURED_DB = {
  'pop': 1.1,
  'puff': -0.7,
  'note:trumpet': -2.9,
  'drum:hat': 3.0,
  'drum:ride': 1.1,
  'inst:marimba': 0.1,
  'inst:harp': -2.1,
  'inst:harmonica': -3.3,
  'ding': 0.6,
  'note:piano': 2.7,
  'note:violin': -2.8,
  'drum:tom': 2.9,
  'drum:triangle': 1.3,
  'inst:vibraphone': -0.9,
  'inst:ukulele': 0.8,
  'inst:panflute': -3.2,
  'boing': 3.2,
  'note:xylo': 3.2,
  'note:sax': -2.8,
  'drum:clap': 0.5,
  'drum:crash': -0.3,
  'inst:steelpan': 0.5,
  'inst:banjo': 1.9,
  'inst:maracas': 0.3,
  'chomp': -0.7,
  'note:bell': 1.6,
  'note:bass': -2.5,
  'drum:cowbell': 2.9,
  'inst:handpan': -1.2,
  'inst:kalimba': 0.4,
  'inst:tambourine': 2.0,
  'tick': -1.9,
  'note:guitar': 1.9,
  'drum:kick': -0.3,
  'drum:shaker': 2.8,
  'inst:djembe': 1.8,
  'inst:organ': -3.7,
  'inst:chimes': -1.6,
  'jingle': -0.4,
  'note:flute': -2.8,
  'drum:snare': 0.4,
  'drum:wood': 2.1,
  'inst:gong': -1.7,
  'inst:accordion': -3.3,
  'inst:castanets': -0.1,
};
/**
 * The old levels sat right against full scale (the old chain let them clip). 1.5 dB under them,
 * the same balance stays clear of the master's safety limiter, which would otherwise duck the band.
 */
const BY_EAR_HEADROOM_DB = -1.5;
export const BY_EAR_DB = Object.fromEntries(
  Object.entries(BY_EAR_MEASURED_DB)
    // The triangle keeps its place under the house level (INTENT_DB): at its old level it stings.
    .filter(([id]) => id !== 'drum:triangle')
    .map(([id, db]) => [id, db + BY_EAR_HEADROOM_DB]),
);

/** How far one sound may be pushed. Beyond this a sound needs fixing, not trimming. */
export const TRIM_MIN = 0.05;
export const TRIM_MAX = 12;
/** A trimmed sound must still leave headroom before the compressor. */
export const PEAK_CEILING = 0.98;
/** Measure-and-correct rounds, and how much of each correction to apply. */
export const PASSES = 8;
export const DAMPING = 0.7;

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Start the dev server, open a page on it, hand the page to `fn`, and clean up.
 * The port is one the OS has just said is free (`preferred` is ignored): several checkouts
 * of this repo run dev servers at once, and a fixed port would quietly measure another
 * checkout's code.
 */
export async function withPage(preferred, fn) {
  const port = await freePort();
  const server = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  const stopServer = () => server.kill('SIGTERM');
  process.on('exit', stopServer);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (let tries = 0; ; tries++) {
      try {
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 4000 });
        break;
      } catch (err) {
        if (tries >= 20) throw err;
        await new Promise((r) => setTimeout(r, 700));
      }
    }
    return await fn(page);
  } finally {
    await browser.close();
    stopServer();
  }
}
