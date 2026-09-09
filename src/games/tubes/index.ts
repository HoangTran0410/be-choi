import type { ColorDef } from '../../core/content';
import { h, replay } from '../../core/dom';
import type { Pt } from '../../core/drag';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { bestLayout, canMove, dealLevel, isSolved, isTubeDone, suggestMove, tubeAt, type Board } from './logic';
import './style.css';

/** A press that travels less than this many px is a tap, not a drag. */
const TAP_SLOP = 10;
/** How far outside a tube a ball may be let go and still fall in, in tube widths. */
const DROP_SLACK = 0.6;
/** How far clear of the rim a ball in hand floats, in ball heights. */
const LIFT = 0.98;

interface Tube {
  el: HTMLElement;
  /** Holds the ball elements, bottom first — the same order as `board[i]`. */
  stack: HTMLElement;
  balls: HTMLElement[];
}

/** The finger that is down right now, and what it started on. */
interface Press {
  id: number;
  /** Tube the finger landed on. */
  tube: number;
  x: number;
  y: number;
  /** What letting go without moving would mean. */
  mode: 'grab' | 'lower' | 'move';
  /** The press has travelled far enough to be a drag. */
  far: boolean;
  /** Ball this press is holding still, so that a drag can measure where it rests. */
  ball: HTMLElement | null;
  /** Screen centre that ball rests at, once it is being carried. */
  cx: number;
  cy: number;
}

/**
 * Ball sort. Every tube holds one colour at the end. Pressing a tube anywhere —
 * the glass, a buried ball — takes its top ball out and puts it in the child's
 * hand: let go without moving and it waits above the rim for a tube to be tapped,
 * or drag it straight across. Any tube with room accepts any ball (see `logic.ts`),
 * so the board can never be locked up. Finishing one bumps the level: more balls,
 * more tubes, more colours.
 */
function start(ctx: GameContext): void {
  let level = 0;
  /** Balls per colour, and the capacity of one tube. */
  let height = 0;
  let board: Board = [];
  let palette: readonly ColorDef[] = [];
  let tubes: Tube[] = [];
  /** Tube whose top ball is out, waiting for somewhere to go. */
  let selected: number | null = null;
  let press: Press | null = null;
  /** True while a won board is being celebrated: the tubes stop answering. */
  let busy = false;
  let alive = true;
  let disposers: Array<() => void> = [];

  const root = h('div', { class: 'tubes' });
  const boardEl = h('div', { class: 'tubes-board' });
  const area = h('div', { class: 'tubes-area' }, boardEl);
  root.append(area);
  ctx.stage.append(root);

  /** Square up the tubes with whatever room the screen has. jsdom has no layout: keep the CSS default. */
  function resize(): void {
    const r = area.getBoundingClientRect();
    if (!r.width || !r.height || !tubes.length) return;
    const lay = bestLayout(tubes.length, height, r.width, r.height);
    if (lay.ball <= 0) return;
    root.style.setProperty('--tubes-ball', `${lay.ball}px`);
    root.style.setProperty('--tubes-cols', String(lay.cols));
  }

  function colorOf(id: string): ColorDef | undefined {
    return palette.find((c) => c.id === id);
  }

  function makeBall(colorId: string): HTMLElement {
    return h('div', { class: 'tubes-ball', 'data-color': colorId, style: `--tubes-c:${colorOf(colorId)?.hex ?? '#ef4444'}` });
  }

  /**
   * Move a ball's element into `stack`, sliding it there from wherever it is on
   * screen right now (the tube it came from, or the child's fingertip).
   */
  function fly(ball: HTMLElement, stack: HTMLElement): void {
    const from = ball.getBoundingClientRect();
    ball.classList.remove('up', 'held', 'dragging');
    ball.style.transition = 'none';
    ball.style.transform = '';
    stack.append(ball);
    const to = ball.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (!dx && !dy) {
      ball.style.transition = '';
      return;
    }
    ball.style.transform = `translate(${dx}px, ${dy}px)`;
    // Commit that starting frame with no transition, then hand it back so the
    // ball travels home instead of appearing there.
    void ball.offsetWidth;
    ball.style.transition = '';
    ball.style.transform = '';
  }

  /** Take the top ball of tube `i` out and hold it clear of the rim. */
  function lift(i: number): void {
    const t = tubes[i];
    const ball = t?.balls.at(-1);
    if (!t || !ball) return;
    selected = i;
    // Right out of the tube, not one slot up: how far depends on how deep it sat.
    ball.style.setProperty('--tubes-lift', String(height - t.balls.length + LIFT));
    ball.style.transform = '';
    ball.classList.add('up');
    ctx.audio.pop(1.4);
  }

  /** Drop the waiting ball back where it came from. */
  function lower(quiet = false): void {
    if (selected === null) return;
    const ball = tubes[selected]?.balls.at(-1);
    if (ball) {
      ball.classList.remove('up', 'held', 'dragging');
      ball.style.transform = '';
    }
    selected = null;
    if (!quiet) ctx.audio.tick();
  }

  function move(from: number, to: number): void {
    const src = tubes[from];
    const dst = tubes[to];
    if (!src || !dst || !canMove(board, from, to, height)) {
      ctx.audio.boing();
      if (dst) replay(dst.el, 'anim-shake');
      return;
    }
    const ball = src.balls.pop();
    const colorId = board[from]!.pop();
    if (!ball || !colorId) return;
    board[to]!.push(colorId);
    dst.balls.push(ball);
    selected = null;
    fly(ball, dst.stack);
    ctx.audio.pop(0.7 + 0.12 * dst.balls.length);
    navigator.vibrate?.(10);
    refresh();
    check();
  }

  /** A full one-colour tube shines and says its colour. */
  function refresh(announce = true): void {
    tubes.forEach((t, i) => {
      const done = isTubeDone(board[i]!, height);
      if (!done) {
        t.el.classList.remove('done');
        t.el.style.removeProperty('--tubes-c');
        return;
      }
      const color = colorOf(board[i]![0]!);
      if (color) t.el.style.setProperty('--tubes-c', color.hex);
      if (t.el.classList.contains('done')) return;
      t.el.classList.add('done');
      if (!announce) return;
      for (const b of t.balls) replay(b, 'anim-bounce');
      ctx.audio.ding();
      if (color) ctx.speak(color.name);
    });
  }

  function check(): void {
    if (!isSolved(board, height)) return;
    busy = true;
    ctx.hint.clear();
    void ctx.celebrate().then(() => {
      if (!alive) return;
      busy = false;
      ctx.addStar();
      level++;
      deal();
    });
  }

  /** Freeze a ball's float, so a drag can measure exactly where it is resting. */
  function hold(ball: HTMLElement | null): void {
    if (!press) return;
    press.ball = ball;
    ball?.classList.add('held');
  }

  function onDown(e: PointerEvent, i: number): void {
    if (!alive || busy || press || e.isPrimary === false || e.button > 0) return;
    const t = tubes[i];
    if (!t) return;
    e.preventDefault();
    const mode = selected === null ? 'grab' : selected === i ? 'lower' : 'move';
    press = { id: e.pointerId, tube: i, x: e.clientX, y: e.clientY, mode, far: false, ball: null, cx: 0, cy: 0 };
    try {
      t.el.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom, or a browser that will not capture: the handlers still fire */
    }
    if (mode === 'grab') {
      if (!t.balls.length) {
        ctx.audio.tick();
        return;
      }
      // Wherever on the tube the finger landed, the top ball comes out.
      lift(i);
    }
    hold(selected === null ? null : (tubes[selected]?.balls.at(-1) ?? null));
  }

  /** The press has become a drag: work out which ball ends up under the finger. */
  function carry(): void {
    if (!press) return;
    const i = press.tube;
    // A ball was waiting and the finger set off from a different tube: the child
    // changed their mind. Put that one back and hand them this tube's ball.
    if (press.mode === 'move' && tubes[i]?.balls.length) {
      press.ball?.classList.remove('held');
      lower(true);
      lift(i);
      hold(tubes[i]?.balls.at(-1) ?? null);
    }
    const ball = press.ball;
    if (!ball) return;
    ball.classList.add('dragging');
    const r = ball.getBoundingClientRect();
    press.cx = r.left + r.width / 2;
    press.cy = r.top + r.height / 2;
  }

  function onMove(e: PointerEvent): void {
    if (!press || e.pointerId !== press.id) return;
    const p: Pt = { x: e.clientX, y: e.clientY };
    if (!press.far) {
      if (!(Math.hypot(p.x - press.x, p.y - press.y) > TAP_SLOP)) return;
      press.far = true;
      carry();
    }
    // The ball sits in the child's hand: centred on the finger, wherever it goes.
    if (press.ball) press.ball.style.transform = `translate(${p.x - press.cx}px, ${p.y - press.cy}px)`;
  }

  function onUp(e: PointerEvent): void {
    if (!press || e.pointerId !== press.id) return;
    const { far, mode, tube: i, ball } = press;
    const from = selected;
    press = null;
    ball?.classList.remove('held', 'dragging');
    if (!far) {
      // A tap. Picking a ball up already happened on the way down.
      if (mode === 'lower') lower();
      else if (mode === 'move' && from !== null) move(from, i);
      return;
    }
    if (!ball || from === null) return;
    const rects = tubes.map((t) => t.el.getBoundingClientRect());
    const to = tubeAt({ x: e.clientX, y: e.clientY }, rects, (rects[0]?.width ?? 0) * DROP_SLACK);
    if (to >= 0 && to !== from) {
      if (canMove(board, from, to, height)) {
        move(from, to);
        return;
      }
      ctx.audio.boing();
      replay(tubes[to]!.el, 'anim-shake');
    }
    // Let go over nothing (or over a full tube): the ball floats back over its
    // own tube and keeps waiting there.
    ball.style.transform = '';
  }

  function onCancel(e: PointerEvent): void {
    if (!press || e.pointerId !== press.id) return;
    const ball = press.ball;
    press = null;
    if (!ball) return;
    ball.classList.remove('held', 'dragging');
    ball.style.transform = '';
  }

  function deal(): void {
    for (const d of disposers) d();
    disposers = [];
    selected = null;
    press = null;
    const d = dealLevel(level);
    board = d.tubes;
    palette = d.palette;
    height = d.level.height;
    tubes = board.map((colors, i) => {
      const stack = h('div', { class: 'tubes-stack' });
      const el = h('div', { class: 'tubes-tube', 'data-tube': String(i) }, h('div', { class: 'tubes-glass' }), stack);
      const balls = colors.map((c) => makeBall(c));
      stack.append(...balls);
      const down = (e: Event) => onDown(e as PointerEvent, i);
      const moved = (e: Event) => onMove(e as PointerEvent);
      const up = (e: Event) => onUp(e as PointerEvent);
      const cancel = (e: Event) => onCancel(e as PointerEvent);
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', moved);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
      disposers.push(() => {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', moved);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', cancel);
      });
      return { el, stack, balls };
    });
    boardEl.replaceChildren(...tubes.map((t) => t.el));
    root.style.setProperty('--tubes-rows', String(height));
    refresh(false);
    resize();
    ctx.hint.arm(() => {
      if (busy || !alive) return;
      const m = suggestMove(board, height, selected);
      if (!m) return;
      const ball = tubes[m.from]?.balls.at(-1);
      if (ball) replay(ball, 'anim-wiggle');
      const target = tubes[m.to]?.el;
      if (target) replay(target, 'anim-bounce');
    });
  }

  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    window.removeEventListener('resize', onResize);
    for (const d of disposers) d();
    disposers = [];
  });

  deal();
}

const game: GameModule = { ...meta, start };
export default game;
