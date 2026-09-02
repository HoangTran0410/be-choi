import { h, randInt, replay } from '../../core/dom';
import { centerOf, hitTest, makeDraggable, type Pt } from '../../core/drag';
import type { Item } from '../../core/content';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { EATERS, makeCookRound, STIR_TURNS, turnDelta, type Recipe } from './logic';
import './style.css';

type Phase = 'add' | 'stir' | 'cook' | 'serve';

/** Shrink-into-the-pot animation before the ingredient is removed. */
const PLACE_MS = 350;
/** Pause after the last ingredient's name before "stir it" is spoken. */
const STIR_DELAY_MS = 900;
/** How long the stove heats before the dish is done. */
const COOK_MS = 2500;
/** Steam puff + tick cadence while cooking. */
const STEAM_MS = 300;
/** Lifetime of a bubble / spark / steam particle. */
const PARTICLE_MS = 900;
const CHOMPS = 3;
const CHOMP_MS = 300;
/** After the last chomp, before the celebration. */
const CELEBRATE_DELAY_MS = 100;
/** How long the hint spoon stays on the tool. */
const HINT_SPOON_MS = 1100;
/** Floating-point slack when counting whole turns. */
const TURN_EPS = 1e-6;

/**
 * Cooking: follow a picture recipe. Drop the ingredients into the pot, stir
 * with a finger, fire up the stove, then serve the dish to a hungry friend.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let phase: Phase = 'add';
  let round = 0;
  let recipe: Recipe | null = null;
  const added = new Set<string>();
  /** Tray element per ingredient emoji, for hints. */
  const trayItems = new Map<string, HTMLElement>();
  let turns = 0;
  let turnMark = 0;
  let stirPointer: number | null = null;
  let stirPrev: Pt | null = null;
  let cooking = false;
  let disposers: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();

  const cardDish = h('div', { class: 'cooking-card-dish' });
  const needs = h('div', { class: 'cooking-needs' });
  const card = h('div', { class: 'cooking-card' }, cardDish, needs);

  const tool = h('div', { class: 'cooking-tool' });
  const bowl = h('div', { class: 'g-target cooking-bowl' });
  // Ingredients stay visible inside the pot until the dish is ready (a child must see what went in).
  const inside = h('div', { class: 'cooking-inside' });
  const pot = h('div', { class: 'cooking-pot' }, tool, inside, bowl);
  const dots = Array.from({ length: STIR_TURNS }, () => h('span', { class: 'cooking-dot' }));
  const progress = h('div', { class: 'cooking-progress' }, ...dots);
  const stove = h('button', { class: 'cooking-stove', type: 'button', hidden: true, 'aria-label': 'Bật bếp' }, '🔥');
  const toolWrap = h('div', { class: 'cooking-tool-wrap' }, pot, progress, stove);

  const spoon = h('div', { class: 'cooking-spoon', hidden: true }, '🥄');
  const dish = h('div', { class: 'cooking-dish', hidden: true });
  const eaterFace = h('div', { class: 'cooking-eater-face' });
  const mouth = h('div', { class: 'g-target cooking-mouth' });
  const eaterBody = h('div', { class: 'cooking-eater-body' }, eaterFace, mouth);
  const eater = h('div', { class: 'cooking-eater', hidden: true }, eaterBody);
  const scene = h('div', { class: 'cooking-scene' }, toolWrap, eater, dish, spoon);
  const tray = h('div', { class: 'g-tray cooking-tray' });
  const wrap = h('div', { class: 'cooking' }, card, scene, tray);
  ctx.stage.append(wrap);

  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  }

  function every(fn: () => void, ms: number): () => void {
    const id = setInterval(() => {
      if (alive) fn();
    }, ms);
    intervals.add(id);
    return () => {
      clearInterval(id);
      intervals.delete(id);
    };
  }

  function disposeDrags(): void {
    disposers.forEach((d) => d());
    disposers = [];
  }

  /** Client coords → coords inside the scene. */
  function local(p: Pt): Pt {
    const r = scene.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  }

  function over(el: HTMLElement, p: Pt, target: HTMLElement): boolean {
    const tolerance = el.getBoundingClientRect().width * 0.35;
    return hitTest(p, [{ id: 't', rect: target.getBoundingClientRect() }], tolerance) !== null;
  }

  /** A bubble, spark or steam puff rising out of the tool. */
  function particle(kind: 'bubble' | 'spark' | 'steam'): void {
    const dx = Math.round((Math.random() - 0.5) * 60);
    const el = h('span', {
      class: `cooking-particle cooking-${kind}`,
      style: `--cooking-dx:${dx}%;animation-duration:${PARTICLE_MS}ms`,
    });
    if (kind === 'spark') el.textContent = '⚡';
    if (kind === 'steam') el.textContent = '💨';
    pot.append(el);
    later(() => el.remove(), PARTICLE_MS);
  }

  function showSpoon(p: Pt): void {
    const l = local(p);
    spoon.style.left = `${l.x}px`;
    spoon.style.top = `${l.y}px`;
    spoon.hidden = false;
  }

  function hideSpoon(): void {
    spoon.hidden = true;
    stirPointer = null;
    stirPrev = null;
  }

  function armHint(): void {
    ctx.hint.arm(() => {
      if (!alive || !recipe) return;
      switch (phase) {
        case 'add': {
          const next = recipe.ingredients.find((i) => !added.has(i.emoji));
          const el = next ? trayItems.get(next.emoji) : undefined;
          if (el && !el.classList.contains('dragging')) replay(el, 'anim-wiggle');
          bowl.classList.add('anim-pulse');
          break;
        }
        case 'stir': {
          if (stirPointer !== null) return;
          replay(tool, 'anim-wiggle');
          const c = centerOf(tool);
          showSpoon(c);
          replay(spoon, 'anim-wiggle');
          later(() => {
            if (stirPointer === null) spoon.hidden = true;
          }, HINT_SPOON_MS);
          break;
        }
        case 'cook':
          replay(stove, 'anim-wiggle');
          break;
        case 'serve':
          if (!dish.classList.contains('dragging')) replay(dish, 'anim-wiggle');
          mouth.classList.add('anim-pulse');
          break;
      }
    });
  }

  // ---- phase 1: add ingredients ----

  function addIngredient(el: HTMLElement, item: Item): void {
    if (!recipe) return;
    added.add(item.emoji);
    el.classList.add('placed');
    el.style.transform = '';
    bowl.append(el);
    void el.offsetWidth;
    el.classList.add('cooking-into');
    later(() => el.remove(), PLACE_MS);
    const bit = h('span', { class: 'cooking-bit' }, item.emoji);
    bit.style.setProperty('--cooking-tilt', `${Math.round(Math.random() * 40 - 20)}deg`);
    inside.append(bit);
    needs.querySelector(`.cooking-need[data-emoji="${item.emoji}"]`)?.classList.add('done');
    ctx.audio.chomp();
    navigator.vibrate?.(20);
    replay(tool, 'anim-bounce');
    ctx.speak(item.name);
    if (added.size < recipe.ingredients.length) return;
    disposeDrags();
    later(startStir, STIR_DELAY_MS);
  }

  function fillTray(items: Item[]): void {
    trayItems.clear();
    const els = items.map((item) => {
      const el = h('div', { class: 'g-item cooking-item', 'data-emoji': item.emoji }, item.emoji);
      trayItems.set(item.emoji, el);
      disposers.push(
        makeDraggable(el, {
          onStart() {
            bowl.classList.remove('anim-pulse');
          },
          onMove(e, p) {
            bowl.classList.toggle('cooking-over', over(e, p, bowl));
          },
          onDrop(e, p) {
            bowl.classList.remove('cooking-over');
            if (phase !== 'add' || !recipe) return false;
            if (!over(e, p, bowl)) return false;
            const needed = recipe.ingredients.some((i) => i.emoji === item.emoji) && !added.has(item.emoji);
            if (!needed) {
              replay(tool, 'anim-shake');
              ctx.audio.boing();
              ctx.speak('Không phải cái này');
              return false;
            }
            addIngredient(e, item);
            return true;
          },
        }),
      );
      return el;
    });
    tray.replaceChildren(...els);
  }

  // ---- phase 2: stir ----

  function startStir(): void {
    phase = 'stir';
    turns = 0;
    turnMark = 0;
    dots.forEach((d) => d.classList.remove('on'));
    toolWrap.classList.add('cooking-stirring');
    ctx.speak('Khuấy đều nào!');
    armHint();
  }

  function onStirDown(e: PointerEvent): void {
    if (phase !== 'stir' || stirPointer !== null || !e.isPrimary) return;
    e.preventDefault();
    stirPointer = e.pointerId;
    stirPrev = { x: e.clientX, y: e.clientY };
    spoon.classList.remove('anim-wiggle');
    showSpoon(stirPrev);
  }

  function onStirMove(e: PointerEvent): void {
    if (phase !== 'stir' || e.pointerId !== stirPointer || !stirPrev || !recipe) return;
    const cur = { x: e.clientX, y: e.clientY };
    showSpoon(cur);
    turns += Math.abs(turnDelta(stirPrev, cur, centerOf(tool)));
    stirPrev = cur;
    const mark = Math.min(STIR_TURNS, Math.floor(turns + TURN_EPS));
    while (turnMark < mark) {
      dots[turnMark]?.classList.add('on');
      turnMark++;
      ctx.audio.tick();
      particle(recipe.tool === 'blender' ? 'spark' : 'bubble');
    }
    if (turns + TURN_EPS >= STIR_TURNS) finishStir();
  }

  function onStirUp(e: PointerEvent): void {
    if (e.pointerId !== stirPointer) return;
    hideSpoon();
  }

  function finishStir(): void {
    hideSpoon();
    toolWrap.classList.remove('cooking-stirring');
    phase = 'cook';
    stove.hidden = false;
    replay(stove, 'anim-bounce');
    ctx.speak('Nấu thôi!');
    armHint();
  }

  // ---- phase 3: cook ----

  function startCook(e: PointerEvent): void {
    if (phase !== 'cook' || cooking) return;
    e.preventDefault();
    cooking = true;
    stove.classList.add('on');
    tool.classList.add('anim-pulse');
    ctx.audio.tick();
    particle('steam');
    const stop = every(() => {
      ctx.audio.tick();
      particle('steam');
    }, STEAM_MS);
    later(() => {
      stop();
      finishCook();
    }, COOK_MS);
  }

  function finishCook(): void {
    inside.replaceChildren();
    if (!recipe) return;
    cooking = false;
    stove.classList.remove('on');
    stove.hidden = true;
    tool.classList.remove('anim-pulse');
    toolWrap.classList.add('cooking-done');
    dish.textContent = recipe.dish;
    dish.hidden = false;
    replay(dish, 'anim-bounce');
    ctx.audio.ding();
    ctx.speak(`Xong rồi! ${recipe.name}`);
    startServe();
  }

  // ---- phase 4: serve ----

  function startServe(): void {
    phase = 'serve';
    const who = EATERS[randInt(0, EATERS.length - 1)];
    if (!who) return;
    eaterFace.textContent = who.emoji;
    eater.dataset.name = who.name;
    eater.hidden = false;
    mouth.classList.remove('anim-pulse', 'cooking-over');
    replay(eaterBody, 'cooking-slide');
    disposers.push(
      makeDraggable(dish, {
        onStart() {
          mouth.classList.remove('anim-pulse');
        },
        onMove(el, p) {
          mouth.classList.toggle('cooking-over', over(el, p, mouth));
        },
        onDrop(el, p) {
          mouth.classList.remove('cooking-over');
          if (phase !== 'serve' || !over(el, p, mouth)) return false;
          feed();
          return true;
        },
      }),
    );
    armHint();
  }

  function feed(): void {
    disposeDrags();
    ctx.hint.clear();
    dish.classList.add('placed');
    dish.style.transform = '';
    mouth.append(dish);
    void dish.offsetWidth;
    dish.classList.add('cooking-eaten');
    for (let k = 0; k < CHOMPS; k++) {
      if (k === 0) ctx.audio.chomp();
      else later(() => ctx.audio.chomp(), k * CHOMP_MS);
    }
    replay(eaterFace, 'anim-bounce');
    navigator.vibrate?.(20);
    ctx.speak('Ngon quá! Cảm ơn bé!');
    later(() => {
      void ctx.celebrate().then(() => {
        if (!alive) return;
        ctx.addStar();
        play(round + 1, recipe?.id);
      });
    }, (CHOMPS - 1) * CHOMP_MS + CELEBRATE_DELAY_MS);
  }

  // ---- round ----

  function play(nextRound: number, excludeId?: string): void {
    disposeDrags();
    round = nextRound;
    phase = 'add';
    added.clear();
    turns = 0;
    turnMark = 0;
    cooking = false;
    hideSpoon();

    const r = makeCookRound(round, Math.random, excludeId);
    recipe = r.recipe;
    inside.replaceChildren();

    cardDish.textContent = recipe.dish;
    needs.replaceChildren(
      ...recipe.ingredients.map((i) => h('span', { class: 'cooking-need', 'data-emoji': i.emoji }, i.emoji)),
    );
    replay(card, 'anim-bounce');

    tool.textContent = recipe.toolEmoji;
    tool.classList.remove('anim-pulse');
    toolWrap.dataset.tool = recipe.tool;
    toolWrap.classList.remove('cooking-stirring', 'cooking-done');
    bowl.classList.remove('anim-pulse', 'cooking-over');
    bowl.replaceChildren();
    dots.forEach((d) => d.classList.remove('on'));
    stove.hidden = true;
    stove.classList.remove('on');

    dish.hidden = true;
    dish.classList.remove('placed', 'cooking-eaten', 'spring-back', 'dragging');
    dish.style.transform = '';
    delete dish.dataset.dx;
    delete dish.dataset.dy;
    scene.append(dish);
    eater.hidden = true;
    mouth.classList.remove('anim-pulse', 'cooking-over');

    fillTray(r.tray);
    ctx.speak(`Mình nấu ${recipe.name} nhé!`);
    armHint();
  }

  const onDown = (e: PointerEvent): void => {
    ctx.hint.touch();
    bowl.classList.remove('anim-pulse');
    mouth.classList.remove('anim-pulse');
    if (e.target === stove || stove.contains(e.target as Node)) {
      startCook(e);
      return;
    }
    if (scene.contains(e.target as Node) && !dish.contains(e.target as Node)) onStirDown(e);
  };
  wrap.addEventListener('pointerdown', onDown);
  ctx.stage.addEventListener('pointermove', onStirMove);
  window.addEventListener('pointerup', onStirUp);
  window.addEventListener('pointercancel', onStirUp);

  ctx.onCleanup(() => {
    alive = false;
    disposeDrags();
    wrap.removeEventListener('pointerdown', onDown);
    ctx.stage.removeEventListener('pointermove', onStirMove);
    window.removeEventListener('pointerup', onStirUp);
    window.removeEventListener('pointercancel', onStirUp);
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    intervals.forEach((id) => clearInterval(id));
    intervals.clear();
  });

  play(0);
}

const game: GameModule = { ...meta, start };
export default game;
