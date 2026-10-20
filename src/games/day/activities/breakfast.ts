import type { Item } from '../../../core/content';
import { h, mulberry32, replay, shuffle } from '../../../core/dom';
import { centerOf } from '../../../core/drag';
import { STIR_TURNS, TRAY_DECOYS, sillyLine, turnDelta } from '../../cooking/logic';
import { recipePool, take } from '../day';
import { createFinisher } from '../done';
import type { Activity } from '../env';

/** A tap on the pot counts for this much of a turn, for fingers that cannot circle yet. */
const TAP_TURN = 0.25;

/**
 * Ăn sáng: cook it, then feed it. Tap what goes into the pot (a sock is just funny — the pot
 * laughs and spits it back), stir by circling a finger on the pot (or by tapping it), then
 * give the dish to the little friend, who is hungry.
 */
export const breakfast: Activity = (env) => {
  const { ctx, scope, kid, plan, days } = env;
  const rng = mulberry32(plan.seed + 11);
  const pool = recipePool(days);
  const recipe = pool[Math.floor(rng() * pool.length)] ?? pool[0];
  if (!recipe) return;
  const decoys = take(recipe.decoys, TRAY_DECOYS, rng);
  const tray = shuffle([...recipe.ingredients, ...decoys], rng);

  const root = h('div', { class: 'cook' });
  env.host.append(root);
  const fin = createFinisher(env);
  let added = 0;
  let turns = 0;
  let stage: 'cook' | 'stir' | 'serve' | 'eaten' = 'cook';

  // ---- cook ----
  const slots = recipe.ingredients.map((it) => h('span', { class: 'cook-slot', 'data-emoji': it.emoji }, it.emoji));
  const want = h('div', { class: 'cook-recipe', 'aria-label': recipe.name }, h('span', { class: 'cook-dish' }, recipe.dish), ...slots);
  const pot = h('button', { class: 'cook-pot', type: 'button', 'aria-label': 'Nồi' }, recipe.toolEmoji);
  const ring = h('div', { class: 'cook-turns' });
  const trayEl = h('div', { class: 'cook-tray' });
  root.append(want, h('div', { class: 'cook-pot-wrap' }, pot, ring), trayEl);

  const buttons = new Map<Item, HTMLElement>();
  for (const it of tray) {
    const b = h('button', { class: 'cook-item', type: 'button', 'aria-label': it.name }, it.emoji);
    buttons.set(it, b);
    scope.tap(b, () => put(it, b), 0);
    trayEl.append(b);
  }

  function put(it: Item, b: HTMLElement): void {
    ctx.hint.touch();
    fin.touch();
    if (stage !== 'cook') return;
    const isIngredient = recipe!.ingredients.some((x) => x.emoji === it.emoji);
    if (!isIngredient) {
      replay(b, 'anim-shake');
      replay(pot, 'anim-wiggle');
      ctx.audio.boing();
      env.say(sillyLine(it));
      return;
    }
    if (b.classList.contains('used')) return;
    b.classList.add('used');
    added++;
    ctx.audio.pop(1 + added * 0.1);
    replay(pot, 'anim-bounce');
    slots.find((s) => s.dataset.emoji === it.emoji)?.classList.add('in');
    if (added >= recipe!.ingredients.length) {
      stage = 'stir';
      root.dataset.stage = 'stir';
      env.say('Đủ rồi… khuấy lên nào!');
      pot.classList.add('anim-pulse');
    }
  }

  // ---- stir ----
  function addTurns(t: number): void {
    if (stage !== 'stir') return;
    turns += t;
    ctx.audio.tick();
    replay(pot, 'anim-wiggle');
    const n = Math.min(STIR_TURNS, Math.floor(turns));
    ring.dataset.n = String(n);
    ring.textContent = '🥄'.repeat(n);
    if (turns >= STIR_TURNS) served();
  }
  let last: { x: number; y: number } | null = null;
  let acc = 0;
  pot.addEventListener('pointerdown', (e) => {
    last = { x: e.clientX, y: e.clientY };
    acc = 0;
  });
  pot.addEventListener('pointermove', (e) => {
    if (!last || stage !== 'stir') return;
    const cur = { x: e.clientX, y: e.clientY };
    const d = Math.abs(turnDelta(last, cur, centerOf(pot)));
    last = cur;
    acc += d;
    if (acc >= 0.2) {
      acc = 0;
      addTurns(0.2);
    }
  });
  const release = (): void => {
    last = null;
  };
  pot.addEventListener('pointerup', release);
  pot.addEventListener('pointercancel', release);
  scope.tap(pot, () => addTurns(TAP_TURN), 0);

  // ---- serve ----
  function served(): void {
    stage = 'serve';
    ctx.hint.clear();
    ctx.audio.fx('sparkle');
    env.say(`${recipe!.name} xong rồi!… Cho bạn nhỏ ăn nào!`);
    const me = env.kidView('big');
    const dish = h('button', { class: 'cook-serve', type: 'button', 'aria-label': recipe!.name }, recipe!.dish);
    const kidBox = h('div', { class: 'cook-kid' }, me);
    root.replaceChildren(kidBox, h('div', { class: 'cook-plate' }, dish));
    root.dataset.stage = 'serve';
    scope.piece(dish, () => me, () => eat(dish, me));
    // Tapping the friend afterwards is always fine: a giggle.
    scope.tap(kidBox, () => {
      fin.touch();
      ctx.hint.touch();
      replay(me, 'anim-wiggle');
      ctx.audio.pop(1.1);
    }, 300);
    ctx.hint.arm(() => {
      env.say('Cho bạn nhỏ ăn nào');
      replay(dish, 'anim-wiggle');
    });
  }

  function eat(dish: HTMLElement, me: HTMLElement): void {
    if (stage !== 'serve') return;
    stage = 'eaten';
    ctx.hint.clear();
    dish.classList.add('eaten');
    ctx.audio.chomp();
    scope.later(() => ctx.audio.chomp(), 200);
    replay(me, 'anim-bounce');
    kid.set({ mood: 'happy' });
    env.say('Ngon quá!');
    fin.ready();
  }
};
