// Touch a museum instrument with a real (CDP) finger on the dev server and save frames 60 ms and
// 200 ms after the touch, plus what moved. Usage: node scripts/museum-anim.mjs [id ...]
// env: URL=http://localhost:5190  OUT=dir  LITE=1 (force perf.low / data-lite)
import { mkdirSync } from 'node:fs';
import { chromium, webkit } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5190';
const OUT = process.env.OUT ?? 'screenshots/museum-anim';
mkdirSync(OUT, { recursive: true });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['guitar', 'drumkit', 'xylo', 'maracas', 'gong', 'piano'];
const STAMPS = ['marimba', 'harp', 'gong', 'piano', 'djembe', 'guitar'];

const WK = !!process.env.WK; // WK=1: WebKit (Safari engine), tap instead of CDP touch
const browser = await (WK ? webkit : chromium).launch(WK && process.env.WK_EXE ? { executablePath: process.env.WK_EXE } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: process.env.REDUCE ? 'reduce' : 'no-preference' });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
await page.addInitScript(
  ({ stamps, lite }) => {
    localStorage.setItem('be-choi:museum', JSON.stringify({ v: 1, stamps, band: [null, null, null, null], track: 'sun', stars: stamps.length }));
    if (lite) localStorage.setItem('bechoi.lowperf', '1');
  },
  { stamps: STAMPS, lite: !!process.env.LITE },
);
const cdp = WK ? null : await context.newCDPSession(page);
const probe = () =>
  page.evaluate(() => {
    const root = document.querySelector('.inst');
    const anims = document.getAnimations().filter((a) => a.effect?.target && root.contains(a.effect.target) && a.playState === 'running').length;
    const moved = [...root.querySelectorAll('.z, svg > g, svg')].filter((e) => {
      const t = getComputedStyle(e).transform;
      return t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)';
    }).length;
    const down = root.querySelectorAll('.down,.blowing').length;
    const vib = [...root.querySelectorAll('path.str')].filter((p) => !/^M[\d. -]+L[\d. -]+$/.test(p.getAttribute('d') ?? '')).length;
    return { anims, moved, down, vib, lite: document.documentElement.hasAttribute('data-lite') };
  });

for (const id of ids) {
  await page.goto(`${URL}/?r=${Math.random()}#/g/museum`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.mu-albumbtn').tap();
  await page.waitForTimeout(400);
  await page.locator(`.mu-album .mu-tile[data-id="${id}"]`).first().tap();
  await page.waitForTimeout(700);
  const pt = await page.evaluate(() => {
    const root = document.querySelector('.inst');
    const zs = [...root.querySelectorAll('[data-z]')].filter((e) => !/^chord/.test(e.dataset.z)).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 8 && r.height > 8);
    const r = zs[Math.floor(zs.length / 2)] ?? root.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.screenshot({ path: `${OUT}/${id}-0.png` });
  if (WK) page.touchscreen.tap(pt.x, pt.y).catch(() => {});
  else await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, id: 1 }] });
  await page.waitForTimeout(60);
  const a = await probe();
  await page.screenshot({ path: `${OUT}/${id}-60.png` });
  await page.waitForTimeout(140);
  const b = await probe();
  await page.screenshot({ path: `${OUT}/${id}-200.png` });
  if (!WK) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log(id, '60ms', JSON.stringify(a), '200ms', JSON.stringify(b));
  await page.waitForTimeout(500);
}
if (problems.length) console.log(problems.join('\n'));
await browser.close();
