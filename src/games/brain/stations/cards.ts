/**
 * Station 1 — Lật thẻ tìm đôi. 2×2 up to 4×4. Cards are animals and fruit, and the
 * family's own photos when a parent has added some: "tìm hai tấm ảnh nhà mình".
 * From level 1 the cards are shown face-up for a moment first. A miss just flips back.
 */
import { h, replay } from '../../../core/dom';
import { makeTappable } from '../../../core/tap';
import { cardsPairs } from '../levels';
import { fitGrid } from '../layout';
import { draw, fromPhoto, mix, pieceEl, thingsFor, type Piece } from '../pieces';
import type { Station } from '../types';

const PASTELS = ['#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fbcfe8', '#a5f3fc'];
export const FLIP_BACK_MS = 900;

export interface Card {
  id: number;
  piece: Piece;
}

/** `pairs` pairs, at least one of them a family photo when photos exist (up to half the board). */
export function dealCards(pairs: number, island: number, photos: readonly { id: string; url: string; createdAt: number }[], rng: () => number): Card[] {
  const photoPairs = photos.length ? Math.min(photos.length, Math.max(1, Math.floor(pairs / 2))) : 0;
  const chosenPhotos = draw(photos.map(fromPhoto), photoPairs, rng);
  const things = draw(thingsFor(island), pairs - photoPairs, rng);
  const pieces = [...chosenPhotos, ...things];
  return mix([...pieces, ...pieces], rng).map((piece, id) => ({ id, piece }));
}

export const cards: Station = {
  id: 'cards',
  title: 'Lật thẻ',
  icon: '🃏',
  color: '#e9d5ff',
  intro: ['Lật hai thẻ,', 'giống nhau,', 'nhé!'],
  start(env, done) {
    const pairs = cardsPairs(env.level);
    const deck = dealCards(pairs, env.island, env.photos, env.rng);
    const hasPhoto = deck.some((c) => c.piece.photo);
    const grid = h('div', { class: 'brain-cards' });
    env.area.append(grid);

    interface Slot {
      card: Card;
      el: HTMLElement;
    }
    let open: Slot[] = [];
    let matched = 0;
    let peeking = env.level >= 1;
    const faceDown = (s: Slot) => !s.el.classList.contains('flipped') && !s.el.classList.contains('matched');

    const slots: Slot[] = deck.map((card, i) => {
      const el = h(
        'button',
        { class: 'brain-card', type: 'button', 'aria-label': 'thẻ', style: `--brain-pastel:${PASTELS[i % PASTELS.length]}` },
        h('div', { class: 'brain-card-inner' }, h('div', { class: 'brain-card-front' }, '❓'), h('div', { class: 'brain-card-back' }, pieceEl(card.piece))),
      );
      const slot: Slot = { card, el };
      makeTappable(el, () => flip(slot), { cooldownMs: 0, ctx: env.ctx });
      return slot;
    });
    grid.append(...slots.map((s) => s.el));

    function layout(): void {
      const r = env.area.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const gap = Math.max(8, Math.min(r.width, r.height) * 0.025);
      const fit = fitGrid(deck.length, r.width - 16, r.height - 16, gap, deck.length, true);
      grid.style.setProperty('--cols', String(fit.cols));
      grid.style.setProperty('--size', `${Math.max(fit.size, 0)}px`);
      grid.style.setProperty('--gap', `${gap}px`);
    }
    env.onResize(layout);
    layout();
    grid.dataset.cards = String(deck.length);

    function flip(slot: Slot): void {
      if (peeking || open.length >= 2 || !faceDown(slot)) return;
      env.ctx.audio.tick();
      slot.el.classList.add('flipped');
      open.push(slot);
      const [a, b] = open;
      if (!a || !b) return;
      if (a.card.id !== b.card.id && a.card.piece.key === b.card.piece.key) {
        open = [];
        a.el.classList.add('matched');
        b.el.classList.add('matched');
        env.ctx.audio.ding();
        navigator.vibrate?.(15);
        env.say(a.card.piece.photo ? ['Hai tấm ảnh,', 'giống nhau!'] : [a.card.piece.name]);
        matched++;
        if (matched === pairs) {
          env.ctx.hint.clear();
          env.later(() => done(deck.length), 700);
        }
        return;
      }
      env.stats.slips++;
      env.later(() => {
        a.el.classList.remove('flipped');
        b.el.classList.remove('flipped');
        env.ctx.audio.pop(0.8);
        open = [];
      }, FLIP_BACK_MS);
    }

    // First look: everything face-up for a breath, so there is something to remember.
    if (peeking) {
      for (const s of slots) s.el.classList.add('flipped');
      env.later(() => {
        for (const s of slots) s.el.classList.remove('flipped');
        peeking = false;
      }, 1100 + 450 * pairs);
    }
    if (hasPhoto) env.say(['Lật hai thẻ,', 'tìm hai tấm ảnh,', 'nhà mình nhé!']);

    env.arm(() => {
      if (peeking) return false;
      const down = slots.filter(faceDown);
      if (!down.length) return false;
      const single = open.length === 1 ? open[0] : undefined;
      const partner = single ? down.find((s) => s.card.piece.key === single.card.piece.key) : undefined;
      const target = partner ?? down[Math.floor(env.rng() * down.length)];
      if (target) replay(target.el, 'anim-wiggle');
    });
  },
};
