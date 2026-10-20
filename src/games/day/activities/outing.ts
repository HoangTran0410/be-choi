import { h, mulberry32, replay } from '../../../core/dom';
import { fall } from '../ambient';
import { visitorBubble } from '../art';
import { OUTING_COUNT, outingPool, take, visitorLine } from '../day';
import { createFinisher } from '../done';
import type { Activity } from '../env';

const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
const THEME = { sunny: '☀️', rainy: '☔', cold: '❄️' } as const;
const SAY = {
  sunny: 'Trời nắng đẹp… tìm bạn nhỏ xinh nào!',
  rainy: 'Mưa rơi tí tách… tìm bạn nhỏ nào!',
  cold: 'Trời lạnh… tìm bạn nhỏ nào!',
} as const;

/**
 * Đi chơi: the little friend goes outside. Things to find drift about — tap each one. When a
 * visitor comes (a family photo if there are any) say hello to them too. Rain and cold change
 * what is outside, not what to do.
 */
export const outing: Activity = (env) => {
  const { ctx, scope, plan, days } = env;
  const rng = mulberry32(plan.seed + 31);
  const things = take(outingPool(days, plan.weather), OUTING_COUNT, rng);
  const visiting = plan.event === 'friend';
  const total = things.length + (visiting ? 1 : 0);
  let got = 0;

  const field = h('div', { class: 'out-field' });
  const me = env.kidView('big');
  const basket = h('div', { class: 'out-basket', 'aria-hidden': 'true' }, ...Array.from({ length: total }, () => h('span', { class: 'out-slot' })));
  const root = h('div', { class: `out out-${plan.weather}` }, h('span', { class: 'out-theme' }, THEME[plan.weather]), field, h('div', { class: 'out-kid' }, me), basket);
  env.host.append(root);
  const fin = createFinisher(env);
  if (plan.weather === 'rainy') fall(root, scope, '💧', 12);
  else if (plan.weather === 'cold') fall(root, scope, '❄️', 8);

  scope.tap(me, () => {
    fin.touch();
    ctx.hint.touch();
    replay(me, 'anim-wiggle');
    ctx.audio.pop(1.1);
  }, 300);

  const cells = take(
    [
      [14, 12],
      [62, 8],
      [38, 30],
      [8, 46],
      [66, 44],
      [34, 56],
    ],
    total,
    rng,
  );

  function collect(el: HTMLElement, glyph: string): void {
    ctx.hint.touch();
    fin.touch();
    if (el.classList.contains('got')) return;
    el.classList.add('got');
    const slot = basket.children[got];
    if (slot) slot.textContent = glyph;
    ctx.audio.note(NOTES[got % NOTES.length] ?? 523.25, 0.5, 'bell');
    replay(me, 'anim-bounce');
    got++;
    if (got >= total) {
      ctx.hint.clear();
      scope.later(() => env.say('Vui quá!… Chơi xong rồi!'), 700);
      fin.ready();
    }
  }

  things.forEach((glyph, i) => {
    const [x, y] = cells[i] ?? [20, 20];
    const b = h('button', { class: 'out-thing', type: 'button', style: `left:${x}%;top:${y}%;--d:${(i * 0.7).toFixed(1)}s`, 'aria-label': glyph }, glyph);
    scope.tap(b, () => collect(b, glyph), 0);
    field.append(b);
  });

  if (visiting) {
    const { url, visitor } = env.visitor();
    const [x, y] = cells[things.length] ?? [40, 20];
    scope.later(() => {
      const person = h('button', { class: 'out-thing out-visitor', type: 'button', style: `left:${x}%;top:${y}%`, 'aria-label': visitor.name }, visitorBubble(url, visitor.emoji));
      field.append(person);
      ctx.audio.fx('sparkle');
      env.say(visitorLine(visitor));
      scope.tap(
        person,
        () => {
          if (!person.classList.contains('got')) env.say(visitor.name === 'người thân' ? 'Chào bạn!' : `Chào ${visitor.name}!`);
          collect(person, url ? '💛' : visitor.emoji);
        },
        0,
      );
    }, 2200);
  }

  env.say(SAY[plan.weather]);
  ctx.hint.arm(() => {
    const next = field.querySelector<HTMLElement>('.out-thing:not(.got)');
    if (next) replay(next, 'anim-wiggle');
  });
};
