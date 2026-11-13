// Inventory of every line the app can speak, normalized like the runtime looks clips up.
//
//   npx vite-node scripts/voice-inventory.mjs                 static pass -> scripts/voice-inventory.json
//   npx vite-node scripts/voice-inventory.mjs --runtime       + play every game in Chromium with a fake
//                                                             speechSynthesis and report what the static
//                                                             pass missed (needs Playwright browsers)
//   options: --games=count,colors  --secs=14  (runtime only)   --runtime-only=path.json reuses a saved log
//
// Static pass (TypeScript AST over src/**, no tests), strings are tiered:
//   call   literal inside a speak/say/... call (or a part builder such as wordPart/say())  -> certain
//   table  literal under a speech-ish key (name, say, word, prompt...) or in an array of Vietnamese words
//   maybe  any other Vietnamese-looking literal (UI text, unverified)                       -> listed apart
// `${...}` templates are expanded from the string pools of the file's import neighbourhood when the
// result is small (<= MAX_EXPAND); otherwise they are reported with proposed fragments.
// Every line goes through the real phraseParts() (src/core/say.ts), keys through voiceKey().
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { phraseParts } from '../src/core/say.ts';
import { voiceKey } from '../src/core/voiceKey.ts';
import { EN_WORDS } from '../src/core/english.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? join(ROOT, 'scripts', 'voice-inventory.json');
const MAX_EXPAND = 150;
const argv = process.argv.slice(2);
const arg = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const SPEECH_CALL = /^(speak|speakSeq|speakText|speakFor|say|sayText|sayWord|sayLines|sayCount|sayParts|sayReady|sayMoment|sayEnglish|echoEnglish|wordPart|talkPart|phraseParts|announce|cheer|praise|narrate|hint)$/;
/** Callees whose first argument is one single phrase (no sentence splitting by the game). */
const RAW_CALL = /^(wordPart|talkPart|sayWord|sayEnglish)$/;
const SKIP_CALL = /^(h|svg|querySelector|querySelectorAll|getElementById|closest|matches|add|remove|toggle|contains|addEventListener|removeEventListener|dispatchEvent|setAttribute|getAttribute|removeAttribute|getItem|setItem|removeItem|log|warn|error|info|Error|fetch|import|require|Event|CustomEvent|createElementNS|createElement|setProperty|getPropertyValue|test|exec|startsWith|endsWith|includes|indexOf|replace|replaceAll|split|join|padStart|padEnd|createLinearGradient|addColorStop|fillText|strokeText|measureText|font)$/;
const SKIP_KEYS = new Set(['aria-label', 'ariaLabel', 'class', 'className', 'id', 'style', 'href', 'src', 'type', 'role', 'key', 'emoji', 'color', 'icon', 'fill', 'stroke', 'font', 'cursor', 'background', 'path', 'd', 'viewBox', 'tag', 'testid', 'title_attr', 'alt', 'placeholder', 'file', 'url', 'storageKey', 'wave', 'kind', 'sfx', 'sound_id', 'fx', 'transition', 'animation', 'transform', 'display', 'mime', 'lang', 'sid', 'unit', 'instrument']);
const SPEECH_KEYS = new Set(['name', 'say', 'word', 'words', 'line', 'lines', 'prompt', 'brief', 'praise', 'praises', 'hint', 'text', 'title', 'intro', 'sound', 'speak', 'vi', 'label', 'reveal', 'again', 'ask', 'question', 'sentence', 'phrase', 'caption', 'greeting', 'story', 'verse', 'lyrics', 'opposite', 'tone', 'letter', 'number', 'noun', 'desc', 'nameVi']);
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/iu;
const hasLetters = (s) => /[\p{L}\p{N}]/u.test(s);
const norm = (s) => voiceKey(s);

// ---------- read & parse ----------
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mjs)$/.test(f) && !/\.test\.ts$/.test(f) && !f.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const files = walk(SRC);
const SKIP_FILES = /(loudness-files|testing)\.ts$/;
const parsed = new Map(); // file -> {sf, text}
for (const f of files) {
  if (SKIP_FILES.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  parsed.set(f, { sf: ts.createSourceFile(f, text, ts.ScriptTarget.ES2022, true), text });
}
const rel = (f) => relative(ROOT, f);
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

// ---------- pools (property key -> strings) per file, and import closure ----------
const poolsByFile = new Map();
/** file -> Map(name -> strings): string consts arrays ('ARR') and strings inside functions ('fn()') */
const namedByFile = new Map();
/** file -> short Vietnamese phrases (<= 3 words) anywhere in it, a last-resort pool for `${x.name}` */
const shortByFile = new Map();
const importsByFile = new Map();
let numberPool = [];
function strOf(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return null;
}
for (const [f, { sf }] of parsed) {
  const pools = new Map();
  const add = (k, v) => {
    if (!hasLetters(v)) return;
    if (!pools.has(k)) pools.set(k, new Set());
    pools.get(k).add(v);
  };
  const imps = [];
  const named = new Map();
  const short = new Set();
  const strsIn = (node) => {
    const out = new Set();
    const w = (x) => {
      const t = strOf(x);
      if (t !== null && hasLetters(t) && !/^[\w.#:/-]*[_\-/#:.\d][\w.#:/-]*$/.test(t)) out.add(t.trim());
      ts.forEachChild(x, w);
    };
    w(node);
    return [...out];
  };
  const v = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) named.set(`${n.name.text}()`, strsIn(n.body));
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const i = n.initializer;
      if (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) named.set(`${n.name.text}()`, strsIn(i.body));
      else if (ts.isArrayLiteralExpression(i) || ts.isObjectLiteralExpression(i)) named.set(n.name.text, strsIn(i));
    }
    { const t = strOf(n); if (t !== null && VI_DIACRITIC.test(t) && t.trim().split(/\s+/).length <= 3 && !/[.!?]/.test(t)) short.add(t.trim()); }
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text.startsWith('.')) {
      const base = resolve(dirname(f), n.moduleSpecifier.text);
      for (const c of [`${base}.ts`, join(base, 'index.ts'), base]) if (parsed.has(c)) { imps.push(c); break; }
    }
    if (ts.isPropertyAssignment(n)) {
      const key = ts.isIdentifier(n.name) || ts.isStringLiteral(n.name) ? n.name.text : null;
      if (key) {
        const s = strOf(n.initializer);
        if (s !== null) add(key, s);
        else if (ts.isArrayLiteralExpression(n.initializer)) for (const e of n.initializer.elements) { const t = strOf(e); if (t !== null) add(key, t); }
      }
    }
    if (ts.isArrayLiteralExpression(n)) {
      const ss = n.elements.map(strOf);
      if (ss.length >= 3 && ss.every((x) => x !== null) && ss.includes('một') && ss.includes('hai') && ss.length > numberPool.length) numberPool = ss;
    }
    ts.forEachChild(n, v);
  };
  v(sf);
  poolsByFile.set(f, pools);
  namedByFile.set(f, named);
  shortByFile.set(f, short);
  importsByFile.set(f, imps);
}
function neighbourhood(f) {
  const seen = new Set([f]);
  const dir = dirname(f);
  for (const g of parsed.keys()) if (dirname(g) === dir) seen.add(g);
  let frontier = [...seen];
  for (let d = 0; d < 2; d++) {
    const next = [];
    for (const g of frontier) for (const i of importsByFile.get(g) ?? []) if (!seen.has(i)) { seen.add(i); next.push(i); }
    frontier = next;
  }
  return seen;
}
/** Closest pool wins: the file itself, then its folder, then what it imports (two levels). */
function poolFor(f, key) {
  const own = [...(poolsByFile.get(f)?.get(key) ?? [])];
  if (own.length) return own;
  const dir = dirname(f);
  const near = new Set();
  for (const g of parsed.keys()) if (dirname(g) === dir) for (const s of poolsByFile.get(g)?.get(key) ?? []) near.add(s);
  if (near.size) return [...near];
  const out = new Set();
  for (const g of neighbourhood(f)) for (const s of poolsByFile.get(g)?.get(key) ?? []) out.add(s);
  return [...out];
}

// ---------- collection ----------
/** @type {{text:string, tier:'call'|'table'|'maybe', raw:boolean, src:string, whole:boolean}[]} */
const found = [];
/** @type {{template:string, src:string, tier:string, fragments:string[], slots:{expr:string,pool:number|null}[], expanded:number|null}[]} */
const templates = [];
const wholeSpeak = new Set(); // texts passed to plain speak() (spoken as ONE utterance today)

const calleeName = (e) => (ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ts.isElementAccessExpression(e) ? null : null);

function classify(text, ctx, hasVi) {
  if (ctx.skip || ctx.skipKey || ctx.cmp) return null;
  const t = text.trim();
  if (!hasLetters(t)) return null;
  if (ctx.speech) {
    if (/^[\w-]+$/.test(t) && /[_\-\d]/.test(t)) return null; // ids, css, file names
    return 'call';
  }
  const asciiId = /^[A-Za-z0-9_.\-/#:]+$/.test(t) && (/[_\-/#:.\d]/.test(t) || (t === t.toLowerCase() && !hasVi && t.length > 14));
  if (asciiId) return null;
  if (ctx.key && SPEECH_KEYS.has(ctx.key) && (hasVi || /\s/.test(t) || /^[A-Za-zÀ-ỹ]+$/u.test(t))) return 'table';
  if (ctx.arrayVi) return 'table';
  if (hasVi) return 'maybe';
  return null;
}

function addLine(text, tier, raw, f, node, viaTemplate = false) {
  found.push({ text, tier, raw, viaTemplate, src: `${rel(f)}:${lineOf(parsed.get(f).sf, node)}` });
}

function namedPool(f, key) {
  for (const g of [f, ...neighbourhood(f)]) {
    const p = namedByFile.get(g)?.get(key);
    if (p?.length) return p;
  }
  return [];
}

/** Candidate strings for one `${expr}` slot (empty = cannot tell). */
function slotPool(expr, f, sf) {
  let e = expr;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) e = e.expression;
    else if (ts.isCallExpression(e) && e.arguments.length && /^(cap|capFirst|capText|capitalize|upperFirst|lower|toLower)$/.test(calleeName(e.expression) ?? '')) e = e.arguments[0];
    else if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) e = e.left;
    else break;
  }
  const src = e.getText(sf);
  const digits = Array.from({ length: 20 }, (_, i) => String(i + 1));
  const res = (pool) => ({ expr: src, pool });
  if (/\.length$|^Math\.|^[\w.]+ [-+*%] |^\w+ ?[-+]\s?\d+$|\.toFixed|^String\(/.test(src) && !/\.name\b/.test(src)) return res(digits);
  let key = null;
  let base = null;
  if (ts.isCallExpression(e) && !ts.isPropertyAccessExpression(e.expression)) {
    key = calleeName(e.expression);
    if (key && /^(numberWord|numWord|numberName)$/.test(key)) return res(numberPool.slice(1, 21));
    const f2 = key ? namedPool(f, `${key}()`) : [];
    return res(f2);
  }
  if (ts.isElementAccessExpression(e)) {
    base = e.expression.getText(sf);
    if (/NUMBER_WORDS|numberWords|NUMBERS/i.test(base)) return res(numberPool.slice(1, 21));
    const arr = ts.isIdentifier(e.expression) ? namedPool(f, base) : [];
    if (arr.length) return res(arr);
  }
  if (ts.isPropertyAccessExpression(e)) key = e.name.text;
  else if (ts.isIdentifier(e)) key = e.text;
  else if (ts.isElementAccessExpression(e) && ts.isPropertyAccessExpression(e.expression)) key = e.expression.name.text;
  if (key && /^(n|count|num|total|left|remaining|score|stars|index|i)$/i.test(key)) return res(digits);
  if (key) {
    const p = poolFor(f, key);
    if (p.length) return res(p);
    const named = ts.isIdentifier(e) ? namedPool(f, key) : [];
    if (named.length) return res(named);
    if (/^(name|word|say|label|title|text|noun)$/.test(key)) {
      const out = new Set();
      for (const g of [f, ...[...parsed.keys()].filter((x) => dirname(x) === dirname(f))]) for (const t of shortByFile.get(g) ?? []) out.add(t);
      return res([...out]);
    }
  }
  return res([]);
}

function handleTemplate(n, ctx, f) {
  const sf = parsed.get(f).sf;
  const head = n.head.text;
  const lits = [head, ...n.templateSpans.map((s) => s.literal.text)];
  const hasVi = lits.some((s) => VI_DIACRITIC.test(s));
  const tier = classify(lits.join('·'), ctx, hasVi);
  if (!tier) return;
  const slotInfo = n.templateSpans.map((sp) => slotPool(sp.expression, f, sf));
  const slots = slotInfo.map((x) => ({ expr: x.expr }));
  const pools = slotInfo.map((x) => x.pool);
  const resolvable = pools.every((p) => p.length > 0);
  const size = resolvable ? pools.reduce((a, p) => a * p.length, 1) : null;
  const rec = {
    template: lits.map((l, i) => (i < slots.length ? `${l}\${${slots[i].expr}}` : l)).join(''),
    src: `${rel(f)}:${lineOf(sf, n)}`,
    tier,
    fragments: [...new Set(lits.map((l) => l.replace(/^[\s,.!?]+|[\s,.!?]+$/g, '')).filter(hasLetters))],
    slots: slots.map((x, i) => ({ expr: x.expr, pool: pools[i].length || null })),
    expanded: null,
  };
  if (resolvable && size <= MAX_EXPAND) {
    let combos = [[]];
    for (const p of pools) combos = combos.flatMap((c) => p.map((x) => [...c, x]));
    for (const c of combos) addLine(lits.map((l, i) => l + (i < c.length ? c[i] : '')).join(''), tier, false, f, n, true);
    rec.expanded = combos.length;
  }
  templates.push(rec);
}

function visit(n, ctx, f) {
  if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
    const name = calleeName(n.expression);
    visit(n.expression, { ...ctx, speech: null, skip: false, key: null, arrayVi: false }, f);
    const speech = name && SPEECH_CALL.test(name) ? name : null;
    const skip = !!name && SKIP_CALL.test(name) && !speech;
    (n.arguments ?? []).forEach((a, i) => {
      const argCtx = { speech: speech && i < 4 ? speech : null, skip, key: null, arrayVi: false, rawCall: speech && RAW_CALL.test(speech) && i === 0 };
      if (speech === 'speak' || speech === 'say') argCtx.speakWhole = speech === 'speak';
      visit(a, argCtx, f);
    });
    return;
  }
  if (ts.isFunctionLike(n) || ts.isClassLike(n)) {
    ts.forEachChild(n, (c) => visit(c, { speech: null, skip: false, key: null, arrayVi: false }, f));
    return;
  }
  if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTypeNode(n) || ts.isThrowStatement(n) || ts.isCaseClause(n)) return;
  if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(n.operatorToken.kind)) {
    visit(n.left, { ...ctx, cmp: true }, f);
    visit(n.right, { ...ctx, cmp: true }, f);
    return;
  }
  if (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) {
    const key = ts.isIdentifier(n.name) || ts.isStringLiteral(n.name) ? n.name.text : null;
    if (ts.isPropertyAssignment(n)) visit(n.initializer, { ...ctx, key, skipKey: key ? SKIP_KEYS.has(key) : false, arrayVi: false }, f);
    return;
  }
  if (ts.isArrayLiteralExpression(n)) {
    const ss = n.elements.map(strOf).filter((x) => x !== null);
    const vi = !ctx.speech && ss.length >= 2 && ss.some((x) => VI_DIACRITIC.test(x));
    for (const e of n.elements) visit(e, { ...ctx, arrayVi: ctx.arrayVi || vi }, f);
    return;
  }
  const s = strOf(n);
  if (s !== null) {
    const tier = classify(s, ctx, VI_DIACRITIC.test(s));
    if (tier) {
      addLine(s, tier, !!ctx.rawCall, f, n);
      if (ctx.speakWhole) wholeSpeak.add(s);
    }
    return;
  }
  if (ts.isTemplateExpression(n)) {
    handleTemplate(n, ctx, f);
    return;
  }
  ts.forEachChild(n, (c) => visit(c, ctx, f));
}

for (const [f, { sf }] of parsed) visit(sf, { speech: null, skip: false, key: null, arrayVi: false }, f);

// ---------- run through phraseParts / voiceKey ----------
/** key -> {text, rates, tiers, srcs, chars} */
const parts = new Map();
const maybe = new Map();
function note(map, text, rate, tier, src) {
  const key = norm(text);
  if (!key) return;
  let e = map.get(key);
  if (!e) map.set(key, (e = { key, text: text.trim().replace(/[,…]+$/u, ''), rates: new Set(), tiers: new Set(), srcs: [] }));
  e.rates.add(rate);
  e.tiers.add(tier);
  if (e.srcs.length < 3 && !e.srcs.includes(src)) e.srcs.push(src);
}
for (const l of found) {
  const ps = l.raw ? [{ text: l.text.replace(/[.!?…,\s]+$/u, ''), rate: 0.68 }] : phraseParts(l.text);
  for (const p of ps) note(l.tier === 'maybe' ? maybe : parts, p.text, p.rate ?? null, l.viaTemplate ? 'expanded' : l.tier, l.src);
}
// A "maybe" that is also a certain line is not an extra.
for (const k of parts.keys()) maybe.delete(k);

// ---------- English ----------
const english = new Map(); // word -> [vi keys]
for (const [vi, en] of Object.entries(EN_WORDS)) english.set(en, [...(english.get(en) ?? []), vi]);
const ONES = readFileSync(join(SRC, 'core', 'english.ts'), 'utf8').match(/const ONES = \[([\s\S]*?)\];/)?.[1].match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
for (const w of ONES) if (w && !english.has(w)) english.set(w, ['(number 0-20)']);

// ---------- runtime cross-check ----------
async function runtimePass() {
  const { chromium } = await import('playwright');
  const { createServer } = await import('vite');
  const secs = Number(arg('secs') ?? 14);
  const server = await createServer({ root: ROOT, server: { port: 4199, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
  await server.listen();
  const base = `http://127.0.0.1:${server.config.server.port}`;
  const ids = (arg('games') ? arg('games').split(',') : readdirSync(join(SRC, 'games')).filter((d) => existsSync(join(SRC, 'games', d, 'meta.ts')))).filter(Boolean);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 820, height: 1100 }, hasTouch: true, isMobile: true, permissions: ['microphone', 'camera'] });
  const log = []; // {game, text, lang, rate}
  let current = 'home';
  await context.exposeBinding('__logSpeech', (_s, t, lang, rate) => log.push({ game: current, text: t, lang, rate }));
  await context.addInitScript(() => {
    try { localStorage.setItem('be-choi:english', '1'); } catch { /* ignore */ }
    class U { constructor(t) { this.text = t; this.lang = ''; this.rate = 1; this.pitch = 1; this.voice = null; this.volume = 1; this.onend = null; this.onerror = null; } }
    window.SpeechSynthesisUtterance = U;
    const voices = [
      { lang: 'vi-VN', name: 'Fake vi', voiceURI: 'fake-vi', localService: true, default: true },
      { lang: 'en-US', name: 'Fake en', voiceURI: 'fake-en', localService: true, default: false },
    ];
    const syn = {
      speaking: false, pending: false, paused: false, onvoiceschanged: null,
      getVoices: () => voices,
      speak(u) { window.__logSpeech(u.text, u.lang, u.rate); setTimeout(() => { try { u.onend && u.onend({}); } catch { /* ignore */ } }, 15); },
      cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: syn, configurable: true });
  });
  const page = await context.newPage();
  page.on('pageerror', () => {});
  const poke = async (rounds) => {
    for (let i = 0; i < rounds; i++) {
      // tap buttons/cards first, then scattered points (games spawn things anywhere)
      const boxes = await page.evaluate(() => [...document.querySelectorAll('button, [role=button], .g-item, [class*=card], [class*=tile], canvas, svg')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight).slice(0, 80).map((r) => [r.x + r.width / 2, r.y + r.height / 2]));
      const pt = boxes.length && Math.random() < 0.8 ? boxes[Math.floor(Math.random() * boxes.length)] : [40 + Math.random() * 740, 120 + Math.random() * 900];
      try { await page.mouse.click(pt[0], pt[1]); } catch { /* ignore */ }
      if (i % 9 === 8) { await page.mouse.click(10, 10); }
      await page.waitForTimeout(250);
    }
  };
  current = 'home';
  await page.goto(`${base}/#/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await poke(10);
  await page.goto(`${base}/#/album`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  for (const id of ids) {
    current = id;
    try {
      await page.goto(`${base}/#/g/${id}`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const end = Date.now() + secs * 1000;
      while (Date.now() < end) await poke(8);
    } catch (e) { console.error(`runtime ${id}: ${e.message}`); }
  }
  await browser.close();
  await server.close();
  return log;
}

function runtimeReport(log) {
  const gaps = new Map();
  let vi = 0, enSpoken = new Set();
  const seen = new Set();
  for (const u of log) {
    if (/^en/i.test(u.lang)) { enSpoken.add(u.text.toLowerCase()); continue; }
    vi++;
    // the runtime may speak whole lines (speak()) or parts; accept a hit if the whole key or all of its phraseParts are known
    const whole = norm(u.text);
    if (!whole || seen.has(whole)) continue;
    seen.add(whole);
    const ps = phraseParts(u.text).map((p) => norm(p.text));
    const known = (k) => parts.has(k);
    if (known(whole) || (ps.length && ps.every(known))) continue;
    const inMaybe = whole && (maybe.has(whole) || ps.every((k) => known(k) || maybe.has(k)));
    gaps.set(whole, { text: u.text, game: u.game, rate: u.rate, inMaybeTier: !!inMaybe, parts: ps.filter((k) => !known(k)) });
  }
  const enMissing = [...enSpoken].filter((w) => !english.has(w));
  return {
    utterancesLogged: log.length,
    viUtterances: vi,
    distinctViLines: seen.size,
    missedByStatic: [...gaps.values()].filter((g) => !g.inMaybeTier),
    foundOnlyInMaybeTier: [...gaps.values()].filter((g) => g.inMaybeTier),
    englishSpoken: [...enSpoken],
    englishMissing: enMissing,
  };
}

// ---------- output ----------
const toList = (map) =>
  [...map.values()]
    .map((e) => ({ key: e.key, text: e.text, chars: e.key.length, rates: [...e.rates].filter((x) => x != null).sort(), tiers: [...e.tiers].sort(), src: e.srcs }))
    .sort((a, b) => a.key.localeCompare(b.key, 'vi'));
const partList = toList(parts);
const maybeList = toList(maybe);
const wholeList = [...wholeSpeak].map(norm).filter((k) => k && !parts.has(k));
const totalChars = partList.reduce((a, p) => a + p.chars, 0);
const unexpanded = templates.filter((t) => t.expanded === null);
const stats = {
  distinctParts: partList.length,
  totalChars,
  byTier: {
    call: partList.filter((p) => p.tiers.includes('call')).length,
    tableOnly: partList.filter((p) => !p.tiers.includes('call') && !p.tiers.includes('expanded') && p.tiers.includes('table')).length,
    templateExpandedOnly: partList.filter((p) => p.tiers.every((t) => t === 'expanded')).length,
  },
  maybeParts: maybeList.length,
  maybeChars: maybeList.reduce((a, p) => a + p.chars, 0),
  wholeSpeakNotAPart: wholeList.length,
  templatesTotal: templates.length,
  templatesExpanded: templates.length - unexpanded.length,
  templatesUnexpanded: unexpanded.length,
  englishWords: english.size,
  englishChars: [...english.keys()].reduce((a, w) => a + w.length, 0),
  top30Longest: [...partList].sort((a, b) => b.chars - a.chars).slice(0, 30).map((p) => ({ chars: p.chars, text: p.text })),
};
const out = {
  generated: new Date().toISOString(),
  note: 'parts = distinct voiceKey()s of every SpeechPart (call+table tiers). maybe = Vietnamese-looking literals not proven spoken. See scripts/voice-inventory.mjs header.',
  stats,
  parts: partList,
  maybe: maybeList,
  wholeSpeak: wholeList,
  english: [...english.entries()].map(([word, vi]) => ({ word, vi })).sort((a, b) => a.word.localeCompare(b.word)),
  templatesUnexpanded: unexpanded.map(({ template, src, tier, fragments, slots }) => ({ template, src, tier, fragments, slots })),
  templatesExpanded: templates.filter((t) => t.expanded !== null).map(({ template, src, expanded }) => ({ template, src, expanded })),
};
if (argv.includes('--runtime') || arg('runtime-only')) {
  const log = arg('runtime-only') ? JSON.parse(readFileSync(arg('runtime-only'), 'utf8')) : await runtimePass();
  if (!arg('runtime-only')) writeFileSync(join(dirname(OUT), 'voice-runtime-log.json'), JSON.stringify(log));
  out.runtime = runtimeReport(log);
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ ...stats, top30Longest: undefined }, null, 1));
if (out.runtime) console.log(JSON.stringify({ ...out.runtime, missedByStatic: out.runtime.missedByStatic.length, foundOnlyInMaybeTier: out.runtime.foundOnlyInMaybeTier.length, englishSpoken: out.runtime.englishSpoken.length }, null, 1));
