// Audit the touch feedback of every museum instrument for real: for each of the 29, touch it
// with a mouse and with a faked finger (CDP Input.dispatchTouchEvent), and check that within a
// few frames something moves (a Web Animation, a pressed class, a ring/note sprite, a string
// that vibrates). A frame taken in the middle of the animation goes to OUT.
// Usage: node scripts/museum-fx.mjs [id ...]    env: OUT=dir  CPU=4 (throttle)  STRESS=1 (fast tapping, frame gaps)
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 4179, host: '127.0.0.1' }, logLevel: 'silent' });
await server.listen();
const base = 'http://127.0.0.1:4179';
const OUT = process.env.OUT ?? join(tmpdir(), 'museum-fx');
const CPU = Number(process.env.CPU ?? 1);
const STRESS = !!process.env.STRESS;
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const IDS = ['drumkit','djembe','marimba','vibraphone','xylo','bell','steelpan','handpan','gong','guitar','ukulele','banjo','bass','harp','kalimba','violin','piano','organ','accordion','flute','panflute','trumpet','sax','harmonica','maracas','tambourine','castanets','chimes','rack'];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`console ${m.text()}`));
const cdp = await context.newCDPSession(page);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

// what is moving inside the instrument right now
const probe = () =>
  page.evaluate(() => {
    const root = document.querySelector('.inst');
    if (!root) return null;
    const anims = document.getAnimations().filter((a) => a.effect?.target && root.contains(a.effect.target) && a.playState === 'running').length;
    const down = root.querySelectorAll('.down,.blowing').length;
    const sprites = root.querySelectorAll('.fx > *, .fx-glow > *, .fx-trail > *, .fx-bow > *, .fx-burst > *').length;
    const sig = [...root.querySelectorAll('svg path')].map((p) => p.getAttribute('d')).join('|');
    return { anims, down, sprites, sig: sig.length + ':' + sig.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) };
  });
const score = (a) => (a ? a.anims + a.down + a.sprites : 0);
// wait until the previous touch has fully faded, so the next one is measured alone
async function quiet() {
  for (let i = 0; i < 40; i++) {
    const a = await probe();
    if (a && a.anims === 0 && a.down === 0) return;
    await page.waitForTimeout(100);
  }
}

async function touchAt(x, y, holdMs, mode) {
  if (mode === 'mouse') {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(holdMs);
    await page.mouse.up();
  } else {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}

const results = [];
try {
for (const id of IDS) {
  if (only.length && !only.includes(id)) continue;
  await page.goto(`${base}/?r=${id}#/g/museum`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.locator(`.mu-tile[data-id="${id}"]`).first().tap();
  await page.waitForSelector('.inst svg', { timeout: 5000 });
  await page.waitForTimeout(700);
  // touch points: the centre of up to 3 distinct zones, else the middle of the instrument
  const pts = await page.evaluate(() => {
    const root = document.querySelector('.inst');
    const rb = root.getBoundingClientRect();
    const zs = [...root.querySelectorAll('[data-z]')]
      .filter((e) => !/^string|^chord/.test(e.dataset.z))
      .map((e) => ({ id: e.dataset.z, r: e.getBoundingClientRect() }))
      .filter((z) => z.r.width > 6 && z.r.height > 6 && z.r.left >= rb.left - 1 && z.r.right <= rb.right + 1);
    const pick = [zs[Math.floor(zs.length * 0.25)], zs[Math.floor(zs.length * 0.5)], zs[Math.floor(zs.length * 0.75)]].filter(Boolean);
    const out = pick.map((z) => ({ id: z.id, x: z.r.left + z.r.width / 2, y: z.r.top + z.r.height / 2 }));
    return out.length ? out : [{ id: '(centre)', x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 }];
  });
  const row = { id, zones: pts.map((p) => p.id).join(' ') };
  for (const mode of ['mouse', 'touch']) {
    let best = 0;
    let first = null;
    for (const p of pts) {
      await quiet();
      const b0 = await probe();
      const before = score(b0);
      const hold = id === 'flute' || id === 'trumpet' || id === 'sax' ? 700 : 260;
      const act = touchAt(p.x, p.y, hold, mode);
      await page.waitForTimeout(70);
      const mid = await probe();
      await page.waitForTimeout(30);
      const mid2 = await probe();
      if (mode === 'touch' && p === pts[0]) await page.screenshot({ path: `${OUT}/${id}.png` });
      await act;
      // strings: their path shape changes from frame to frame while they vibrate
      const s = score(mid) - before + (mid.sig !== b0.sig || mid.sig !== mid2.sig ? 1 : 0);
      if (s > best) best = s;
      if (first === null) first = mid;
      await page.waitForTimeout(250);
    }
    row[mode] = best;
    row[mode + 'Probe'] = JSON.stringify(first);
  }
  results.push(row);
  console.log(row.id.padEnd(11), 'mouse', String(row.mouse).padStart(3), 'touch', String(row.touch).padStart(3), row.zones.slice(0, 36).padEnd(36), row.touchProbe);
  if (!row.mouse || !row.touch) problems.push(`${id}: no visible reaction (mouse ${row.mouse}, touch ${row.touch})`);

  if (STRESS) {
    // frantic tapping for 2 s, measure frame gaps and leftover DOM
    await page.evaluate(() => {
      window.__gaps = [];
      let last = performance.now();
      const f = (t) => {
        window.__gaps.push(t - last);
        last = t;
        window.__raf = requestAnimationFrame(f);
      };
      window.__raf = requestAnimationFrame(f);
    });
    const t0 = Date.now();
    let n = 0;
    let peak = 0;
    while (Date.now() - t0 < 2000) {
      const p = pts[n++ % pts.length];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(25);
      if (n % 10 === 0) peak = Math.max(peak, await page.evaluate(() => document.querySelectorAll('.inst svg *').length));
    }
    const st = await page.evaluate(() => {
      cancelAnimationFrame(window.__raf);
      const g = window.__gaps.slice(2).sort((a, b) => a - b);
      return { frames: g.length, p50: Math.round(g[g.length >> 1]), p95: Math.round(g[Math.floor(g.length * 0.95)]), max: Math.round(g[g.length - 1]) };
    });
    await page.waitForTimeout(2500);
    const left = await page.evaluate(() => document.querySelectorAll('.inst svg *').length);
    console.log('   stress taps', n, JSON.stringify(st), 'svg nodes peak', peak, 'after settle', left);
    if (st.p95 > 70 * Math.max(1, CPU / 2)) problems.push(`${id}: stress p95 frame gap ${st.p95} ms`);
  }
}
} finally {
  await browser.close();
  await server.close();
}
if (problems.length) {
  console.error('PROBLEMS\n' + problems.join('\n'));
  process.exitCode = 1;
} else console.log('museum-fx: all instruments react to mouse and touch');
