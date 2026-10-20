import { h, mulberry32, replay } from '../../../core/dom';
import { CHEER_FIT, CHEER_ODD, SLOTS, fits, type Garment, type Slot } from '../../dressup/logic';
import { dressOffers, isFresh, scenarioOf } from '../day';
import type { Activity } from '../env';

const SLOT_LABEL: Readonly<Record<Slot, string>> = { hat: 'mũ', top: 'áo', shoes: 'giày' };
const WEATHER_SAY = { sunny: 'Trời nắng… mặc đồ mát nhé!', rainy: 'Trời mưa… mặc đồ đi mưa nhé!', cold: 'Trời lạnh… mặc đồ ấm nhé!' } as const;

function oneOf<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

/**
 * Thức dậy & mặc đồ: dress the little friend for today's weather. Hat, top and shoes go on in
 * any order, tap or drag, tap again to take off. Nothing is wrong — a snow scarf in the sun
 * just makes the friend giggle. Done when all three are on.
 */
export const dress: Activity = (env) => {
  const { ctx, scope, kid, plan, days } = env;
  const sc = scenarioOf(plan);
  const offers = dressOffers(plan, days, mulberry32(plan.seed + 3));
  let finished = false;

  const me = env.kidView('big');
  const stage = h('div', { class: 'dress-kid' }, me, h('span', { class: 'dress-weather' }, sc.icon));
  const rack = h('div', { class: 'dress-rack' });
  env.host.append(h('div', { class: 'dress' }, stage, rack));

  const buttons = new Map<string, HTMLElement>();
  function paint(): void {
    for (const [emoji, b] of buttons) b.classList.toggle('worn', kid.state[b.dataset.slot as Slot] === emoji);
  }
  function wearing(g: Garment): void {
    ctx.hint.touch();
    if (finished) return;
    if (kid.state[g.slot] === g.emoji) {
      kid.wear(g.slot, '');
      ctx.audio.pop(0.9);
      paint();
      return;
    }
    kid.wear(g.slot, g.emoji);
    const ok = fits(g, sc);
    ctx.audio.ding();
    replay(me, 'anim-bounce');
    if (ok) {
      env.say(oneOf(CHEER_FIT));
    } else {
      env.say(oneOf(CHEER_ODD));
      kid.set({ giggle: true });
      scope.later(() => kid.set({ giggle: false }), 1100);
    }
    paint();
    if (SLOTS.every((s) => kid.state[s] !== '')) {
      finished = true;
      ctx.hint.clear();
      scope.later(() => env.say('Xong rồi… bạn nhỏ mặc đẹp quá!'), 1300);
      scope.later(() => env.finish(), 3600);
    }
  }

  for (const slot of SLOTS) {
    const row = h('div', { class: 'dress-row', 'aria-label': SLOT_LABEL[slot] });
    for (const g of offers[slot]) {
      const b = h(
        'button',
        { class: `dress-piece${isFresh(days, g.emoji) ? ' fresh' : ''}`, type: 'button', 'data-slot': slot, 'aria-label': g.name },
        g.emoji,
      );
      buttons.set(g.emoji, b);
      scope.piece(b, () => me, () => wearing(g));
      row.append(b);
    }
    rack.append(row);
  }
  paint();

  env.say(WEATHER_SAY[plan.weather]);
  ctx.hint.arm(() => {
    const empty = SLOTS.find((s) => kid.state[s] === '');
    const goods = (empty ? offers[empty] : []).filter((g) => fits(g, sc));
    const b = goods[0] && buttons.get(goods[0].emoji);
    if (b) replay(b, 'anim-wiggle');
  });
};
