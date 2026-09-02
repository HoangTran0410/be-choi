// Screenshot every screen at phone and tablet sizes and flag page overflow or JS errors.
// Usage: npm run build && node scripts/screenshot.mjs [gameId ...]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4173, host: '127.0.0.1' }, logLevel: 'silent' });
const base = (process.env.BASE_URL ?? server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
const only = process.argv.slice(2);
const GAMES = ['bubbles', 'shapes', 'colors', 'sizes', 'shadows', 'piano', 'paint', 'peekaboo', 'feed', 'wash', 'count', 'memory'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone-land', width: 844, height: 390 },
  { name: 'tablet', width: 1024, height: 768 },
];

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch();
const problems = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${vp.name}: pageerror ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${vp.name}: console ${m.text()}`);
  });

  const routes = [['home', '#/'], ...GAMES.filter((g) => !only.length || only.includes(g)).map((g) => [g, `#/g/${g}`])];
  for (const [name, hash] of routes) {
    await page.goto(`${base}/${hash}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const box = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: innerWidth,
      sh: document.documentElement.scrollHeight,
      ih: innerHeight,
    }));
    if (box.sw > box.iw || box.sh > box.ih + 1) problems.push(`${vp.name}/${name}: overflow ${JSON.stringify(box)}`);
    await page.screenshot({ path: `screenshots/${name}-${vp.name}.png` });
  }
  await context.close();
}

await browser.close();
await server.close();
if (problems.length) {
  console.log(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`OK: screenshots written to ./screenshots`);
}
