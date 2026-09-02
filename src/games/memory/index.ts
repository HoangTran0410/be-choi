import { h, randInt, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { type Card, FLIP_BACK_MS, isMatch, makeDeck, pairCount } from './logic';
import './style.css';

const PASTELS = ['#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8', '#a5f3fc'];

interface Slot {
  card: Card;
  el: HTMLElement;
}

function faceDown(s: Slot): boolean {
  return !s.el.classList.contains('flipped') && !s.el.classList.contains('matched');
}

/**
 * Memory: tap two cards; a matching pair stays face-up, a miss flips back.
 * Rounds grow from 2 to 4 pairs. No wrong-answer sound, only the flip.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const board = h('div', { class: 'memory' });
  const grid = h('div', { class: 'memory-cards' });
  board.append(grid);
  ctx.stage.append(board);
  ctx.onCleanup(() => {
    disposed = true;
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  });

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  function play(): void {
    const pairs = pairCount(round);
    grid.dataset.pairs = String(pairs);

    let open: Slot[] = [];
    let matched = 0;

    const slots: Slot[] = makeDeck(pairs).map((card, i) => {
      const el = h(
        'button',
        { class: 'memory-card', type: 'button', style: `--memory-pastel:${PASTELS[i % PASTELS.length]}` },
        h(
          'div',
          { class: 'memory-card-inner' },
          h('div', { class: 'memory-card-front' }, '❓'),
          h('div', { class: 'memory-card-back' }, card.item.emoji),
        ),
      );
      const slot: Slot = { card, el };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        flip(slot);
      });
      return slot;
    });
    grid.replaceChildren(...slots.map((s) => s.el));

    function flip(slot: Slot): void {
      if (open.length >= 2 || !faceDown(slot)) return;
      ctx.audio.tick();
      slot.el.classList.add('flipped');
      open.push(slot);
      const [a, b] = open;
      if (!a || !b) return;

      if (isMatch(a.card, b.card)) {
        open = [];
        a.el.classList.add('matched');
        b.el.classList.add('matched');
        ctx.audio.ding();
        navigator.vibrate?.(15);
        ctx.speak(a.card.item.name);
        matched++;
        if (matched === pairs) {
          ctx.hint.clear();
          void ctx.celebrate().then(() => {
            if (disposed) return;
            ctx.addStar();
            round++;
            play();
          });
        }
        return;
      }

      later(() => {
        a.el.classList.remove('flipped');
        b.el.classList.remove('flipped');
        ctx.audio.pop(0.8);
        open = [];
      }, FLIP_BACK_MS);
    }

    ctx.hint.arm(() => {
      const down = slots.filter(faceDown);
      if (down.length === 0) return;
      const single = open.length === 1 ? open[0] : undefined;
      const partner = single ? down.find((s) => s.card.item.emoji === single.card.item.emoji) : undefined;
      const target = partner ?? down[randInt(0, down.length - 1)];
      if (target) replay(target.el, 'anim-wiggle');
    });
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
