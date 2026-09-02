import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { makeCountRound, minDistFor, numberWord } from './logic';
import './style.css';

/** Pause between the total appearing and the celebration. */
const TOTAL_MS = 700;

/**
 * Counting: a few of the same fruit are scattered on the board. Tapping each
 * one numbers it and says the number aloud; when all are counted the total
 * bounces in, then a new round starts with a different fruit.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let lastEmoji: string | undefined;
  let alive = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const board = h('div', { class: 'count' });
  ctx.stage.append(board);
  ctx.onCleanup(() => {
    alive = false;
    timers.forEach((t) => clearTimeout(t));
  });

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  /** On-screen width of one fruit (0 in jsdom), so fruits never overlap on short boards. */
  function fruitPx(): number {
    const probe = h('div', { class: 'g-item count-fruit' });
    board.append(probe);
    const px = probe.offsetWidth;
    probe.remove();
    return px;
  }

  function play(): void {
    const minDist = minDistFor(board.clientWidth, board.clientHeight, fruitPx());
    const r = makeCountRound(round, Math.random, lastEmoji, minDist);
    lastEmoji = r.item.emoji;
    let counted = 0;

    const fruits = r.positions.map((p) => {
      const fruit = h(
        'div',
        { class: 'g-item count-fruit', style: `left:${(p.x * 100).toFixed(2)}%;top:${(p.y * 100).toFixed(2)}%` },
        h('span', { class: 'count-emoji' }, r.item.emoji),
      );
      fruit.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        replay(fruit, 'anim-bounce');
        if (fruit.classList.contains('counted')) return;
        counted++;
        const n = counted;
        fruit.classList.add('counted');
        fruit.append(h('span', { class: 'count-badge' }, String(n)));
        ctx.audio.pop(1 + n * 0.12);
        navigator.vibrate?.(10);
        ctx.speak(numberWord(n));
        if (n === r.count) finish();
      });
      return fruit;
    });
    board.replaceChildren(...fruits);
    ctx.speak(`Đếm ${r.item.name} nào!`);

    ctx.hint.arm(() => {
      const next = fruits.find((f) => !f.classList.contains('counted'));
      if (next) replay(next, 'anim-wiggle');
    });

    function finish(): void {
      ctx.hint.clear();
      const total = h('div', { class: 'count-total' }, h('span', { class: 'count-total-num' }, String(r.count)));
      board.append(total);
      replay(total, 'anim-bounce');
      ctx.speak(`Có ${numberWord(r.count)} ${r.item.name}`);
      later(() => {
        void ctx.celebrate().then(() => {
          if (!alive) return;
          ctx.addStar();
          round++;
          play();
        });
      }, TOTAL_MS);
    }
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
