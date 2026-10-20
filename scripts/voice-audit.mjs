// Records what each game SAYS (Web Speech) and PLAYS (Web Audio / <audio>) in its first seconds with no
// touch, and then after a few taps. Needs no sound card: speechSynthesis is replaced by a stub that logs.
//
// Usage: node scripts/voice-audit.mjs [gameId ...]
//   IDLE=14000   how long to wait without touching (ms)
//   TEXTS=1      print every spoken line                BASE_URL=http://...  use a running server
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const IDLE = Number(process.env.IDLE ?? 14000);
let server = null;
let base = process.env.BASE_URL;
if (!base) {
  server = await createServer({ server: { port: 4191, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
  await server.listen();
  base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:4191/';
}
base = base.replace(/\/$/, '');

const registrySrc = readFileSync(new URL('../src/app/registry.ts', import.meta.url), 'utf8');
const registry = [...registrySrc.matchAll(/load: \(\) => import\('\.\.\/games\/([a-z0-9-]+)\/index'\)/g)].map((m) => m[1]);
const only = process.argv.slice(2);
const games = registry.filter((g) => !only.length || only.includes(g));
const introOf = (g) => {
  try {
    return (
      /intro:\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(readFileSync(new URL(`../src/games/${g}/meta.ts`, import.meta.url), 'utf8'))?.[2] ?? ''
    );
  } catch {
    return '';
  }
};

const initScript = () => {
  const t0 = performance.now();
  const log = { speech: [], sound: [] };
  window.__log = log;
  const now = () => Math.round(performance.now() - t0);
  const timers = new Set();
  const fake = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [{ lang: 'vi-VN', name: 'Stub', localService: true, default: true, voiceURI: 'stub' }],
    addEventListener() {},
    removeEventListener() {},
    cancel() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      fake.speaking = false;
    },
    speak(u) {
      if (!u.text) return;
      log.speech.push({ t: now(), text: u.text, rate: u.rate });
      fake.speaking = true;
      const t = setTimeout(
        () => {
          timers.delete(t);
          fake.speaking = timers.size > 0;
          u.onend?.(new Event('end'));
        },
        300 + (u.text.length * 90) / (u.rate || 1),
      );
      timers.add(t);
    },
    pause() {},
    resume() {},
  };
  // A real utterance rejects a fake voice object; let it hold anything.
  Object.defineProperty(SpeechSynthesisUtterance.prototype, 'voice', {
    get() {
      return this._v ?? null;
    },
    set(v) {
      this._v = v;
    },
    configurable: true,
  });
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  for (const proto of [window.AudioScheduledSourceNode?.prototype, window.AudioBufferSourceNode?.prototype].filter(Boolean)) {
    const orig = proto.start;
    proto.start = function (...a) {
      log.sound.push({ t: now() });
      return orig.apply(this, a);
    };
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    log.sound.push({ t: now(), media: true });
    return play.apply(this, a);
  };
  window.__tap = new Set();
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (this instanceof Element && ['pointerdown', 'click', 'touchstart', 'mousedown', 'pointerup'].includes(type)) window.__tap.add(this);
    return add.call(this, type, ...rest);
  };
};

const targets = () => {
  const stage = document.querySelector('.stage');
  if (!stage) return [];
  const sr = stage.getBoundingClientRect();
  const els = new Set(window.__tap);
  for (const e of stage.querySelectorAll('button, [role="button"], a[href]')) els.add(e);
  const list = [];
  for (const el of els) {
    if (el === stage || !stage.contains(el)) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (r.width < 10 || r.height < 10 || cx < sr.left || cx > sr.right || cy < sr.top || cy > sr.bottom) continue;
    if (getComputedStyle(el).pointerEvents === 'none' || getComputedStyle(el).visibility === 'hidden') continue;
    const top = document.elementFromPoint(cx, cy);
    if (!top || !(el === top || el.contains(top) || top.contains(el))) continue;
    list.push({ x: cx, y: cy, area: r.width * r.height, d: (el.className?.toString?.() || el.tagName).slice(0, 30) });
  }
  // Spread out: biggest first, but skip near-duplicates.
  list.sort((a, b) => b.area - a.area);
  const chosen = [];
  for (const c of list) {
    if (chosen.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 40)) chosen.push(c);
    if (chosen.length >= 6) break;
  }
  return chosen;
};

const results = [];
const LAUNCH_ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
let browser = await chromium.launch({ args: LAUNCH_ARGS });

let page;
const errors = [];
/** (Re)start the single page; also used when a game takes the browser down. */
async function fresh() {
  if (!page) {
    // first time: the browser is already up
  } else {
    await browser.close().catch(() => {});
    browser = await chromium.launch({ args: LAUNCH_ARGS });
  }
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    permissions: ['microphone', 'camera'],
  });
  await context.addInitScript(initScript);
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
}

async function audit(game) {
  errors.length = 0;
  const row = { game, intro: introOf(game), errors: [] };
  try {
    await page.goto('about:blank');
    await page.goto(`${base}/#/g/${game}`, { waitUntil: 'load' });
    await page.waitForSelector('.stage', { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('.sticker-overlay').forEach((e) => e.remove()));
    await page.waitForTimeout(IDLE);
    const idle = await page.evaluate(() => JSON.parse(JSON.stringify(window.__log)));
    row.idleSpeech = idle.speech;
    row.idleSounds = idle.sound.length;
    // Taps
    const picks = await page.evaluate(targets);
    const tapAt = [...picks.map((p) => ({ x: p.x, y: p.y }))];
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.3, 0.4],
      [0.7, 0.6],
    ])
      tapAt.push({ x: 390 * fx, y: 60 + (844 - 60) * fy });
    row.taps = [];
    for (const p of tapAt.slice(0, 8)) {
      const before = await page.evaluate(() => ({ s: window.__log.speech.length, a: window.__log.sound.length }));
      // mouse.click gives pointerdown + click like a real tap; touchscreen.tap alone sends no click.
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(1800);
      const after = await page.evaluate(() => ({ s: window.__log.speech.slice(), a: window.__log.sound.length }));
      row.taps.push({
        x: Math.round(p.x),
        y: Math.round(p.y),
        said: after.s.slice(before.s).map((u) => u.text),
        sounds: after.a - before.a,
      });
    }
  } catch (e) {
    row.fail = String(e.message).split('\n')[0];
    if (/closed|crash/i.test(row.fail)) await fresh();
  }
  row.errors = [...errors];
  results.push(row);
}

try {
  await fresh();
  for (const g of games) await audit(g);
} finally {
  await browser.close();
  await server?.close();
}

results.sort((a, b) => games.indexOf(a.game) - games.indexOf(b.game));
const pad = (s, n) => String(s).padEnd(n);
console.log(`Idle ${IDLE / 1000}s with no touch, then up to 8 taps (1.8 s apart). Title = the shell reading meta.intro.`);
console.log(
  [
    pad('game', 11),
    pad('1st say(s)', 10),
    pad('idle lines', 10),
    pad('idle snd', 8),
    pad('taps', 5),
    pad('tap says', 8),
    pad('tap snd', 7),
    'note',
  ].join(' '),
);
for (const r of results) {
  if (r.fail) {
    console.log(`${pad(r.game, 11)} FAILED ${r.fail}`);
    continue;
  }
  const own = r.idleSpeech.filter((u) => u.text !== r.intro);
  const first = own[0] ? (own[0].t / 1000).toFixed(1) : '-';
  const later = own.filter((u) => u.t > 9000).length;
  const tapSay = r.taps.filter((t) => t.said.length).length;
  const tapSnd = r.taps.filter((t) => t.sounds > 0).length;
  const notes = [];
  if (!own.length) notes.push('only the shell title');
  if (!later) notes.push('no reminder in idle');
  if (!tapSay && !tapSnd) notes.push('TAPS SILENT');
  else if (!tapSay) notes.push('taps: sound only');
  if (r.errors.length) notes.push('errors ' + r.errors.length);
  console.log(
    [
      pad(r.game, 11),
      pad(first, 10),
      pad(own.length + (later ? ` (${later} late)` : ''), 10),
      pad(r.idleSounds, 8),
      pad(r.taps.length, 5),
      pad(`${tapSay}/${r.taps.length}`, 8),
      pad(`${tapSnd}/${r.taps.length}`, 7),
      notes.join('; '),
    ].join(' '),
  );
}
if (process.env.TEXTS) {
  for (const r of results) {
    if (r.fail) continue;
    console.log(`\n[${r.game}] intro="${r.intro}"`);
    for (const u of r.idleSpeech) console.log(`  idle ${(u.t / 1000).toFixed(1)}s ${u.text}`);
    r.taps.forEach((t, i) => console.log(`  tap${i} (${t.x},${t.y}) snd=${t.sounds} said=${JSON.stringify(t.said)}`));
  }
}
