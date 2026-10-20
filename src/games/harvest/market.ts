/** The market stall: a customer asks, in pictures, for some of the farm's things. */
import { h } from '../../core/dom';
import { wordPart } from '../../core/say';
import { makeTappable } from '../../core/tap';
import { numberWord } from '../count/logic';
import { cropById } from './crops';
import { elementAt, type Env, type Pt, type View } from './env';
import { give, isDone, itemById, makeOrder, orderParts, PHOTO_WHO, remaining, SHOPPERS, type Order } from './orders';
import { levelFor, stockOf, takeStock, XP_ORDER } from './progress';
import { pop, setClass, setFrame, wiggle } from './ui';

/** Pause between a happy customer leaving and the next one walking up. */
export const NEXT_CUSTOMER_MS = 2200;

export function createMarket(env: Env): View {
  const { ctx, state } = env;
  const face = h('div', { class: 'hv-face' });
  const cust = h('button', { class: 'hv-cust', type: 'button', 'aria-label': 'khách hàng' }, face);
  const bubble = h('div', { class: 'hv-order' });
  const el = h(
    'div',
    { class: 'hv-view hv-market' },
    h('div', { class: 'hv-awning' }),
    h('div', { class: 'hv-shop' }, cust, bubble),
    h('div', { class: 'hv-counter' }, h('span', {}, '🧺'), h('span', {}, '🍎'), h('span', {}, '🥕')),
  );

  let shown: Order | null = null;
  let shownKey = '';
  let waiting = false;

  const who = (o: Order): string => (o.photo && env.photos.length ? PHOTO_WHO : (SHOPPERS[o.shopper % SHOPPERS.length]?.name ?? 'Khách'));

  const photoFor = (): (typeof env.photos)[number] | undefined =>
    env.photos.length ? env.photos[(state.served >> 1) % env.photos.length] : undefined;

  const announce = (): void => {
    const o = state.order;
    if (o) env.sayParts(orderParts(o, who(o)));
  };

  const newCustomer = (): void => {
    const photo = env.photos.length > 0 && state.served % 2 === 1;
    state.order = makeOrder(levelFor(state.xp), { photo, prev: shown });
    waiting = false;
    env.dirty();
    cust.classList.remove('leave');
    cust.classList.add('enter');
    env.later(() => cust.classList.remove('enter'), 700);
    sync();
    if (env.tab === 'market') {
      ctx.audio.pop(1.2);
      announce();
    }
  };

  const slotEls = (): HTMLElement[] => [...bubble.querySelectorAll<HTMLElement>('.hv-slot')];

  /** Hand over one `id`. True if the customer took it. */
  const deliver = (id: string): boolean => {
    const o = state.order;
    const item = itemById(id);
    if (!o || !item) return false;
    if (remaining(o, id) <= 0) {
      ctx.audio.boing();
      env.say(`Khách chưa cần ${item.name}.`);
      wiggle(cust, 'hv-nope');
      return false;
    }
    if (!takeStock(state, id)) return false;
    give(o, id);
    const w = o.wants.find((x) => x.item === id)!;
    const target = slotEls().find((s) => s.dataset.item === id && !s.classList.contains('filled')) ?? cust;
    env.fly(item.emoji, id, target);
    ctx.audio.pop(0.9 + w.got * 0.15);
    env.sayParts([wordPart(numberWord(w.got), 600), wordPart(item.name, 0)]);
    env.stockChanged();
    env.dirty();
    env.later(sync, 380);
    if (isDone(o)) env.later(() => finish(o), 650);
    return true;
  };

  const finish = (o: Order): void => {
    if (state.order !== o) return;
    shown = o;
    state.order = null;
    state.served++;
    waiting = true;
    cust.classList.add('happy');
    env.later(() => cust.classList.remove('happy'), 1500);
    pop(env, cust, '❤️');
    ctx.audio.jingle();
    env.say('Cảm ơn bé!', true);
    ctx.addStar();
    void ctx.celebrate();
    env.gainXp(XP_ORDER);
    env.dirty();
    sync();
    env.later(() => cust.classList.add('leave'), 900);
    env.later(newCustomer, NEXT_CUSTOMER_MS);
  };

  makeTappable(
    cust,
    () => {
      const o = state.order;
      if (!o) return;
      ctx.audio.pop(1.1);
      wiggle(cust, 'hv-nope');
      announce();
    },
    { ctx, feedback: false },
  );

  function drawOrder(o: Order | null): void {
    const key = o
      ? `${o.shopper}|${o.photo}|${o.wants.map((w) => `${w.item}:${w.n}:${w.got}`).join(',')}|${env.photos.length}`
      : `none|${waiting}`;
    if (key === shownKey) return;
    shownKey = key;
    cust.classList.toggle('photo', !!(o?.photo && env.photos.length));
    if (!o) {
      face.classList.remove('has-photo');
      face.replaceChildren(waiting ? '😊' : '🚶');
      bubble.replaceChildren(h('div', { class: 'hv-wait' }, '⏳'));
      return;
    }
    if (o.photo && env.photos.length) setFrame(face, photoFor(), '🙂');
    else {
      face.classList.remove('has-photo');
      face.replaceChildren(SHOPPERS[o.shopper % SHOPPERS.length]?.emoji ?? '🐻');
    }
    const rows = o.wants.map((w) => {
      const slots = Array.from({ length: w.n }, (_, k) => {
        const filled = k < w.got;
        const slot = h(
          'button',
          { class: `hv-slot${filled ? ' filled' : ''}`, type: 'button', 'data-item': w.item, 'aria-label': itemById(w.item)?.name ?? '' },
          h('span', { class: 'hv-slot-e' }, itemById(w.item)?.emoji ?? ''),
        );
        makeTappable(slot, () => (filled ? env.sayParts([wordPart(numberWord(k + 1), 0)]) : deliverOrExplain(w.item)), {
          ctx,
          feedback: false,
        });
        return slot;
      });
      return h('div', { class: 'hv-want' }, h('b', { class: 'hv-num' }, String(w.n)), h('div', { class: 'hv-slots' }, ...slots));
    });
    bubble.replaceChildren(...rows);
  }

  /** Tapping a wanted thing: hand it over if there is one in the basket, else say what to go and get. */
  function deliverOrExplain(id: string): void {
    if (stockOf(state, id) > 0) {
      env.selected = id;
      deliver(id);
      return;
    }
    const item = itemById(id);
    ctx.audio.tick();
    env.say(`Chưa có ${item?.name ?? 'cái này'}. Đi lấy nhé.`);
    env.go(cropById(id) ? 'garden' : 'barn');
  }

  function sync(): void {
    if (!state.order && !waiting) {
      // Back from a save with no customer, or the first visit: someone is always on their way.
      waiting = true;
      env.later(newCustomer, 300);
    }
    drawOrder(state.order);
    setClass(cust, 'waiting', !state.order);
    const o = state.order;
    for (const slot of slotEls()) {
      const id = slot.dataset.item!;
      setClass(slot, 'have', !slot.classList.contains('filled') && !!o && stockOf(state, id) > 0);
    }
  }

  return {
    el,
    sync,
    enter() {
      if (state.order) announce();
    },
    badge() {
      const o = state.order;
      if (!o) return 0;
      let n = 0;
      for (const w of o.wants) n += Math.min(w.n - w.got, stockOf(state, w.item));
      return Math.min(9, n);
    },
    hint() {
      return slotEls().find((s) => !s.classList.contains('filled') && s.classList.contains('have')) ?? null;
    },
    chipTap(id) {
      env.selected = id;
      deliver(id);
    },
    chipDrop(id: string, p: Pt) {
      if (!elementAt(p, [el], 0)) return false;
      return deliver(id);
    },
  };
}
