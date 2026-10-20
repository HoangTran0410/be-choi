/**
 * The frame every station shares: the explorer (tap to open the treasure box), the
 * star bar (three stars to the next surprise) and the way back to the map.
 * Tall screens put it on top; wide, short ones put it in a rail on the left.
 */
import { h, replay } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import { gearOpen, rewardAt, stepOf, STARS_PER_STEP, starsIntoStep } from './levels';
import type { Progress } from './progress';

export interface Hud {
  el: HTMLElement;
  update(p: Progress): void;
  /** The way back is only offered while a station is open. */
  showMap(on: boolean): void;
  /** A star just landed: pop it. */
  popStar(): void;
}

export function createHud(ctx: GameContext, on: { avatar(): void; map(): void }): Hud {
  const face = h('span', { class: 'brain-face' }, '🧒');
  const gear = h('span', { class: 'brain-gear' });
  const avatar = h('button', { class: 'brain-avatar', type: 'button', 'aria-label': 'hộp kho báu' }, face, gear);
  const slots = Array.from({ length: STARS_PER_STEP }, () => h('span', { class: 'brain-slot' }, '⭐'));
  const next = h('span', { class: 'brain-next' }, '🎁');
  const total = h('span', { class: 'brain-total' }, '0');
  const bar = h('div', { class: 'brain-bar', role: 'img', 'aria-label': 'sao' }, h('div', { class: 'brain-slots' }, ...slots), next, total);
  const map = h('button', { class: 'brain-mapbtn', type: 'button', 'aria-label': 'bản đồ' }, '🗺️');
  const el = h('div', { class: 'brain-hud' }, avatar, bar, map);

  makeTappable(avatar, () => on.avatar(), { ctx });
  makeTappable(map, () => on.map(), { ctx });

  return {
    el,
    update(p) {
      face.textContent = p.avatar;
      gear.textContent = gearOpen(p.stars).slice(-2).join('');
      const into = starsIntoStep(p.stars);
      slots.forEach((s, i) => s.classList.toggle('on', i < into));
      next.textContent = rewardAt(stepOf(p.stars) + 1).kind === 'gem' ? '💎' : '🎁';
      total.textContent = String(p.stars);
    },
    showMap(on) {
      map.classList.toggle('gone', !on);
    },
    popStar() {
      const lit = slots.filter((s) => s.classList.contains('on')).at(-1) ?? slots[0];
      if (lit) replay(lit, 'anim-bounce');
      replay(total, 'anim-bounce');
    },
  };
}
