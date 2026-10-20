import type { ColorDef } from '../../core/content';
import { h, replay } from '../../core/dom';
import { createDragDrop, pickTarget } from '../../core/dragdrop';
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
  let alive = true;
  let baskets: Basket[] = [];
  let balls: HTMLElement[] = [];
  let placed = 0;
  let detach: Array<() => void> = [];

  const board = h('div', { class: 'g-board colors-board' });
  const tray = h('div', { class: 'g-tray colors-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => {
    alive = false;
  });

  // One shared drag-and-drop (core/dragdrop) for every ball; each round attaches its own balls.
  const dd = createDragDrop<HTMLElement>({
    layer: ctx.stage,
    targets: () => baskets.map((k) => ({ id: k.color.id, rect: k.el.getBoundingClientRect() })),
    resolve: (p, t) => pickTarget(p, t, { tolerance: 14 }),
    ghost: (_ball, el) => {
      const g = el.cloneNode(true) as HTMLElement;
      g.classList.remove('anim-wiggle', 'is-carried');
      return g;
    },
    onPickUp: () => ctx.hint.touch(),
    onHover: (id) => baskets.forEach((k) => k.el.classList.toggle('is-hover', k.color.id === id)),
    onDrop(ball, hit) {
      ctx.hint.touch();
      const basket = baskets.find((k) => k.color.id === ball.dataset.color);
      if (!basket || hit !== basket.color.id) {
        ctx.audio.boing();
        return false;
      }
      accept(ball, basket);
      return true;
    },
    ctx,
  });

  function accept(ball: HTMLElement, basket: Basket): void {
    ball.classList.add('placed');
    basket.row.append(ball);
    replay(ball, 'anim-bounce');
    ctx.audio.ding();
    navigator.vibrate?.(15);
    ctx.speak(basket.color.name);
    placed++;
    if (placed === balls.length) {
      ctx.hint.clear();
      void ctx.celebrate().then(() => {
        if (!alive) return;
        ctx.addStar();
        round++;
        play();
      });
    }
  }

  function play(): void {
    detach.forEach((d) => d());
    detach = [];
    const r = makeColorRound(round);
    const many = r.balls.length > 4;
    board.classList.toggle('colors-many', many);
    tray.classList.toggle('colors-many', many);

    baskets = r.baskets.map((color) => {
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

    placed = 0;
    balls = r.balls.map((b) => {
      const ball = h('div', { class: 'g-item colors-ball', 'data-color': b.color.id, 'data-id': String(b.id) });
      ball.append(ballSvg(b.color.hex));
      detach.push(dd.attach(ball, () => (ball.classList.contains('placed') ? null : ball)));
      return ball;
    });
    tray.replaceChildren(...balls);

    ctx.hint.arm(() => {
      const ball = balls.find((x) => !x.classList.contains('placed'));
      if (!ball) return;
      replay(ball, 'anim-wiggle');
      const basket = baskets.find((k) => k.color.id === ball.dataset.color);
      if (basket) replay(basket.el, 'anim-wiggle');
      // Spoken rarely: the shell's quiet-voice gate lets only a few of these through in a row.
      ctx.speak(basket ? `Bỏ vào rổ ${basket.color.name} nào` : 'Bỏ bóng vào rổ cùng màu nào');
    });
    if (round === 0) ctx.speak('Bỏ bóng vào rổ cùng màu nào');
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
