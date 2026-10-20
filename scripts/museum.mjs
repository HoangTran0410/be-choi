// Screenshot the museum game for real: the room, a few instrument tables (while playing
// them), the album, the orchestra room and a won stamp — phone portrait, phone landscape and
// tablet — and flag page overflow, JS errors and touch targets smaller than 72 px.
// Usage: node scripts/museum.mjs [table ...]     (OUT=dir to choose where the PNGs go)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 4178, host: '127.0.0.1' }, logLevel: 'silent' });
await server.listen();
const base = 'http://127.0.0.1:4178';
const OUT = process.env.OUT ?? 'screenshots/museum';
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone-land', width: 844, height: 390 },
  { name: 'tablet', width: 1024, height: 768 },
];
const TABLES = ['marimba', 'piano', 'guitar', 'drumkit', 'flute', 'violin', 'gong', 'harp', 'djembe', 'steelpan', 'accordion', 'maracas'];
const STAMPS = ['marimba', 'harp', 'gong', 'piano', 'djembe', 'guitar'];

const browser = await chromium.launch();
const problems = [];
let visit = 0;

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${vp.name}: pageerror ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${vp.name}: console ${m.text()}`));
  await page.addInitScript((stamps) => {
    if (!localStorage.getItem('be-choi:museum'))
      localStorage.setItem(
        'be-choi:museum',
        JSON.stringify({ v: 1, stamps, band: [null, null, null, null], track: 'sun', stars: stamps.length }),
      );
  }, STAMPS);

  const shot = async (name) => {
    await page.waitForTimeout(450);
    const box = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: innerWidth,
      sh: document.documentElement.scrollHeight,
      ih: innerHeight,
    }));
    if (box.sw > box.iw || box.sh > box.ih + 1) problems.push(`${vp.name}/${name}: page overflow ${JSON.stringify(box)}`);
    // every button should be at least 72 px each way
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('.mu button')]
        .filter((b) => b.offsetParent !== null && !b.closest('[hidden]'))
        .map((b) => ({ c: b.className, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }))
        .filter((b) => b.w < 71.5 || b.h < 71.5),
    );
    if (small.length) problems.push(`${vp.name}/${name}: buttons under 72px ${JSON.stringify(small.slice(0, 4))}`);
    await page.screenshot({ path: `${OUT}/${name}-${vp.name}.png` });
  };
  const home = async () => {
    await page.goto(`${base}/?r=${++visit}#/g/museum`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
  };

  await home();
  const roomScroll = await page.evaluate(() => {
    const r = document.querySelector('.mu-room');
    return r
      ? {
          scroll: r.classList.contains('scroll'),
          tile: getComputedStyle(r).getPropertyValue('--tile'),
          sh: r.scrollHeight,
          ch: r.clientHeight,
        }
      : null;
  });
  console.log(vp.name, 'room', JSON.stringify(roomScroll));
  if (!only.length || only.includes('room')) await shot('room');

  for (const id of TABLES) {
    if (only.length && !only.includes(id)) continue;
    await home();
    await page.locator(`.mu-tile[data-id="${id}"]`).first().tap();
    await page.waitForTimeout(500);
    // touch the instrument a few times so the playing state is in the picture
    const box = await page.locator('.inst').boundingBox();
    if (box) {
      const pts = [
        [0.3, 0.3],
        [0.5, 0.55],
        [0.7, 0.75],
      ];
      for (const [fx, fy] of pts) {
        await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(60);
      }
    }
    await shot(`table-${id}`);
  }

  if (!only.length || only.includes('album')) {
    await home();
    await page.locator('.mu-albumbtn').tap();
    await shot('album');
  }
  if (!only.length || only.includes('band')) {
    await home();
    await page.locator('.mu-door').tap();
    await page.waitForTimeout(900);
    await shot('band');
    await page.locator('.mu-slot').nth(2).tap();
    await page.waitForTimeout(300);
    await shot('band-picker');
  }
  await context.close();
}

await browser.close();
await server.close();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else console.log('museum: no overflow, no errors, no small buttons');
