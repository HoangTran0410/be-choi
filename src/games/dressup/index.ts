import { createDragDrop, pickTarget } from '../../core/dragdrop';
import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  CHEER_FIT,
  CHEER_ODD,
  DONE_SAY,
  DRESSED_SAY,
  SLOTS,
  TIDY_SAY,
  dressed,
  fits,
  makeDressRound,
  makeToys,
  type DressRound,
  type Garment,
  type Slot,
} from './logic';
import './style.css';

const HEAD = '🧒';
const HEAD_GIGGLE = '🤣';
const GIGGLE_MS = 900;
/** Breath between the last piece going on and the room changing. */
const DRESSED_MS = 1400;
const TOY_FLY_MS = 500;
const ALL_TIDY_MS = 600;
/** How far outside the child a drop still counts as "on the child". */
const DROP_SLACK = 24;

const SLOT_LABEL: Readonly<Record<Slot, string>> = { hat: 'mũ', top: 'áo', shoes: 'giày' };

function oneOf<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

/**
 * Mặc đồ & dọn đồ: a little friend needs dressing for the weather (or for bed),
 * then the toys on the floor go back in their box.
 *
 * Nothing waits its turn: hat, top and shoes go on in any order, a piece can be
 * swapped or taken off again, and the room only changes once all three are on.
 * There is no wrong piece. A snow coat on a sunny day just makes the friend giggle.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let phase: 'dress' | 'dressed' | 'tidy' | 'done' = 'dress';
  let round: DressRound | null = null;
  let left = 0;
  const worn: Partial<Record<Slot, Garment>> = {};
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const pieceDisposers: Array<() => void> = [];

  const sky = h('div', { class: 'dressup-sky' });
  const head = h('div', { class: 'dressup-head' }, HEAD);
  const slotEls = {} as Record<Slot, HTMLButtonElement>;
  for (const slot of SLOTS) {
    const el = h('button', {
      class: `dressup-slot dressup-slot-${slot}`,
      type: 'button',
      'data-slot': slot,
      'aria-label': `${SLOT_LABEL[slot]} của bạn nhỏ`,
    });
    el.addEventListener('click', () => takeOff(slot));
    slotEls[slot] = el;
  }
  const kid = h('div', { class: 'dressup-kid' }, slotEls.hat, head, slotEls.top, slotEls.shoes);
  const tray = h('div', { class: 'dressup-tray' });
  const floor = h('div', { class: 'dressup-floor' });
  const box = h('div', { class: 'dressup-box' }, '🧺');
  const side = h('div', { class: 'dressup-side' }, tray, floor, box);
  const wrap = h('div', { class: 'dressup', 'data-phase': phase }, sky, kid, side);
  ctx.stage.append(wrap);

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  }

  function dropPieces(): void {
    for (const d of pieceDisposers.splice(0)) d();
  }

  function setPhase(p: typeof phase): void {
    phase = p;
    wrap.dataset.phase = p;
  }

  /** A piece (garment or toy) is acted on by a tap, or by being dropped on `to`. */
  let lastGesture = -Infinity;
  interface Piece {
    to: 'kid' | 'box';
    act: () => void;
  }
  // The piece is lifted as a light copy that follows the finger on its own layer; the real one stays put.
  const dd = createDragDrop<Piece>({
    layer: ctx.stage,
    // Both drop places are measured once at pick-up, never while the finger moves.
    targets: () =>
      [
        { id: 'kid', el: kid, on: phase === 'dress' },
        { id: 'box', el: box, on: phase === 'tidy' },
      ]
        .filter((t) => t.on)
        .map((t) => {
          const r = t.el.getBoundingClientRect();
          return {
            id: t.id,
            rect: { left: r.left - DROP_SLACK, top: r.top - DROP_SLACK, width: r.width + DROP_SLACK * 2, height: r.height + DROP_SLACK * 2 },
          };
        }),
    resolve: (p, t) => pickTarget(p, t),
    ghost: (_p, el) => {
      const g = el.cloneNode(true) as HTMLElement;
      g.setAttribute('aria-hidden', 'true');
      g.classList.remove('anim-wiggle', 'anim-bounce', 'anim-pulse', 'anim-pop', 'anim-shake');
      g.removeAttribute('aria-label');
      return g;
    },
    onTap: (p) => p.act(),
    // However a pointer gesture ends (tap, drop, missed drop, cancel), the click that follows is part of it.
    onEnd: () => {
      lastGesture = Date.now();
    },
    onDrop: (p, hit) => {
      // Nothing is wrong here: a piece let go anywhere else simply glides back.
      if (hit !== p.to) return false;
      p.act();
      return true;
    },
    ctx,
  });

  /** Tap it, or drop it on `to`. The click that follows a pointer gesture is the same gesture. */
  function bindPiece(el: HTMLElement, to: Piece['to'], act: () => void): void {
    const piece: Piece = { to, act };
    const click = (): void => {
      // Keyboard and assistive taps arrive as a bare click.
      if (Date.now() - lastGesture > 500) act();
    };
    el.addEventListener('click', click);
    const stop = dd.attach(el, () => piece);
    pieceDisposers.push(() => {
      el.removeEventListener('click', click);
      stop();
    });
  }

  // ---- dressing ----

  function paintSlot(slot: Slot): void {
    const g = worn[slot];
    const el = slotEls[slot];
    el.textContent = g?.emoji ?? '';
    el.classList.toggle('on', g !== undefined);
    for (const b of tray.querySelectorAll<HTMLElement>(`.dressup-garment[data-slot="${slot}"]`)) {
      b.classList.toggle('worn', g !== undefined && b.dataset.emoji === g.emoji);
    }
  }

  function giggle(): void {
    head.textContent = HEAD_GIGGLE;
    replay(head, 'anim-wiggle');
    later(() => {
      head.textContent = HEAD;
    }, GIGGLE_MS);
  }

  function wear(g: Garment): void {
    if (phase !== 'dress' || !round) return;
    worn[g.slot] = g;
    paintSlot(g.slot);
    replay(slotEls[g.slot], 'anim-bounce');
    navigator.vibrate?.(10);
    if (fits(g, round.scenario)) {
      ctx.audio.ding();
      ctx.speak(oneOf(CHEER_FIT));
    } else {
      // Not the usual thing for today, and that is the funniest part.
      ctx.audio.boing();
      ctx.speak(oneOf(CHEER_ODD));
      giggle();
    }
    if (dressed(worn)) {
      setPhase('dressed');
      ctx.hint.clear();
      later(startTidy, DRESSED_MS);
    } else armHint();
  }

  function takeOff(slot: Slot): void {
    ctx.hint.touch();
    if (phase !== 'dress' || !worn[slot]) return;
    delete worn[slot];
    paintSlot(slot);
    ctx.audio.pop(0.8);
    armHint();
  }

  function armHint(): void {
    ctx.hint.arm(() => {
      if (dd.active) return;
      // The speech gate keeps these few and far between.
      if (phase === 'dress') ctx.speak('Kéo đồ cho bạn nhỏ mặc nhé');
      else if (phase === 'tidy') ctx.speak('Cất đồ chơi vào hộp nhé');
      if (phase === 'dress') {
        const empty = SLOTS.filter((s) => !worn[s]);
        const slot = oneOf(empty.length > 0 ? empty : SLOTS);
        const garments = tray.querySelectorAll(`.dressup-garment[data-slot="${slot}"]`);
        const g = garments[Math.floor(Math.random() * garments.length)];
        if (g) replay(g, 'anim-wiggle');
        replay(slotEls[slot], 'anim-wiggle');
      } else if (phase === 'tidy') {
        const toy = floor.querySelector('.dressup-toy:not(.away)');
        if (toy) replay(toy, 'anim-wiggle');
      }
    });
  }

  function showRound(): void {
    dropPieces();
    round = makeDressRound(Math.random, round?.scenario.id);
    for (const slot of SLOTS) delete worn[slot];
    for (const slot of SLOTS) paintSlot(slot);
    head.textContent = HEAD;
    sky.textContent = round.scenario.icon;
    sky.dataset.scenario = round.scenario.id;
    replay(sky, 'anim-bounce');
    tray.replaceChildren();
    floor.replaceChildren();
    for (const slot of SLOTS) {
      const row = h('div', { class: 'dressup-row', 'data-slot': slot });
      for (const g of round.offers[slot]) {
        const b = h(
          'button',
          { class: 'dressup-garment', type: 'button', 'data-slot': slot, 'data-emoji': g.emoji, 'aria-label': g.name },
          g.emoji,
        );
        bindPiece(b, 'kid', () => wear(g));
        row.append(b);
      }
      tray.append(row);
    }
    setPhase('dress');
    ctx.speak(round.scenario.say);
    armHint();
  }

  // ---- tidying ----

  function startTidy(): void {
    dropPieces();
    setPhase('tidy');
    ctx.speak(DRESSED_SAY);
    later(() => ctx.speak(TIDY_SAY), 1800);
    const toys = makeToys();
    left = toys.length;
    for (const t of toys) {
      const el = h('button', { class: 'dressup-toy', type: 'button', 'aria-label': 'đồ chơi' }, t);
      bindPiece(el, 'box', () => tidy(el));
      floor.append(el);
    }
    armHint();
  }

  function tidy(toy: HTMLElement): void {
    if (phase !== 'tidy' || toy.classList.contains('away')) return;
    const from = toy.getBoundingClientRect();
    const to = box.getBoundingClientRect();
    toy.style.setProperty('--dx', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    toy.style.setProperty('--dy', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    toy.classList.add('away');
    ctx.audio.pop();
    navigator.vibrate?.(10);
    ctx.hint.touch();
    left--;
    later(() => {
      toy.remove();
      replay(box, 'anim-bounce');
      ctx.audio.tick();
      if (left === 0) later(() => void allTidy(), ALL_TIDY_MS);
    }, TOY_FLY_MS);
  }

  async function allTidy(): Promise<void> {
    if (phase !== 'tidy') return;
    setPhase('done');
    ctx.hint.clear();
    ctx.audio.ding();
    ctx.speak(DONE_SAY);
    await ctx.celebrate();
    ctx.addStar();
    if (!alive) return;
    showRound();
  }

  ctx.onCleanup(() => {
    alive = false;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    dropPieces();
  });

  showRound();
}

const game: GameModule = { ...meta, start };
export default game;
