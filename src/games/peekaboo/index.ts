import { h, replay } from '../../core/dom';
import type { Item } from '../../core/content';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { makeSpots, nextAnimal, REVEAL_MS, STAR_EVERY } from './logic';
import './style.css';

const SPOT_COUNT = 4;

interface LiveSpot {
  el: HTMLElement;
  hider: HTMLElement;
  peek: HTMLElement;
  item: Item;
}

/**
 * Peekaboo: four hiding spots, each with an animal tucked behind. Tap one and
 * the animal pops out and is named; it hides again and a new animal moves in.
 * No rounds, a star every 6 reveals.
 */
function start(ctx: GameContext): void {
  const board = h('div', { class: 'peekaboo' });
  ctx.stage.append(board);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }
  ctx.onCleanup(() => {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  });

  let reveals = 0;

  const spots: LiveSpot[] = makeSpots(SPOT_COUNT).map((spec) => {
    const peek = h('span', { class: 'peekaboo-peek' }, spec.item.emoji);
    const hider = h('span', { class: 'peekaboo-hider' }, spec.hider);
    const el = h('button', { class: 'peekaboo-spot', type: 'button' }, peek, hider);
    const spot: LiveSpot = { el, hider, peek, item: spec.item };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      reveal(spot);
    });
    board.append(el);
    return spot;
  });

  function reveal(spot: LiveSpot): void {
    if (spot.el.classList.contains('open')) return;
    spot.el.classList.add('open');
    replay(spot.hider, 'anim-bounce');
    ctx.audio.pop();
    navigator.vibrate?.(10);
    ctx.speak(`Ú oà! ${spot.item.name}`);

    reveals++;
    if (reveals % STAR_EVERY === 0) {
      ctx.addStar();
      ctx.audio.jingle();
      const x = spot.el.offsetLeft + spot.el.offsetWidth / 2;
      const y = spot.el.offsetTop + spot.el.offsetHeight / 2;
      const star = h('div', { class: 'peekaboo-star', style: `left:${x}px;top:${y}px` }, '⭐');
      board.append(star);
      later(() => star.remove(), 900);
    }

    later(() => hide(spot), REVEAL_MS);
  }

  function hide(spot: LiveSpot): void {
    spot.el.classList.remove('open');
    // Swap the animal once the peek has slid back out of view.
    later(() => {
      spot.item = nextAnimal(spot.item);
      spot.peek.textContent = spot.item.emoji;
    }, 300);
  }

  ctx.hint.arm(() => {
    const closed = spots.filter((s) => !s.el.classList.contains('open'));
    const target = closed[Math.floor(Math.random() * closed.length)];
    if (target) replay(target.el, 'anim-wiggle');
  });
}

const game: GameModule = { ...meta, start };
export default game;
