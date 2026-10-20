import type { ColorDef } from '../../core/content';
import { h, replay } from '../../core/dom';
import { createDragDrop, type DragDrop } from '../../core/dragdrop';
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

/**
 * Ball sort. Every tube holds one colour at the end. Pressing a tube anywhere —
 * the glass, a buried ball — takes its top ball out and puts it in the child's
 * hand: let go without moving and it waits above the rim for a tube to be tapped,
 * or drag it straight across. Any tube with room accepts any ball (see `logic.ts`),
 * so the board can never be locked up. Finishing one bumps the level: more balls,
 * more tubes, more colours.
 */
export function startTubes(ctx: GameContext, startLevel = 0): void {
  let level = startLevel;
  /** Balls per colour, and the capacity of one tube. */
  let height = 0;
  let board: Board = [];
  let palette: readonly ColorDef[] = [];
  let tubes: Tube[] = [];
  /** Tube whose top ball is out, waiting for somewhere to go. */
  let selected: number | null = null;
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
    ball.classList.remove('up', 'held', 'dragging', 'away');
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

  /** The ball a pick-up of tube `i` carries, and the tube it comes from. Pure: nothing moves. */
  function carryOf(i: number): { from: number; ball: HTMLElement } | null {
    const own = tubes[i]?.balls.at(-1);
    if (own) return { from: i, ball: own };
    // An empty tube: the ball already waiting in hand (if any) is what the finger takes along.
    const waiting = selected === null ? undefined : tubes[selected]?.balls.at(-1);
    return selected !== null && waiting ? { from: selected, ball: waiting } : null;
  }

  /** The ball in hand while it is carried, so it can be shown again (or flown from the finger). */
  let carried: { from: number; ball: HTMLElement } | null = null;
  let over: HTMLElement | null = null;
  let revealTimer: ReturnType<typeof setTimeout> | null = null;

  function setOver(el: HTMLElement | null): void {
    if (over === el) return;
    over?.classList.remove('over');
    over = el;
    over?.classList.add('over');
  }

  /** The real ball comes back after a drop that went nowhere, floating over its own tube. */
  function reveal(): void {
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = null;
    const c = carried;
    carried = null;
    if (!c) return;
    c.ball.classList.remove('away');
    if (alive && selected === null && tubes[c.from]?.balls.at(-1) === c.ball) lift(c.from);
  }

  function onTap(i: number): void {
    if (!alive || busy) return;
    const t = tubes[i];
    if (!t) return;
    if (selected === null) {
      if (t.balls.length) lift(i);
      else ctx.audio.tick();
    } else if (selected === i) {
      lower();
    } else {
      move(selected, i);
    }
  }

  function onPickUp(i: number): void {
    reveal();
    const c = carryOf(i);
    // A ball was waiting and the finger set off from a different tube: the child changed their
    // mind. Put that one back and take this tube's ball instead.
    if (c && selected !== null && selected !== c.from) lower(true);
    carried = c;
    c?.ball.classList.add('away');
  }

  function onDrop(hit: string | null, p: { x: number; y: number }): boolean {
    const c = carried;
    if (!c) return false;
    const to = hit === null ? -1 : Number(hit);
    if (to >= 0 && to !== c.from) {
      if (canMove(board, c.from, to, height)) {
        // The ball slides into the tube from where the finger let go of it.
        const r = c.ball.getBoundingClientRect();
        c.ball.classList.remove('away');
        c.ball.style.transition = 'none';
        c.ball.style.transform = `translate(${p.x - (r.left + r.width / 2)}px, ${p.y - (r.top + r.height / 2)}px)`;
        carried = null;
        selected = c.from;
        move(c.from, to);
        return true;
      }
      ctx.audio.boing();
      replay(tubes[to]!.el, 'anim-shake');
    }
    // Let go over nothing (or over a full tube): the copy floats home, and the ball waits above its tube.
    return false;
  }

  function onEnd(): void {
    setOver(null);
    if (!carried) return;
    // The copy is gliding back; show the real ball when it lands.
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = setTimeout(reveal, 240);
  }

  const dd: DragDrop<number> = createDragDrop<number>({
    layer: root,
    slop: TAP_SLOP,
    // Every tube's box is read once when the ball is picked up; moving the finger reads no layout.
    targets: () => tubes.map((t, i) => ({ id: String(i), rect: t.el.getBoundingClientRect() })),
    resolve: (p, targets) => {
      const rects = targets.map((t) => t.rect);
      const k = tubeAt(p, rects, (rects[0]?.width ?? 0) * DROP_SLACK);
      return k >= 0 ? targets[k]!.id : null;
    },
    ghost: (i) => {
      const c = carryOf(i);
      return h('div', { class: 'tubes-ghost' }, c ? makeBall(board[c.from]!.at(-1)!) : '');
    },
    onTap: (i) => onTap(i),
    onPickUp: (i) => onPickUp(i),
    onHover: (id) => setOver(id === null ? null : (tubes[Number(id)]?.el ?? null)),
    onDrop: (_i, hit, _el, p) => onDrop(hit, p),
    onEnd,
    ctx,
  });

  function deal(): void {
    for (const d of disposers) d();
    disposers = [];
    reveal();
    selected = null;
    const d = dealLevel(level);
    board = d.tubes;
    palette = d.palette;
    height = d.level.height;
    tubes = board.map((colors, i) => {
      const stack = h('div', { class: 'tubes-stack' });
      const el = h('div', { class: 'tubes-tube', 'data-tube': String(i) }, h('div', { class: 'tubes-glass' }), stack);
      const balls = colors.map((c) => makeBall(c));
      stack.append(...balls);
      // A finished board is celebrated without answering touches.
      disposers.push(dd.attach(el, () => (alive && !busy ? i : null)));
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
      // Rare and gentle: the shell's gate lets only a few of these be spoken while the child sits still.
      ctx.speak('Bé xếp bi cùng màu vào một ống nhé.');
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

function start(ctx: GameContext): void {
  startTubes(ctx);
}

const game: GameModule = { ...meta, start };
export default game;
