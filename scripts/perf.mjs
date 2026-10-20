// Performance sweep: opens every game from src/app/registry.ts under an iPad-like
// condition (Chromium, CPU throttled x4, 1024x768 touch) and ranks the worst ones.
// Usage: npm run build && npm run perf -- [--run=4] [--dsf=2] [--heap=a,b --idle=30] [--cpu=4] [--json=out.json] [gameId ...]
//   DEV=1 serves source through Vite dev (no build; numbers are less realistic).
//   --idle=30 is the second (seconds since the game opened) at which the JS heap is sampled again.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const only = args.filter((a) => !a.startsWith('--'));
const CPU = Number(opt('cpu', 4));
const RUN_MS = Number(opt('run', 4)) * 1000;
// Heap sampling is slow (waits until --idle seconds after opening): only for the games named in --heap=a,b.
const HEAP_AT_MS = Number(opt('idle', 30)) * 1000;
const HEAP_GAMES = opt('heap', '').split(',').filter(Boolean);
const JSON_OUT = opt('json', '');

const ids = [...readFileSync('src/app/registry.ts', 'utf8').matchAll(/import\('\.\.\/games\/([a-z0-9-]+)\/index'\)/g)].map((m) => m[1]);
const games = ids.filter((id) => !only.length || only.includes(id));

const server = process.env.DEV
  ? await (async () => {
      const s = await createServer({ server: { port: 4174, host: '127.0.0.1' }, logLevel: 'silent' });
      await s.listen();
      return s;
    })()
  : await preview({ preview: { port: 4174, host: '127.0.0.1' }, logLevel: 'silent' });
const base = (server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:4174').replace(/\/$/, '');

// Runs before any page script: frame sampler, long tasks, AudioNode counters.
const INIT = () => {
  const P = (window.__perf = { frames: [], long: [], sampling: false, nodes: 0, live: 0, maxLive: 0 });
  let last = 0;
  const tick = (t) => {
    if (P.sampling && last) P.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => {
      if (!P.sampling) return;
      for (const e of l.getEntries()) P.long.push(e.duration);
    }).observe({ entryTypes: ['longtask'] });
  } catch {}
  // Count nodes created and one-shot sources still running (start() called, 'ended' not yet fired).
  for (const name of ['BaseAudioContext']) {
    const C = window[name];
    if (!C) continue;
    const proto = C.prototype;
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (!/^create/.test(k) || typeof proto[k] !== 'function') continue;
      const orig = proto[k];
      proto[k] = function (...a) {
        const n = orig.apply(this, a);
        P.nodes++;
        if (n && typeof n.start === 'function' && !n.__w) {
          n.__w = 1;
          const st = n.start;
          let on = false;
          n.start = function (...b) {
            if (!on) {
              on = true;
              P.live++;
              P.maxLive = Math.max(P.maxLive, P.live);
              n.addEventListener('ended', () => P.live--);
            }
            return st.apply(this, b);
          };
        }
        return n;
      };
    }
  }
};

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const r1 = (n) => Math.round(n * 10) / 10;

/** Visible interactive things on the stage, as tap targets. */
function tapPlan(page) {
  return page.evaluate(() => {
    const out = [];
    const st = document.querySelector('.stage');
    if (!st) return out;
    const seen = new Set();
    const sel = 'button, [role=button], canvas, svg, [draggable], [class*=card], [class*=item], [class*=btn], [class*=piece], [class*=key], [class*=pad]';
    for (const el of st.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const x = Math.round(Math.min(Math.max(r.left + r.width / 2, 2), innerWidth - 2));
      const y = Math.round(Math.min(Math.max(r.top + r.height / 2, 2), innerHeight - 2));
      const key = `${x >> 4},${y >> 4}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y });
      if (out.length >= 40) break;
    }
    return out;
  });
}

async function measure(page, cdp, id) {
  const errors = [];
  const onErr = (e) => errors.push(e.message);
  page.on('pageerror', onErr);
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const P = window.__perf;
    P.sampling = false;
    P.nodes = 0;
    P.maxLive = 0;
  });

  // Open: set the hash (what a tile tap does) and wait until the stage has content.
  const openMs = await page.evaluate(
    (gid) =>
      new Promise((res) => {
        const t0 = performance.now();
        location.hash = `#/g/${gid}`;
        const poll = () => {
          const st = document.querySelector('.stage');
          if (st && st.childElementCount > 0) return res(performance.now() - t0);
          if (performance.now() - t0 > 20000) return res(-1);
          requestAnimationFrame(poll);
        };
        poll();
      }),
    id,
  );
  const t0 = Date.now();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const P = window.__perf;
    P.frames.length = 0;
    P.long.length = 0;
    P.sampling = true;
  });

  // First half: left alone (animations running by themselves); second half: touch taps and drags.
  await page.waitForTimeout(RUN_MS / 2);
  const targets = await tapPlan(page);
  const tEnd = Date.now() + RUN_MS / 2;
  let i = 0;
  while (Date.now() < tEnd) {
    const t = targets.length ? targets[i % targets.length] : { x: 512, y: 400 };
    try {
      if (i % 4 === 3) {
        const u = targets[(i + 3) % Math.max(targets.length, 1)] ?? { x: 700, y: 500 };
        await page.mouse.move(t.x, t.y);
        await page.mouse.down();
        for (let s = 1; s <= 8; s++) await page.mouse.move(t.x + ((u.x - t.x) * s) / 8, t.y + ((u.y - t.y) * s) / 8);
        await page.mouse.up();
      } else {
        await page.touchscreen.tap(t.x, t.y);
      }
    } catch {}
    i++;
    await page.waitForTimeout(120);
    if (i % 8 === 0) {
      const fresh = await tapPlan(page).catch(() => []);
      if (fresh.length) targets.splice(0, targets.length, ...fresh);
    }
  }
  const snap = await page.evaluate(() => {
    const P = window.__perf;
    P.sampling = false;
    return { frames: P.frames.slice(), long: P.long.slice(), nodes: P.nodes, maxLive: P.maxLive, dom: document.querySelectorAll('*').length };
  });
  const hashNow = await page.evaluate(() => location.hash);

  let heapA = 0;
  let heapB = 0;
  if (HEAP_GAMES.includes(id)) {
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576;
    };
    heapA = await heap();
    const remaining = HEAP_AT_MS - (Date.now() - t0);
    if (remaining > 0) await page.waitForTimeout(remaining);
    heapB = await heap();
  }
  const liveEnd = await page.evaluate(() => window.__perf.live);
  page.off('pageerror', onErr);

  const f = snap.frames;
  return {
    id,
    openMs: r1(openMs),
    frames: f.length,
    p50: r1(pct(f, 50)),
    p95: r1(pct(f, 95)),
    max: r1(Math.max(0, ...f)),
    over50: f.filter((x) => x > 50).length,
    long: snap.long.length,
    longSum: Math.round(snap.long.reduce((a, b) => a + b, 0)),
    dom: snap.dom,
    heapA: r1(heapA),
    heapB: r1(heapB),
    heapGrow: heapB ? r1(heapB - heapA) : null,
    nodes: snap.nodes,
    liveSrc: liveEnd,
    maxLiveSrc: snap.maxLive,
    left: hashNow !== `#/g/${id}`,
    errors: errors.length,
  };
}

// One browser, one page, reused for every game; always closed (also on errors / Ctrl-C).
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const results = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: Number(opt('dsf', 2)), hasTouch: true, isMobile: true, permissions: ['microphone', 'camera'] });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await cdp.send('HeapProfiler.enable');
  for (const id of games) {
    try {
      const r = await measure(page, cdp, id);
      results.push(r);
      console.error(`[${results.length}/${games.length}] ${id} p95=${r.p95}ms >50=${r.over50} long=${r.long} open=${r.openMs}ms`);
    } catch (e) {
      console.error(`FAIL ${id}: ${e.message}`);
      results.push({ id, fail: e.message });
    }
  }
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}

const ok = results.filter((r) => !r.fail);
// Badness score: frame time and main-thread blocking dominate; slow open and heap growth add.
const score = (r) => r.p95 / 16.7 + r.over50 * 0.5 + r.longSum / 200 + Math.max(0, r.openMs) / 500 + Math.max(0, r.heapGrow ?? 0) / 5;
ok.sort((a, b) => score(b) - score(a));
const pad = (v, n) => String(v).padStart(n);
console.log(`\nCPU x${CPU}, 1024x768 touch, run ${RUN_MS / 1000}s, heap (only --heap games) at ${HEAP_AT_MS / 1000}s, ${process.env.DEV ? 'vite dev' : 'production build'}`);
console.log('game          score   p50   p95   max >50 long longMs  open   dom heapMB  grow nodes live');
for (const r of ok) {
  console.log(
    `${r.id.padEnd(13)} ${pad(r1(score(r)), 5)} ${pad(r.p50, 5)} ${pad(r.p95, 5)} ${pad(r.max, 5)} ${pad(r.over50, 3)} ${pad(r.long, 4)} ${pad(r.longSum, 6)} ${pad(r.openMs, 5)} ${pad(r.dom, 5)} ${pad(r.heapB || '-', 6)} ${pad(r.heapGrow ?? '-', 5)} ${pad(r.nodes, 5)} ${pad(r.liveSrc, 3)}${r.left ? ' LEFT-GAME' : ''}${r.errors ? ` err${r.errors}` : ''}`,
  );
}
for (const r of results.filter((x) => x.fail)) console.log(`FAIL ${r.id}: ${r.fail}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(ok, null, 1));
