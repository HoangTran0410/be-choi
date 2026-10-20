// Draw every instrument simulation (all timbres, drums and world instruments) at a
// phone-portrait and a phone-landscape playfield and save one PNG each, so a person
// can look at them. Usage: node scripts/instruments.mjs [kind ...]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 4177, host: '127.0.0.1' }, logLevel: 'silent' });
await server.listen();
const base = 'http://127.0.0.1:4177';
const only = process.argv.slice(2);
const OUT = process.env.OUT ?? 'screenshots/instruments';
mkdirSync(OUT, { recursive: true });

const FIELDS = [
  { name: 'portrait', w: 370, h: 620 },
  { name: 'landscape', w: 660, h: 290 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 660 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const kinds = await page.evaluate(async () => {
  const { ALL_KINDS } = await import('/src/games/museum/instruments/index.ts');
  return [...ALL_KINDS];
});

for (const f of FIELDS) {
  for (const kind of kinds) {
    if (only.length && !only.includes(kind)) continue;
    await page.evaluate(
      async ({ kind, w, h }) => {
        document.getElementById('gallery')?.remove();
        const { createInstrument } = await import('/src/games/museum/instruments/index.ts');
        const box = document.createElement('div');
        box.id = 'gallery';
        box.style.cssText = `position:fixed;left:10px;top:10px;width:${w}px;height:${h}px;z-index:99999;background:#fff;overflow:hidden`;
        document.body.append(box);
        const noop = () => undefined;
        const ctx = {
          audio: { note: noop, drum: noop, inst: () => null },
          onCleanup: noop,
          hint: { touch: noop },
        };
        const inst = createInstrument(kind, box, ctx, {});
        // show a pressed state on the first zone so the feedback is visible too
        const z = inst.board().zones.find((q) => q.role === 'play') ?? inst.board().zones[0];
        if (z) inst.hit(z.id, 0.9);
      },
      { kind, w: f.w, h: f.h },
    );
    await page.waitForTimeout(60);
    await page.locator('#gallery').screenshot({ path: `${OUT}/${kind}-${f.name}.png` });
  }
}
await browser.close();
await server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`wrote ${kinds.length * FIELDS.length} images to ${OUT}`);
