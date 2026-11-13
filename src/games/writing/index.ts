import { h, replay, wait } from '../../core/dom';
import { startLoop } from '../../core/frame';
import { sayText } from '../../core/say';
import { makeTappable } from '../../core/tap';
import type { GameContext, GameModule } from '../../core/types';
import { fitBox, toUnit, type Box } from '../trace/modes';
import { pointAt } from '../trace/logic';
import {
  LETTERS,
  LINES,
  ROAD,
  levelFor,
  letterIndex,
  loadSave,
  newStroke,
  nextLetter,
  persist,
  placeStrokes,
  stepStroke,
  tolPx,
  type LetterDef,
  type PlacedStroke,
  type Pt,
  type StrokeState,
} from './logic';
import { meta } from './meta';
import './style.css';
import { recordSkill } from '../../core/mastery';

const NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b'];
const S = 1000;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const pts = (a: readonly Pt[]): string => a.map((q) => `${(q.x * S).toFixed(1)},${(q.y * S).toFixed(1)}`).join(' ');

/**
 * Tập viết chữ: trace a lowercase letter stroke by stroke on four-line paper, in the order
 * and direction a teacher writes it. Numbered start dots and a travelling arrow show the way;
 * a finger that is off the line or goes backwards simply does nothing.
 */
function start(ctx: GameContext): void {
  const save = loadSave();
  let def: LetterDef = LETTERS[letterIndex(save.last)] ?? LETTERS[0]!;
  let strokes: PlacedStroke[] = [];
  let states: StrokeState[] = [];
  let cur = 0;
  let pressed = false;
  let finishing = false;
  let alive = true;
  let lastBoing = 0;
  let box: Box = { x: 0, y: 0, size: 300 };

  const paper = h('div', { class: 'wr-paper' });
  const field = h('div', { class: 'wr' }, paper);
  const bar = h('div', { class: 'wr-bar' });
  ctx.stage.append(field, bar);

  const tiles = new Map<string, HTMLElement>();
  for (const l of LETTERS) {
    const t = h(
      'button',
      { class: 'wr-tile', type: 'button', 'aria-label': l.ch },
      h('span', { class: 'wr-glyph' }, l.ch),
      h('span', { class: 'wr-star' }, '⭐'),
    );
    makeTappable(t, () => choose(l.ch), { ctx, cooldownMs: 250 });
    tiles.set(l.ch, t);
    bar.append(t);
  }

  let root: SVGSVGElement;
  let fills: SVGPolylineElement[] = [];
  let marks: SVGGElement[] = [];
  let ghost: SVGGElement;
  let pic: HTMLElement | null = null;

  const size = () => ({ w: field.clientWidth || 400, h: field.clientHeight || 600 });
  const level = () => levelFor(save.done.length);
  const tol = () => {
    const { w, h: ht } = size();
    return tolPx(w, ht, level()) / box.size;
  };

  function syncTiles(): void {
    for (const [ch, t] of tiles) {
      t.setAttribute('aria-pressed', String(ch === def.ch));
      t.classList.toggle('is-done', save.done.includes(ch));
    }
  }

  function layout(): void {
    const { w, h: ht } = size();
    box = fitBox(w, ht);
    bar.classList.toggle('is-side', w > ht);
    paper.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.size}px;height:${box.size}px`;
  }

  function build(): void {
    root = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'wr-svg', 'aria-hidden': 'true' });
    LINES.forEach((y, i) => {
      root.append(svg('line', { x1: 30, x2: S - 30, y1: y * S, y2: y * S, class: i === 0 || i === 2 ? 'wr-line wr-dash' : 'wr-line' }));
    });
    fills = [];
    marks = [];
    strokes.forEach((s, i) => {
      root.append(svg('polyline', { points: pts(s.path.pts), class: 'wr-road', 'stroke-width': ROAD * S }));
      const fill = svg('polyline', { points: '', class: 'wr-fill', 'stroke-width': ROAD * S, stroke: COLORS[i % COLORS.length]! });
      fills.push(fill);
      root.append(fill);
    });
    strokes.forEach((s, i) => {
      const a = s.path.pts[0]!;
      const g = svg('g', { class: 'wr-mark', transform: `translate(${a.x * S} ${a.y * S})` });
      g.append(svg('circle', { r: 46, fill: COLORS[i % COLORS.length]! }));
      const tx = svg('text', { class: 'wr-num', 'text-anchor': 'middle', y: 19 });
      tx.textContent = String(i + 1);
      g.append(tx);
      marks.push(g);
      root.append(g);
    });
    ghost = svg('g', { class: 'wr-ghost' });
    ghost.append(
      svg('polygon', {
        points: '-38,-38 44,0 -38,38 -18,0',
        fill: '#fff',
        stroke: '#1e293b',
        'stroke-width': 6,
        'stroke-linejoin': 'round',
      }),
    );
    root.append(ghost);
    root.setAttribute('width', String(box.size));
    root.setAttribute('height', String(box.size));
    paper.replaceChildren(root);
    pic = null;
  }

  function refreshMarks(): void {
    marks.forEach((g, i) => {
      g.style.display = i < cur || finishing ? 'none' : '';
      g.classList.toggle('is-now', i === cur);
    });
  }

  function load(announce: boolean): void {
    def = LETTERS[letterIndex(def.ch)] ?? LETTERS[0]!;
    strokes = placeStrokes(def);
    states = strokes.map(() => newStroke());
    cur = 0;
    finishing = false;
    pressed = false;
    save.last = def.ch;
    persist(save);
    layout();
    build();
    refreshMarks();
    syncTiles();
    tiles.get(def.ch)?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    if (announce) void sayText(ctx, `Chữ ${def.say}. Theo chấm số một nhé!`);
    let nudged = -1;
    ctx.hint.arm(() => {
      if (nudged !== (ctx.hint.epoch ?? 0)) {
        nudged = ctx.hint.epoch ?? 0;
        void sayText(ctx, 'Kéo ngón tay theo mũi tên nhé!');
      }
      const m = marks[cur];
      if (m) replay(m as unknown as HTMLElement, 'wr-pulse');
    });
  }

  function choose(ch: string): void {
    if (finishing || ch === def.ch) return;
    def = LETTERS[letterIndex(ch)]!;
    ctx.audio.pop();
    ctx.hint.touch();
    load(true);
  }

  function showFill(i: number): void {
    const s = strokes[i]!;
    const st = states[i]!;
    const n = s.path.pts.length;
    const upto: Pt[] = [];
    for (let k = 0; k < n; k++) {
      if (s.path.cum[k]! > st.progress) {
        upto.push(pointAt(s.path, st.progress));
        break;
      }
      upto.push(s.path.pts[k]!);
    }
    if (upto.length === 1) upto.push(upto[0]!);
    fills[i]!.setAttribute('points', pts(upto));
  }

  function finish(): void {
    finishing = true;
    refreshMarks();
    ctx.hint.clear();
    ctx.audio.ding();
    const first = !save.done.includes(def.ch);
    recordSkill(`write:${def.ch}`, true);
    if (first) save.done.push(def.ch);
    persist(save);
    syncTiles();
    const done = def;
    pic = h('div', { class: 'wr-alive' }, h('span', { class: 'wr-pic' }, done.emoji), h('span', { class: 'wr-word' }, done.word));
    paper.append(pic);
    void sayText(ctx, `Chữ ${done.say}. ${done.word}.`);
    void ctx
      .celebrate()
      .then(() => {
        if (!alive) return;
        ctx.addStar();
        return wait(900);
      })
      .then(() => {
        if (!alive) return;
        def = LETTERS[letterIndex(nextLetter(done.ch, save.done))]!;
        load(true);
      });
  }

  function sample(e: PointerEvent, begin: boolean): void {
    if (finishing) return;
    const r = field.getBoundingClientRect();
    const f = toUnit(box, { x: e.clientX - r.left, y: e.clientY - r.top });
    const s = strokes[cur];
    const st = states[cur];
    if (!s || !st) return;
    const res = stepStroke(s, st, f, tol(), begin);
    if (res.moved) {
      ctx.hint.touch();
      showFill(cur);
      navigator.vibrate?.(4);
    } else if (begin) {
      const now = performance.now();
      if (now - lastBoing > 1500) {
        lastBoing = now;
        ctx.audio.boing();
      }
    }
    if (res.done) {
      ctx.audio.note(520 * Math.pow(1.122, cur * 2), 0.18);
      navigator.vibrate?.(12);
      cur++;
      pressed = false;
      if (cur >= strokes.length) finish();
      else refreshMarks();
    }
  }

  field.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (finishing) return;
    pressed = true;
    try {
      field.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic event */
    }
    sample(e, true);
  });
  field.addEventListener('pointermove', (e) => {
    if (pressed && !finishing) sample(e, false);
  });
  const up = () => {
    pressed = false;
  };
  field.addEventListener('pointerup', up);
  field.addEventListener('pointercancel', up);

  // The arrow runs along the stroke to write next, until a finger is on it.
  startLoop(ctx, (now) => {
    const s = strokes[cur];
    if (!ghost || !s || pressed || finishing || s.tap) {
      if (ghost) ghost.style.display = 'none';
      return;
    }
    const t = Math.min(1, (now % 2600) / 1900);
    const at = pointAt(s.path, s.path.total * t);
    const ahead = pointAt(s.path, Math.min(s.path.total, s.path.total * t + 0.02));
    const ang = (Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180) / Math.PI;
    ghost.style.display = '';
    ghost.setAttribute('transform', `translate(${at.x * S} ${at.y * S}) rotate(${ang})`);
  });

  const onResize = () => {
    layout();
    root?.setAttribute('width', String(box.size));
    root?.setAttribute('height', String(box.size));
  };
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    window.removeEventListener('resize', onResize);
  });

  load(true);
}

const game: GameModule = { ...meta, start };
export default game;
