// Opens EVERY game in src/app/registry.ts at many screen sizes and reports layout trouble:
//   cut      an element (button, label, text) that an overflow:hidden ancestor, the stage or the screen cuts off
//   hscroll  the page scrolls sideways / up-down when it should not
//   small    a tap target smaller than 56 px
//   overlap  two pieces of text drawn on top of each other
// An issue only counts if it is there in two samples 1.5 s apart, so things that merely float
// across the screen (bubbles, clouds, animals) are not reported. Output is a table on stdout.
//
// Usage: node scripts/overflow.mjs [gameId ...]
//   VP=390x844,1024x768   only these sizes (while developing use 390x844,844x390,1024x768)
//   DETAIL=0              table only                MAXD=6   detail lines per game and kind
//   BASE_URL=http://...   use a running server instead of starting the Vite dev server
//   JSON=1                also print the raw findings as JSON on the last line
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ALL_VIEWPORTS = [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
  [568, 320],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1366, 1024],
  [507, 1024], // iPad split view
];
const viewports = (process.env.VP ? process.env.VP.split(',').map((s) => s.split('x').map(Number)) : ALL_VIEWPORTS).map(([w, h]) => ({
  w,
  h,
}));
const MAXD = Number(process.env.MAXD ?? 6);
const MIN_TAP = 56;

let server = null;
let base = process.env.BASE_URL;
if (!base) {
  server = await createServer({ server: { port: 4190, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
  await server.listen();
  base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:4190/';
}
base = base.replace(/\/$/, '');

// The game ids come from the registry itself.
const registrySrc = readFileSync(new URL('../src/app/registry.ts', import.meta.url), 'utf8');
const registry = [...registrySrc.matchAll(/load: \(\) => import\('\.\.\/games\/([a-z0-9-]+)\/index'\)/g)].map((m) => m[1]);
const only = process.argv.slice(2);
const games = registry.filter((g) => !only.length || only.includes(g));

// Remember which elements get pointer/click listeners: those are the tap targets.
const initScript = () => {
  window.__tap = new Set();
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (
      this instanceof Element &&
      (type === 'pointerdown' || type === 'click' || type === 'touchstart' || type === 'mousedown' || type === 'pointerup')
    ) {
      window.__tap.add(this);
    }
    return orig.call(this, type, ...rest);
  };
};

// Runs in the page. Returns [{kind, key, msg}].
const probe = (MIN) => {
  const out = [];
  const stage = document.querySelector('.stage');
  if (!stage) return [{ kind: 'error', key: 'no-stage', msg: 'no .stage element' }];
  const iw = innerWidth;
  const ih = innerHeight;
  const sr = stage.getBoundingClientRect();
  const doc = document.documentElement;
  if (doc.scrollWidth > iw + 1)
    out.push({ kind: 'hscroll', key: 'doc-x', msg: `page scrolls sideways: scrollWidth ${doc.scrollWidth} > ${iw}` });
  if (doc.scrollHeight > ih + 1)
    out.push({ kind: 'hscroll', key: 'doc-y', msg: `page scrolls up/down: scrollHeight ${doc.scrollHeight} > ${ih}` });

  const descr = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
    if (cls) s += '.' + cls;
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18);
    if (t) s += ` "${t}"`;
    else if (el.getAttribute('aria-label')) s += ` [${el.getAttribute('aria-label').slice(0, 18)}]`;
    return s;
  };
  const visibleStyle = (el) => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
  };
  /** Size of the part of a rect still visible after the screen, the stage and overflow ancestors cut it. */
  const visibleRect = (el, r, scrollOk = false) => {
    let l = Math.max(r.left, 0, sr.left);
    let t = Math.max(r.top, 0, sr.top);
    let rr = Math.min(r.right, iw, sr.right);
    let b = Math.min(r.bottom, ih, sr.bottom);
    for (let p = el.parentElement; p && p !== stage && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        // A list that scrolls (overflow auto/scroll) is meant to hide what is further along.
        if (scrollOk && /auto|scroll/.test(cs.overflowX + cs.overflowY)) continue;
        if (cs.overflowX !== 'visible') {
          l = Math.max(l, pr.left);
          rr = Math.min(rr, pr.right);
        }
        if (cs.overflowY !== 'visible') {
          t = Math.max(t, pr.top);
          b = Math.min(b, pr.bottom);
        }
      }
    }
    return { w: Math.max(0, rr - l), h: Math.max(0, b - t) };
  };
  const hiddenByAncestor = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (!visibleStyle(p)) return true;
    }
    return false;
  };
  const hidesBack = (el) => {
    for (let p = el; p && p !== stage; p = p.parentElement) if (getComputedStyle(p).backfaceVisibility === 'hidden') return true;
    return false;
  };
  const isSkippedZone = (el) =>
    !!el.closest('.topbar, .sticker-overlay, .break-overlay, .parent-panel, .toast, .confetti, [data-overflow-ignore]');

  const interactive = new Set();
  for (const el of window.__tap) {
    if (el === stage || el === document.body || el === document.documentElement) continue;
    if (stage.contains(el) && getComputedStyle(el).pointerEvents !== 'none') interactive.add(el);
  }
  for (const el of stage.querySelectorAll('button, a[href], [role="button"], input, select, summary')) interactive.add(el);

  const seenCut = new Set();
  const cutCheck = (el, why) => {
    if (seenCut.has(el) || isSkippedZone(el) || hiddenByAncestor(el)) return;
    // Inside a list that scrolls, what is further along is simply not scrolled to yet.
    for (let p = el.parentElement; p && p !== stage; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/auto|scroll/.test(cs.overflowX + cs.overflowY) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1))
        return;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const v = visibleRect(el, r, true);
    const frac = (v.w * v.h) / (r.width * r.height);
    if (frac >= 0.92) return;
    seenCut.add(el);
    if (frac < 0.02) {
      if (why === 'tap')
        out.push({
          kind: 'cut',
          key: 'off:' + descr(el),
          msg: `${descr(el)} is completely out of view (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})`,
        });
      return;
    }
    out.push({
      kind: 'cut',
      key: 'cut:' + descr(el),
      msg: `${descr(el)} ${Math.round(frac * 100)}% visible (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}, screen ${iw}x${ih})`,
    });
  };
  for (const el of interactive) cutCheck(el, 'tap');

  // Text boxes: used for cut-off labels and for text on text.
  const texts = [];
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = (n.nodeValue || '').trim();
    if (!s) continue;
    const el = n.parentElement;
    if (!el || isSkippedZone(el) || el.closest('script, style, noscript, svg, canvas') || hiddenByAncestor(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    texts.push({ el, s, r });
    if (!interactive.has(el)) cutCheck(el, 'text');
  }
  // Text clipped by its own box (text-overflow / fixed-size label).
  for (const el of stage.querySelectorAll('*')) {
    if (isSkippedZone(el) || el.closest('svg, canvas')) continue;
    const cs = getComputedStyle(el);
    if (
      (cs.overflowX === 'hidden' || cs.overflowX === 'clip') &&
      el.scrollWidth > el.clientWidth + 2 &&
      el.clientWidth > 0 &&
      (el.textContent || '').trim() &&
      !hiddenByAncestor(el) &&
      el.children.length === 0
    ) {
      out.push({
        kind: 'cut',
        key: 'clip:' + descr(el),
        msg: `${descr(el)} text wider than its box (${el.scrollWidth} > ${el.clientWidth})`,
      });
    }
  }

  // Tap targets under MIN px.
  for (const el of interactive) {
    if (isSkippedZone(el) || hiddenByAncestor(el)) continue;
    if (el instanceof HTMLInputElement && el.type === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const v = visibleRect(el, r);
    if (v.w * v.h < 4) continue;
    // A tiny element inside a bigger tap target is only decoration of it.
    let inside = false;
    for (const o of interactive) {
      if (o !== el && o.contains(el)) inside = true;
    }
    if (inside) continue;
    // A row whose children are the real buttons (one listener on the row).
    let hasChild = false;
    for (const o of interactive) if (o !== el && el.contains(o)) hasChild = true;
    if (hasChild) continue;
    if (Math.min(r.width, r.height) < MIN) {
      out.push({
        kind: 'small',
        key: 'small:' + descr(el),
        msg: `${descr(el)} is ${Math.round(r.width)}x${Math.round(r.height)} (< ${MIN})`,
      });
    }
  }

  // Text on text.
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // The two faces of a flipping card are never seen together.
      if (a.el.closest('[style*="backface"], .flipped') || hidesBack(a.el) || hidesBack(b.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const hgt = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w <= 2 || hgt <= 2) continue;
      const inter = w * hgt;
      if (inter / Math.min(area(a.r), area(b.r)) < 0.3) continue;
      const va = visibleRect(a.el, a.r);
      const vb = visibleRect(b.el, b.r);
      if (va.w * va.h < 0.5 * area(a.r) || vb.w * vb.h < 0.5 * area(b.r)) continue;
      out.push({
        kind: 'overlap',
        key: 'ov:' + descr(a.el) + '|' + descr(b.el),
        msg: `"${a.s.slice(0, 14)}" (${descr(a.el).split(' ')[0]}) over "${b.s.slice(0, 14)}" (${descr(b.el).split(' ')[0]})`,
      });
    }
  }
  return out;
};

const KINDS = ['cut', 'hscroll', 'small', 'overlap'];
const findings = []; // {game, vp, kind, key, msg}
const errors = [];
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

// One browser, one page, reused for every game and size (light on the machine).
try {
  const context = await browser.newContext({
    viewport: { width: viewports[0].w, height: viewports[0].h },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    permissions: ['microphone', 'camera'],
  });
  await context.addInitScript(initScript);
  const page = await context.newPage();
  let current = '';
  page.on('pageerror', (e) => errors.push(`${current}: pageerror ${e.message}`));
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const label = `${vp.w}x${vp.h}`;
    for (const game of games) {
      current = `${game}@${label}`;
      try {
        await page.goto('about:blank');
        await page.goto(`${base}/#/g/${game}`, { waitUntil: 'load' });
        await page.waitForSelector('.stage', { timeout: 15000 });
        await page.waitForTimeout(1500);
        await page.evaluate(() => document.querySelectorAll('.sticker-overlay').forEach((e) => e.remove()));
        const first = await page.evaluate(probe, MIN_TAP);
        await page.waitForTimeout(1500);
        const second = await page.evaluate(probe, MIN_TAP);
        const msg2 = new Map(second.map((f) => [f.key, f.msg]));
        const seen = new Set();
        for (const f of first) {
          // Fully out of view only counts if it has not moved (not something drifting in from the edge).
          if (!msg2.has(f.key) || seen.has(f.key) || (f.key.startsWith('off:') && msg2.get(f.key) !== f.msg)) continue;
          seen.add(f.key);
          findings.push({ game, vp: label, ...f });
        }
      } catch (e) {
        errors.push(`${game}@${label}: ${String(e.message).split('\n')[0]}`);
      }
    }
  }
} finally {
  await browser.close();
  await server?.close();
}

// ---- report ----
const pad = (s, n) => String(s).padEnd(n);
const byGame = new Map(games.map((g) => [g, []]));
for (const f of findings) byGame.get(f.game)?.push(f);
console.log(`Sizes: ${viewports.map((v) => `${v.w}x${v.h}`).join(' ')}`);
console.log(
  `Counts are distinct issues per game (an issue seen at several sizes counts once); "sizes" = how many of ${viewports.length} sizes show any issue.\n`,
);
console.log([pad('game', 12), ...KINDS.map((k) => pad(k, 8)), 'sizes'].join(' '));
let clean = 0;
for (const g of games) {
  const list = byGame.get(g);
  if (!list.length) {
    clean++;
    continue;
  }
  const counts = KINDS.map((k) => new Set(list.filter((f) => f.kind === k).map((f) => f.key)).size);
  const sizes = new Set(list.map((f) => f.vp)).size;
  console.log([pad(g, 12), ...counts.map((c) => pad(c || '-', 8)), sizes].join(' '));
}
console.log(`\n${clean}/${games.length} games without any issue.`);

if (process.env.DETAIL !== '0') {
  console.log('\n--- detail (issue; sizes where it shows) ---');
  for (const g of games) {
    const list = byGame.get(g);
    if (!list.length) continue;
    console.log(`\n[${g}]`);
    for (const kind of KINDS) {
      const groups = new Map();
      for (const f of list.filter((x) => x.kind === kind)) {
        const e = groups.get(f.key) ?? { msg: f.msg, vps: [] };
        e.vps.push(f.vp);
        groups.set(f.key, e);
      }
      const rows = [...groups.values()].sort((a, b) => b.vps.length - a.vps.length);
      rows.slice(0, MAXD).forEach((r) => console.log(`  ${kind}: ${r.msg}  [${r.vps.join(' ')}]`));
      if (rows.length > MAXD) console.log(`  ${kind}: ... and ${rows.length - MAXD} more`);
    }
  }
}
if (errors.length) {
  console.log('\n--- errors while testing ---');
  [...new Set(errors)].slice(0, 40).forEach((e) => console.log('  ' + e));
}
if (process.env.JSON) console.log(JSON.stringify(findings));
