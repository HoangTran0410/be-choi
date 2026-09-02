import type { ColorDef } from '../../core/content';
import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable } from '../../core/drag';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { ballSvg, basketSvg, makeColorRound } from './logic';
import './style.css';

interface Basket {
  color: ColorDef;
  el: HTMLElement;
  /** Row inside the basket where accepted balls are collected. */
  row: HTMLElement;
}

/**
 * Colour sorting: drag each ball into the basket of the same colour.
 * Two balls per basket; 2 baskets for the first two rounds, then 3.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let disposers: Array<() => void> = [];

  const board = h('div', { class: 'g-board colors-board' });
  const tray = h('div', { class: 'g-tray colors-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => disposers.forEach((d) => d()));

  function play(): void {
    disposers.forEach((d) => d());
    disposers = [];
    const r = makeColorRound(round);
    const many = r.balls.length > 4;
    board.classList.toggle('colors-many', many);
    tray.classList.toggle('colors-many', many);

    const baskets: Basket[] = r.baskets.map((color) => {
      const row = h('div', { class: 'colors-basket-balls' });
      const el = h('div', {
        class: 'g-target colors-basket',
        'data-color': color.id,
        style: `--colors-c:${color.hex}`,
      });
      el.append(basketSvg(color.hex), row);
      return { color, el, row };
    });
    board.replaceChildren(...baskets.map((b) => b.el));

    let placed = 0;
    const balls = r.balls.map((b) => {
      const ball = h('div', { class: 'g-item colors-ball', 'data-color': b.color.id, 'data-id': String(b.id) });
      ball.append(ballSvg(b.color.hex));
      disposers.push(
        makeDraggable(ball, {
          onDrop(el, p) {
            const targets = baskets.map((k) => ({ id: k.color.id, rect: k.el.getBoundingClientRect() }));
            const tolerance = el.getBoundingClientRect().width * 0.25;
            const hit = hitTest(p, targets, tolerance);
            if (hit !== b.color.id) {
              ctx.audio.boing();
              return false;
            }
            const basket = baskets.find((k) => k.color.id === b.color.id);
            if (!basket) return false;
            accept(el, basket);
            return true;
          },
        }),
      );
      return ball;
    });
    tray.replaceChildren(...balls);

    function accept(ball: HTMLElement, basket: Basket): void {
      ball.classList.add('placed');
      ball.style.transform = '';
      basket.row.append(ball);
      replay(ball, 'anim-bounce');
      ctx.audio.ding();
      navigator.vibrate?.(15);
      ctx.speak(basket.color.name);
      placed++;
      if (placed === balls.length) {
        ctx.hint.clear();
        void ctx.celebrate().then(() => {
          ctx.addStar();
          round++;
          play();
        });
      }
    }

    ctx.hint.arm(() => {
      const ball = balls.find((x) => !x.classList.contains('placed'));
      if (!ball) return;
      replay(ball, 'anim-wiggle');
      const basket = baskets.find((k) => k.color.id === ball.dataset.color);
      if (basket) replay(basket.el, 'anim-wiggle');
    });
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
