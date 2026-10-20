import { h, mulberry32, replay } from '../../../core/dom';
import { noteFreq, schedule } from '../../../core/music';
import { FLAVORS, HAPPY_BIRTHDAY, HAPPY_BIRTHDAY_BPM, TOPPINGS, candleWord } from '../../birthday/logic';
import { visitorBubble } from '../art';
import { BIRTHDAY_AGE, take } from '../day';
import { createFinisher } from '../done';
import type { Activity } from '../env';

const MAX_TOPPINGS = 6;

/**
 * Làm bánh / sinh nhật: pick the cake (tap it to change the flavour), decorate it, put on
 * candles, light them and blow them out (then light them again, as often as wanted; the ✓
 * ends it). On a birthday there are three candles, the friend
 * sings, and a visitor may be at the table. Candles, light and blowing work in any order.
 */
export const party: Activity = (env) => {
  const { ctx, scope, plan } = env;
  const rng = mulberry32(plan.seed + 61);
  const birthday = plan.event === 'birthday';
  const need = birthday ? BIRTHDAY_AGE : 1;
  const toppings = take(TOPPINGS, 4, rng);
  let flavor = Math.floor(rng() * FLAVORS.length);
  let candles = 0;
  let lit = false;
  let out = false;
  let singing = false;

  const cakeBody = h('div', { class: 'party-sponge' });
  const icing = h('div', { class: 'party-icing' });
  const decor = h('div', { class: 'party-decor' });
  const flames = h('div', { class: 'party-flames' });
  const cake = h('button', { class: 'party-cake', type: 'button', 'aria-label': 'Bánh' }, cakeBody, icing, decor, flames);
  const stage = h('div', { class: 'party-stage' });
  if (birthday) stage.append(h('span', { class: 'party-balloon', 'aria-hidden': 'true' }, '🎈'), h('span', { class: 'party-balloon b2', 'aria-hidden': 'true' }, '🎉'));
  const guest = env.visitor();
  const hasGuest = plan.event === 'friend' || (birthday && env.photos().length > 0);
  if (hasGuest) stage.append(h('div', { class: 'party-guest' }, visitorBubble(guest.url, guest.visitor.emoji)));
  stage.append(cake);

  const mkBtn = (cls: string, label: string, glyph: string): HTMLElement => h('button', { class: `party-btn ${cls}`, type: 'button', 'aria-label': label }, glyph);
  const tops = toppings.map((t) => {
    const b = mkBtn('party-top', t.name, t.emoji);
    scope.tap(b, () => decorate(t.emoji, b), 0);
    return b;
  });
  const addCandle = mkBtn('act', 'Thêm nến', '🕯️');
  const light = mkBtn('act', 'Thắp nến', '🔥');
  const blow = mkBtn('act', 'Thổi nến', '💨');
  const row1 = h('div', { class: 'party-row' }, ...tops);
  const row2 = h('div', { class: 'party-row' }, addCandle, light, blow);
  env.host.append(h('div', { class: 'party' }, stage, h('div', { class: 'party-tools' }, row1, row2)));
  const fin = createFinisher(env);

  function paintCake(): void {
    const f = FLAVORS[flavor % FLAVORS.length] ?? FLAVORS[0]!;
    cake.style.setProperty('--cake', f.cake);
    cake.style.setProperty('--icing', f.icing);
  }
  paintCake();

  function paintCandles(): void {
    flames.replaceChildren(
      ...Array.from({ length: candles }, (_, i) =>
        h('span', { class: 'party-candle', style: `--i:${i};--n:${candles}` }, h('i', { class: lit && !out ? 'flame' : 'wick' }, lit && !out ? '🔥' : ''), h('b', {})),
      ),
    );
  }

  scope.tap(cake, () => {
    ctx.hint.touch();
    fin.touch();
    flavor = (flavor + 1) % FLAVORS.length;
    paintCake();
    replay(cake, 'anim-bounce');
    ctx.audio.pop(1);
    env.say(`Bánh ${FLAVORS[flavor]?.name ?? ''}!`);
  });

  function decorate(emoji: string, btn: HTMLElement): void {
    ctx.hint.touch();
    fin.touch();
    replay(btn, 'anim-bounce');
    if (decor.children.length >= MAX_TOPPINGS) decor.firstElementChild?.remove();
    const n = decor.children.length;
    decor.append(h('span', { class: 'party-bit', style: `left:${14 + ((n * 37) % 70)}%;top:${((n * 23) % 40) - 6}%` }, emoji));
    ctx.audio.pop(1.1 + n * 0.05);
  }

  scope.tap(addCandle, () => {
    ctx.hint.touch();
    fin.touch();
    if (candles >= need + 2) {
      env.say('Đủ nến rồi!');
      return;
    }
    candles++;
    ctx.audio.ding();
    paintCandles();
    env.say(candleWord(candles));
  });

  scope.tap(light, () => {
    ctx.hint.touch();
    fin.touch();
    replay(light, 'anim-bounce');
    if (candles < need) {
      env.say(birthday ? `Cần ${candleWord(need)} cây nến nhé!` : 'Thêm nến đã nhé!');
      return;
    }
    if (lit && !out) return;
    lit = true;
    out = false;
    paintCandles();
    ctx.audio.fx('sparkle');
    sing();
  });

  function sing(): void {
    if (singing) return;
    singing = true;
    env.say(birthday ? 'Chúc mừng sinh nhật!' : 'Hát mừng nào!');
    const cancel = schedule(
      HAPPY_BIRTHDAY.slice(0, birthday ? HAPPY_BIRTHDAY.length : 8),
      HAPPY_BIRTHDAY_BPM,
      (_i, n, ms) => {
        if (n.n !== 'R') ctx.audio.note(noteFreq(n.n), (ms / 1000) * 0.9, 'piano');
      },
      () => {
        singing = false;
        if (lit && !out) env.say('Thổi nến nào!');
      },
    );
    scope.own(cancel);
  }

  scope.tap(blow, () => {
    ctx.hint.touch();
    fin.touch();
    replay(blow, 'anim-bounce');
    if (!lit || out) {
      env.say(lit ? 'Hết nến rồi!' : 'Phù phù!');
      return;
    }
    out = true;
    paintCandles();
    ctx.audio.puff();
    ctx.hint.clear();
    replay(cake, 'anim-bounce');
    env.say(birthday ? 'Hoan hô!… Bạn nhỏ ba tuổi rồi!' : 'Hoan hô!… Bánh ngon quá!');
    fin.ready();
  });

  env.say(birthday ? 'Sinh nhật bạn nhỏ!… Làm bánh nào!' : 'Làm bánh nào!… Chạm vào bánh để đổi vị.');
  ctx.hint.arm(() => {
    const next = candles < need ? addCandle : !lit ? light : blow;
    replay(next, 'anim-wiggle');
  });
};
