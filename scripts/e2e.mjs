// Plays every game for real in headless Chromium (touch + mouse pointer events) and
// reports JS errors or games that do not react. Usage: npm run build && node scripts/e2e.mjs
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4174, host: '127.0.0.1' }, logLevel: 'silent' });
const base = (server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:4174').replace(/\/$/, '');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});

const center = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const drag = async (from, to) => {
  const a = await center(from);
  const b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await page.mouse.up();
  await page.waitForTimeout(120);
};
const tap = async (locator) => {
  const c = await center(locator);
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(80);
};
const open = async (id) => {
  await page.goto(`${base}/#/g/${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
};
const check = (name, ok, detail = '') => {
  if (!ok) problems.push(`${name}: ${detail}`);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

// ---- shapes: drag each piece to its hole, expect a full round + celebration ----
await open('shapes');
for (let i = 0; i < 3; i++) {
  const piece = page.locator('.piece:not(.placed)').first();
  const shape = await piece.getAttribute('data-shape');
  await drag(piece, page.locator(`.hole[data-shape="${shape}"]`));
}
check('shapes: all holes filled', (await page.locator('.hole.filled').count()) === 3);
check('shapes: confetti shown', (await page.locator('canvas.confetti').count()) === 1);
await page.waitForTimeout(2200);
check('shapes: next round dealt', (await page.locator('.piece:not(.placed)').count()) === 3);

// ---- bubbles: tap a bubble ----
await open('bubbles');
await page.waitForTimeout(800);
const bubble = page.locator('.bubble').first();
await tap(bubble);
check('bubbles: tapped bubble pops', (await page.locator('.bubble.anim-pop').count()) >= 1);

// ---- colors ----
await open('colors');
const ballCount = await page.locator('.colors-ball').count();
for (let i = 0; i < ballCount; i++) {
  const ball = page.locator('.colors-ball:not(.placed)').first();
  const color = await ball.getAttribute('data-color');
  await drag(ball, page.locator(`.colors-basket[data-color="${color}"]`));
}
check('colors: all balls sorted', (await page.locator('.colors-ball.placed').count()) === ballCount, `${await page.locator('.colors-ball.placed').count()}/${ballCount}`);
check('colors: confetti shown', (await page.locator('canvas.confetti').count()) === 1);

// ---- sizes ----
await open('sizes');
for (let i = 0; i < 4; i++) {
  const piece = page.locator('.sizes-piece:not(.placed)').first();
  const big = await piece.evaluate((el) => el.classList.contains('sizes-piece-big'));
  await drag(piece, page.locator(big ? '.sizes-box-big' : '.sizes-box-small'));
}
check('sizes: all pieces placed', (await page.locator('.sizes-piece.placed').count()) === 4);

// ---- shadows ----
await open('shadows');
for (let i = 0; i < 3; i++) {
  const piece = page.locator('.shadows-piece:not(.placed)').first();
  const emoji = await piece.getAttribute('data-emoji');
  await drag(piece, page.locator(`.shadows-shadow[data-emoji="${emoji}"]`));
}
check('shadows: all revealed', (await page.locator('.shadows-shadow.revealed').count()) === 3);

// ---- piano ----
await open('piano');
const key = page.locator('.piano-key').nth(2);
const kc = await center(key);
await page.mouse.move(kc.x, kc.y);
await page.mouse.down();
check('piano: key pressed while held', await key.evaluate((el) => el.classList.contains('pressed')));
await page.mouse.up();
await page.waitForTimeout(50);
check('piano: key released', !(await key.evaluate((el) => el.classList.contains('pressed'))));

// ---- paint: stroke + stamp ----
await open('paint');
const canvas = page.locator('.paint-canvas');
const cb = await canvas.boundingBox();
await page.mouse.move(cb.x + 40, cb.y + 40);
await page.mouse.down();
await page.mouse.move(cb.x + 200, cb.y + 200, { steps: 10 });
await page.mouse.up();
await tap(page.locator('.paint-stamp').first());
await page.mouse.click(cb.x + 100, cb.y + 300);
const painted = await canvas.evaluate((c) => {
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4 * 50) if (d[i] > 0) n++;
  return n;
});
check('paint: canvas has paint', painted > 0, `${painted} sampled px`);

// ---- peekaboo ----
await open('peekaboo');
await tap(page.locator('.peekaboo-spot').first());
check('peekaboo: spot opens', await page.locator('.peekaboo-spot').first().evaluate((el) => el.classList.contains('open')));

// ---- feed: try foods until the animal changes ----
await open('feed');
const firstAnimal = await page.locator('.feed-animal').textContent();
for (let i = 0; i < 3; i++) {
  const food = page.locator('.feed-food').nth(i);
  if ((await food.count()) === 0) break;
  await drag(food, page.locator('.feed-mouth'));
  await page.waitForTimeout(1100);
  if ((await page.locator('.feed-animal').textContent()) !== firstAnimal) break;
}
check('feed: correct food moves to next animal', (await page.locator('.feed-animal').textContent()) !== firstAnimal);

// ---- wash: rub the whole subject ----
await open('wash');
const firstItem = await page.locator('.wash-item').textContent();
const sb = await page.locator('.wash-subject').boundingBox();
for (let pass = 0; pass < 2 && (await page.locator('.wash-item').textContent()) === firstItem; pass++) {
  for (let y = sb.y + 10; y < sb.y + sb.height; y += 18) {
    await page.mouse.move(sb.x + 5, y);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width - 5, y, { steps: 12 });
    await page.mouse.up();
  }
  await page.waitForTimeout(400);
}
await page.waitForTimeout(2200);
check('wash: subject cleaned and next item shown', (await page.locator('.wash-item').textContent()) !== firstItem);

// ---- count ----
await open('count');
const fruits = await page.locator('.count-fruit').count();
for (let i = 0; i < fruits; i++) await tap(page.locator('.count-fruit').nth(i));
check('count: total shown', (await page.locator('.count-total').count()) === 1);
check('count: badges numbered', (await page.locator('.count-badge').allTextContents()).join(',') === Array.from({ length: fruits }, (_, i) => String(i + 1)).join(','));

// ---- memory: flip matching pairs ----
await open('memory');
const backs = await page.locator('.memory-card-back').allTextContents();
const seen = new Map();
for (let i = 0; i < backs.length; i++) {
  const j = seen.get(backs[i]);
  if (j === undefined) seen.set(backs[i], i);
  else {
    await tap(page.locator('.memory-card').nth(j));
    await tap(page.locator('.memory-card').nth(i));
    await page.waitForTimeout(150);
  }
}
check('memory: all matched', (await page.locator('.memory-card.matched').count()) === backs.length);

// ---- home + parent gate ----
await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
const parent = page.locator('.home .parent');
const pc = await center(parent);
await page.mouse.move(pc.x, pc.y);
await page.mouse.down();
await page.waitForTimeout(1700);
await page.mouse.up();
check('home: parent panel opens after hold', (await page.locator('.panel').count()) === 1);
check('home: service worker registered', await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration())));

await browser.close();
await server.close();
if (problems.length) {
  console.log('\nPROBLEMS:\n' + problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nAll e2e checks passed.');
}
