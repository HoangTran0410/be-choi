import { h, mulberry32, replay } from '../../../core/dom';
import { CHEER_FIT, CHEER_ODD, SLOTS, fits, type Garment, type Slot } from '../../dressup/logic';
import { dressOffers, isFresh, scenarioOf } from '../day';
import { createFinisher } from '../done';
import type { Activity } from '../env';

const SLOT_LABEL: Readonly<Record<Slot, string>> = { hat: 'mũ', top: 'áo', shoes: 'giày' };
const WEATHER_SAY = { sunny: 'Trời nắng… mặc đồ mát nhé!', rainy: 'Trời mưa… mặc đồ đi mưa nhé!', cold: 'Trời lạnh… mặc đồ ấm nhé!' } as const;

function oneOf<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

/**
 * Thức dậy & mặc đồ: dress the little friend for today's weather. Hat, top and shoes go on in
 * any order, tap or drag, tap again to take off. Nothing is wrong — a snow scarf in the sun
 * just makes the friend giggle. With all three on a big ✓ appears (and, if the child stops
 * playing for a good while, the job ends by itself) — but swapping goes on as long as wanted.
 */
export const dress: Activity = (env) => {
  const { ctx, scope, kid, plan, days } = env;
  const sc = scenarioOf(plan);
  const offers = dressOffers(plan, days, mulberry32(plan.seed + 3));
  const me = env.kidView('big');
  const stage = h('div', { class: 'dress-kid' }, me, h('span', { class: 'dress-weather' }, sc.icon));
  const rack = h('div', { class: 'dress-rack' });
  const dots = h('div', { class: 'dress-dots', 'aria-hidden': 'true' }, ...SLOTS.map((s) => h('i', { 'data-slot': s })));
  env.host.append(h('div', { class: 'dress' }, stage, dots, rack));
  const fin = createFinisher(env);
  let told = false;

  const buttons = new Map<string, HTMLElement>();
  function paint(): void {
    for (const [emoji, b] of buttons) b.classList.toggle('worn', kid.state[b.dataset.slot as Slot] === emoji);
    for (const d of Array.from(dots.children)) d.classList.toggle('on', kid.state[(d as HTMLElement).dataset.slot as Slot] !== '');
  }
  function wearing(g: Garment): void {
    ctx.hint.touch();
    fin.touch();
    if (kid.state[g.slot] === g.emoji) {
      kid.wear(g.slot, '');
      ctx.audio.pop(0.9);
      paint();
      fin.unready();
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
      if (!told) {
        told = true;
        scope.later(() => env.say('Đủ rồi… bấm dấu xanh nhé… hoặc thử đồ khác!'), 1600);
      }
      fin.ready();
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
