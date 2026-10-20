import { h, replay } from '../../core/dom';
import { createDragDrop, pickTarget } from '../../core/dragdrop';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { ANIMALS_PER_ROUND, makeFeedRound } from './logic';
import './style.css';

const EAT_MS = 300;
const SECOND_CHOMP_MS = 180;
const NEXT_MS = 900;
/** A drop this close to the ring (as a share of a food's width) still lands in the mouth. */
const MOUTH_SLACK = 0.35;

/**
 * Feed the animal: drag the food it eats into the ring over its mouth.
 * Five animals per set, then confetti and a star.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let fed = 0;
  /** Animal emojis already shown this session; reset once every animal has appeared. */
  let shown: string[] = [];
  let disposers: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const animal = h('div', { class: 'feed-animal' });
  const mouth = h('div', { class: 'g-target feed-mouth' });
  const board = h('div', { class: 'g-board feed-board' }, h('div', { class: 'feed-scene' }, animal, mouth));
  const tray = h('div', { class: 'g-tray feed-tray' });
  ctx.stage.append(board, tray);

  // Foods are lifted as a light copy that follows the finger on its own layer; the real one stays in the tray.
  const dd = createDragDrop<HTMLElement>({
    layer: ctx.stage,
    // Measured once at pick-up, never while the finger moves.
    targets: () => {
      const r = mouth.getBoundingClientRect();
      const pad = (tray.firstElementChild?.getBoundingClientRect().width ?? 0) * MOUTH_SLACK;
      return [{ id: 'mouth', rect: { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 } }];
    },
    resolve: (p, t) => pickTarget(p, t),
    ghost: (_food, el) => {
      const g = el.cloneNode(true) as HTMLElement;
      g.classList.remove('anim-wiggle', 'anim-bounce', 'anim-pulse', 'anim-pop', 'anim-shake');
      return g;
    },
    onTap: (food) => replay(food, 'anim-bounce'),
    onPickUp: () => mouth.classList.remove('anim-pulse'),
    onHover: (id) => mouth.classList.toggle('feed-over', id !== null),
    onDrop: (food, hit) => {
      mouth.classList.remove('feed-over');
      // Let go away from the mouth: just float back, nothing happened.
      if (hit === null) return false;
      if (food.dataset.emoji !== current?.correct.emoji) {
        replay(animal, 'anim-shake');
        ctx.audio.boing();
        ctx.speak('Không phải món này');
        return false;
      }
      eat(food);
      return true;
    },
    ctx,
  });
  let current: ReturnType<typeof makeFeedRound> | null = null;

  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  }

  function disposeDrags(): void {
    disposers.forEach((d) => d());
    disposers = [];
  }

  ctx.onCleanup(() => {
    alive = false;
    disposeDrags();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  });

  function eat(food: HTMLElement): void {
    // The tray is inert until the next animal arrives.
    disposeDrags();
    ctx.hint.clear();
    // Snap into the mouth, then shrink and fade from there.
    food.classList.add('placed');
    food.style.transform = '';
    mouth.append(food);
    void food.offsetWidth;
    food.classList.add('eaten');
    later(() => food.remove(), EAT_MS);

    ctx.audio.chomp();
    later(() => ctx.audio.chomp(), SECOND_CHOMP_MS);
    replay(animal, 'anim-bounce');
    navigator.vibrate?.(20);
    ctx.speak('Ngon quá!');

    fed++;
    later(() => {
      if (fed < ANIMALS_PER_ROUND) {
        play();
        return;
      }
      fed = 0;
      void ctx.celebrate().then(() => {
        if (!alive) return;
        ctx.addStar();
        play();
      });
    }, NEXT_MS);
  }

  function play(): void {
    disposeDrags();
    const r = makeFeedRound(Math.random, shown);
    current = r;
    // The exclusion is ignored once every animal has been shown: start over.
    if (shown.includes(r.animal.emoji)) shown = [];
    shown.push(r.animal.emoji);

    animal.textContent = r.animal.emoji;
    mouth.classList.remove('anim-pulse', 'feed-over');
    replay(animal, 'anim-bounce');
    ctx.speak(`${r.animal.name} đói rồi`);

    const foods = r.foods.map((item) => {
      const food = h('div', { class: 'g-item feed-food', 'data-emoji': item.emoji }, item.emoji);
      disposers.push(dd.attach(food, () => food));
      return food;
    });
    tray.replaceChildren(...foods);

    ctx.hint.arm(() => {
      if (dd.active) return;
      const correct = foods.find((f) => f.dataset.emoji === r.correct.emoji);
      if (correct) replay(correct, 'anim-wiggle');
      replay(mouth, 'anim-pulse');
      // The speech gate makes this rare: a few times, well apart, until the child touches something.
      ctx.speak(`Cho ${r.animal.name} ăn nào`);
    });
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
