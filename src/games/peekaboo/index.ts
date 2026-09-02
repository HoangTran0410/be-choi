import { h, randInt, replay, shuffle } from '../../core/dom';
import type { Item } from '../../core/content';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  FIND_AFTER,
  HIDE_SWAP_MS,
  PEEK_HOLD_MS,
  PEEK_MS,
  REVEAL_MS,
  SHUFFLE_MS,
  STAR_EVERY,
  VOICE_MS,
  WIN_MS,
  makeSpots,
  pickAnimals,
  pickTarget,
  rollSurprise,
  voiceOf,
  type Surprise,
} from './logic';
import './style.css';

const SPOT_COUNT = 4;
const FREE_LINE = 'Ai đang trốn ở đây nhỉ?';

interface LiveSpot {
  el: HTMLElement;
  hider: HTMLElement;
  peek: HTMLElement;
  item: Item;
}

/**
 * Ú oà. Two ways to play, alternating so it never settles into one trick:
 *
 * - free play — four boxes, each opening its own way (a lid lifts, a door swings,
 *   a cloud drifts). Tap one and the animal jumps out *in front* of the box, says
 *   its own sound and is named. Now and then a box holds a surprise instead.
 * - find a friend — after a few taps the game names one animal, every box lets a
 *   sliver of its animal peek out, and the boxes slide to new places. Finding the
 *   right one wins the star; a wrong box is still a friendly animal, never a loss.
 */
function start(ctx: GameContext): void {
  const questFace = h('span', { class: 'peekaboo-quest-face' }, meta.icon);
  const questText = h('span', { class: 'peekaboo-quest-text' }, FREE_LINE);
  const quest = h('div', { class: 'peekaboo-quest' }, questFace, questText);
  const grid = h('div', { class: 'peekaboo-grid' });
  const board = h('div', { class: 'peekaboo' }, quest, grid);
  ctx.stage.append(board);

  let alive = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }
  ctx.onCleanup(() => {
    alive = false;
    for (const id of timers) clearTimeout(id);
    timers.clear();
  });

  let reveals = 0;
  let sinceFind = 0;
  /** Non-null while the child is looking for one particular animal. */
  let target: Item | null = null;
  /** Taps are ignored while the round is changing over. */
  let locked = false;

  const spots: LiveSpot[] = makeSpots(SPOT_COUNT).map((spec, i) => {
    const peek = h('span', { class: 'peekaboo-peek' }, spec.item.emoji);
    const hider = h('span', { class: 'peekaboo-hider' }, spec.hider.emoji);
    const el = h('button', { class: 'peekaboo-spot', type: 'button', 'data-open': spec.hider.open }, peek, hider);
    // Half the animals peek round the left edge, half round the right.
    el.style.setProperty('--peek-x', i % 2 ? '1' : '-1');
    const spot: LiveSpot = { el, hider, peek, item: spec.item };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      reveal(spot);
    });
    grid.append(el);
    return spot;
  });

  const isOpen = (s: LiveSpot): boolean => s.el.classList.contains('open');

  function setItem(spot: LiveSpot, item: Item): void {
    spot.item = item;
    spot.peek.textContent = item.emoji;
  }

  function reveal(spot: LiveSpot): void {
    if (locked || isOpen(spot)) return;
    spot.el.classList.remove('peeking');
    spot.el.classList.add('open');
    replay(spot.el, 'anim-bounce');
    navigator.vibrate?.(10);
    ctx.audio.pop();

    // Only free play hides surprises: a find round must hold the animal it promised.
    const surprise = target ? null : rollSurprise();
    if (surprise) {
      spot.el.classList.add('surprise');
      burst(spot, surprise);
      ctx.audio.fx(surprise.fx);
      ctx.speak(surprise.say);
    } else {
      later(() => ctx.audio.fx(voiceOf(spot.item)), VOICE_MS);
      if (target) {
        if (spot.item.emoji === target.emoji) {
          win(spot);
          return;
        }
        // A wrong box is never a loss: it is just another friend saying hello.
        ctx.speak(`${spot.item.name}! Không phải rồi.`);
      } else {
        ctx.speak(`Ú oà! ${spot.item.name}`);
      }
    }

    if (!target) {
      reveals++;
      sinceFind++;
      if (reveals % STAR_EVERY === 0) award(spot);
    }
    later(() => hide(spot), REVEAL_MS);
  }

  /** The child found the animal that was asked for. */
  function win(spot: LiveSpot): void {
    locked = true;
    target = null;
    ctx.speak(`Đúng rồi! ${spot.item.name} đây rồi!`);
    later(() => {
      if (!alive) return;
      void ctx.celebrate().then(() => {
        if (!alive) return;
        ctx.addStar();
        spot.el.classList.remove('open');
        later(startFree, HIDE_SWAP_MS);
      });
    }, WIN_MS);
  }

  function hide(spot: LiveSpot): void {
    spot.el.classList.remove('open', 'surprise');
    // Swap the animal once the peek has slid back out of view.
    later(() => {
      if (!alive || target) return;
      setItem(spot, pickFresh());
      if (sinceFind >= FIND_AFTER && !locked && spots.every((s) => !isOpen(s))) startFind();
    }, HIDE_SWAP_MS);
  }

  /** An animal none of the boxes is holding, so the four stay tellable apart. */
  function pickFresh(): Item {
    const taken = new Set(spots.map((s) => s.item.emoji));
    const fresh = pickAnimals(SPOT_COUNT + 1).filter((a) => !taken.has(a.emoji));
    return fresh[0] ?? pickAnimals(1)[0]!;
  }

  function startFind(): void {
    sinceFind = 0;
    const items = pickAnimals(SPOT_COUNT);
    spots.forEach((s, i) => setItem(s, items[i]!));
    target = pickTarget(items);
    board.classList.add('finding');
    questFace.textContent = target.emoji;
    questText.textContent = `Tìm ${target.name}!`;
    ctx.speak(`${target.name} trốn ở đâu nhỉ?`);
    slideAround();
  }

  function startFree(): void {
    target = null;
    locked = false;
    board.classList.remove('finding');
    questFace.textContent = meta.icon;
    questText.textContent = FREE_LINE;
    const items = pickAnimals(SPOT_COUNT);
    spots.forEach((s, i) => setItem(s, items[i]!));
  }

  /** Shuffle the boxes into new places, animated from where they were (FLIP). */
  function slideAround(): void {
    const before = new Map(spots.map((s) => [s, s.el.getBoundingClientRect()]));
    const order = shuffle(spots);
    grid.replaceChildren(...order.map((s) => s.el));
    locked = true;
    for (const s of order) {
      const from = before.get(s)!;
      const to = s.el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (!dx && !dy) continue;
      s.el.style.transition = 'none';
      s.el.style.transform = `translate(${dx}px, ${dy}px)`;
      void s.el.offsetWidth;
      s.el.style.transition = `transform ${SHUFFLE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      s.el.style.transform = '';
    }
    later(() => {
      for (const s of order) {
        s.el.style.transition = '';
        s.el.style.transform = '';
      }
      locked = false;
    }, SHUFFLE_MS);
  }

  function award(spot: LiveSpot): void {
    ctx.addStar();
    ctx.audio.jingle();
    const x = spot.el.offsetLeft + spot.el.offsetWidth / 2;
    const y = spot.el.offsetTop + spot.el.offsetHeight / 2;
    const star = h('div', { class: 'peekaboo-star', style: `left:${x}px;top:${y}px` }, '⭐');
    board.append(star);
    later(() => star.remove(), 900);
  }

  /** A little fan of emoji flying out of the box. */
  function burst(spot: LiveSpot, s: Surprise): void {
    const x = spot.el.offsetLeft + spot.el.offsetWidth / 2;
    const y = spot.el.offsetTop + spot.el.offsetHeight / 2;
    for (let i = 0; i < s.count; i++) {
      const spread = ((i - (s.count - 1) / 2) / Math.max(1, s.count - 1)) * 120;
      const angle = ((-90 + spread) * Math.PI) / 180;
      const dist = 90 + Math.random() * 70;
      const bit = h('span', { class: 'peekaboo-burst' }, s.emoji);
      bit.style.cssText = `left:${x}px;top:${y}px`;
      bit.style.setProperty('--dx', `${Math.round(Math.cos(angle) * dist)}px`);
      bit.style.setProperty('--dy', `${Math.round(Math.sin(angle) * dist)}px`);
      bit.style.setProperty('--rot', `${randInt(-60, 60)}deg`);
      bit.style.setProperty('--delay', `${i * 70}ms`);
      board.append(bit);
      later(() => bit.remove(), 1200 + i * 70);
    }
  }

  /** Closed boxes peek by themselves, so a waiting child always has something to chase. */
  function peekLoop(): void {
    later(() => {
      if (!alive) return;
      if (!target && !locked) {
        const idle = spots.filter((s) => !isOpen(s) && !s.el.classList.contains('peeking'));
        const spot = idle[randInt(0, idle.length - 1)];
        if (spot) showPeek(spot);
      }
      peekLoop();
    }, PEEK_MS);
  }

  function showPeek(spot: LiveSpot): void {
    spot.el.classList.add('peeking');
    replay(spot.hider, 'anim-wiggle');
    later(() => spot.el.classList.remove('peeking'), PEEK_HOLD_MS);
  }

  peekLoop();

  ctx.hint.arm(() => {
    // In a find round the hint points at the animal being looked for.
    const pool = target
      ? spots.filter((s) => s.item.emoji === target?.emoji)
      : spots.filter((s) => !isOpen(s));
    const spot = pool[randInt(0, pool.length - 1)];
    if (!spot) return;
    replay(spot.el, 'anim-wiggle');
    if (!isOpen(spot)) showPeek(spot);
  });
}

const game: GameModule = { ...meta, start };
export default game;
