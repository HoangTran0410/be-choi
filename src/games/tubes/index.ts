import type { ColorDef } from '../../core/content';
import { h, replay } from '../../core/dom';
import { makeDraggable, type Pt } from '../../core/drag';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { bestLayout, canMove, dealLevel, isSolved, isTubeDone, suggestMove, tubeAt, type Board } from './logic';
import './style.css';

/** A press that travels less than this many px is a tap, not a drag. */
const TAP_SLOP = 10;
/** How far outside a tube a ball may be let go and still fall in, in tube widths. */
const DROP_SLACK = 0.6;

interface Tube {
  el: HTMLElement;
  /** Holds the ball elements, bottom first — the same order as `board[i]`. */
  stack: HTMLElement;
  balls: HTMLElement[];
}

/**
 * Ball sort. Every tube holds one colour at the end; a tap lifts the top ball out
 * of its tube and a tap on another tube sends it over, or the child simply drags
 * it across. Any tube with room accepts any ball (see `logic.ts`), so the board
 * can never be locked up — the only way through is to keep sorting. Finishing a
 * board bumps the level: more balls, more tubes, more colours.
 */
function start(ctx: GameContext): void {
  let level = 0;
  /** Balls per colour, and the capacity of one tube. */
  let height = 0;
  let board: Board = [];
  let palette: readonly ColorDef[] = [];
  let tubes: Tube[] = [];
  /** Tube whose top ball is lifted out, waiting for somewhere to go. */
  let selected: number | null = null;
  /** The lifted ball was already up when this press began: a tap puts it back down. */
  let wasUp = false;
  /** Where the press started, to tell a tap from a drag. */
  let down: Pt = { x: 0, y: 0 };
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
    const el = h('div', { class: 'tubes-ball', 'data-color': colorId, style: `--tubes-c:${colorOf(colorId)?.hex ?? '#ef4444'}` });
    el.addEventListener('transitionend', () => el.classList.remove('flying'));
    disposers.push(makeDraggable(el, { onDrop: (ball, p) => drop(ball, p) }));
    return el;
  }

  /**
   * Move a ball's element into `stack`, sliding it there from wherever it is on
   * screen right now (the tube it came from, or the child's fingertip).
   */
  function fly(ball: HTMLElement, stack: HTMLElement): void {
    const from = ball.getBoundingClientRect();
    ball.classList.remove('up', 'flying', 'spring-back');
    ball.style.transition = 'none';
    ball.style.transform = '';
    delete ball.dataset.dx;
    delete ball.dataset.dy;
    stack.append(ball);
    const to = ball.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    ball.style.transition = '';
    if (!dx && !dy) return;
    ball.style.transform = `translate(${dx}px, ${dy}px)`;
    // Commit that starting frame, then let the class transition it back to zero.
    void ball.offsetWidth;
    ball.classList.add('flying');
    ball.style.transform = '';
  }

  function lift(i: number): void {
    const ball = tubes[i]?.balls.at(-1);
    if (!ball) return;
    selected = i;
    ball.classList.add('up');
    ctx.audio.pop(1.4);
  }

  function lower(): void {
    if (selected === null) return;
    tubes[selected]?.balls.at(-1)?.classList.remove('up');
    selected = null;
    ctx.audio.tick();
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

  /** Only a top ball can be picked up, and a full one-colour tube shines. */
  function refresh(announce = true): void {
    tubes.forEach((t, i) => {
      const top = t.balls.length - 1;
      t.balls.forEach((b, j) => b.classList.toggle('placed', j !== top));
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

  /** Pointer down on a tube. Runs before the ball's own drag handler (capture phase). */
  function press(e: PointerEvent, i: number): void {
    if (!alive || busy) {
      e.stopPropagation();
      return;
    }
    down = { x: e.clientX, y: e.clientY };
    if (selected === null) {
      wasUp = false;
      if (!tubes[i]?.balls.length) {
        ctx.audio.tick();
        return;
      }
      // Lift the top ball out and let go of the event: the same press may become a drag.
      lift(i);
      return;
    }
    if (selected === i) {
      wasUp = true;
      // The press landed on the glass or on a buried ball, so no drag can start
      // from it: this is the tap that puts the lifted ball back down.
      if (e.target !== tubes[i]?.balls.at(-1)) lower();
      return;
    }
    // A ball is already in hand and another tube was tapped: send it over, and
    // keep the press away from that tube's own top ball.
    e.stopPropagation();
    e.preventDefault();
    move(selected, i);
  }

  /** Pointer up after dragging a ball (or after a tap that never moved). */
  function drop(ball: HTMLElement, p: Pt): boolean {
    if (!alive || busy) return false;
    const from = tubes.findIndex((t) => t.balls.at(-1) === ball);
    if (from < 0) return false;
    if (!(Math.hypot(p.x - down.x, p.y - down.y) > TAP_SLOP)) {
      // A tap: the first one lifted the ball (in `press`), a second one puts it back.
      if (wasUp) lower();
      return false;
    }
    const rects = tubes.map((t) => t.el.getBoundingClientRect());
    const to = tubeAt(p, rects, (rects[0]?.width ?? 0) * DROP_SLACK);
    // Let go over nothing and the ball stays up in the child's hand.
    if (to < 0 || to === from) return false;
    if (!canMove(board, from, to, height)) {
      ctx.audio.boing();
      replay(tubes[to]!.el, 'anim-shake');
      return false;
    }
    // The drag machinery is still holding this element: move it once it has let go.
    queueMicrotask(() => {
      if (alive) move(from, to);
    });
    return true;
  }

  function deal(): void {
    for (const d of disposers) d();
    disposers = [];
    selected = null;
    wasUp = false;
    const d = dealLevel(level);
    board = d.tubes;
    palette = d.palette;
    height = d.level.height;
    tubes = board.map((colors, i) => {
      const stack = h('div', { class: 'tubes-stack' });
      const el = h('div', { class: 'tubes-tube', 'data-tube': String(i) }, h('div', { class: 'tubes-glass' }), stack);
      const balls = colors.map((c) => makeBall(c));
      stack.append(...balls);
      const onDown = (e: Event) => press(e as PointerEvent, i);
      el.addEventListener('pointerdown', onDown, { capture: true });
      disposers.push(() => el.removeEventListener('pointerdown', onDown, { capture: true }));
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
