import { h, replay } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import { MODE_IDS, MODE_INFO, type ModeId } from './levels';

export interface Hud {
  el: HTMLElement;
  setMode(mode: ModeId): void;
  /** Total stars, and how far along to the next thing that unlocks in this mode (0 … 1). */
  setStars(total: number, fraction: number): void;
  setWorks(count: number): void;
  /** A little shout when something new has opened. */
  flashUnlock(): void;
}

/**
 * The strip that is the same in every mode: three big buttons to switch between them and the
 * cabinet (with the star count on it), and a thin bar along the strip's inner edge that fills up
 * toward the next unlock. A row on top in portrait, a column on the
 * left in landscape (see style.css). Every button is at least one `--tap` (≥ 72 px).
 */
export function createHud(ctx: GameContext, onMode: (m: ModeId) => void, onCabinet: () => void): Hud {
  const buttons = new Map<ModeId, HTMLElement>();
  const modes = h('div', { class: 'bw-modes', role: 'tablist' });
  for (const id of MODE_IDS) {
    const info = MODE_INFO[id];
    const b = h(
      'button',
      { class: `bw-btn bw-tab bw-tab-${id}`, type: 'button', role: 'tab', 'aria-label': info.label, 'data-mode': id },
      h('span', { class: 'bw-ico' }, info.icon),
    );
    makeTappable(b, () => onMode(id), { ctx, cooldownMs: 250 });
    buttons.set(id, b);
    modes.append(b);
  }

  const count = h('span', { class: 'bw-stars-n' }, '0');
  const pill = h('span', { class: 'bw-stars', 'aria-label': 'Số sao' }, h('span', { class: 'bw-star' }, '⭐'), count);
  const fill = h('span', { class: 'bw-bar-fill' });
  const bar = h('span', { class: 'bw-bar', 'aria-hidden': 'true' }, fill);

  const badge = h('span', { class: 'bw-badge' }, '0');
  const cabinet = h(
    'button',
    { class: 'bw-btn bw-cabinet', type: 'button', 'aria-label': 'Tủ trưng bày' },
    h('span', { class: 'bw-ico' }, '🏆'),
    pill,
    badge,
  );
  makeTappable(cabinet, onCabinet, { ctx, cooldownMs: 300 });

  const el = h('div', { class: 'bw-hud' }, modes, cabinet, bar);

  return {
    el,
    setMode(mode) {
      for (const [id, b] of buttons) {
        b.setAttribute('aria-selected', String(id === mode));
        b.classList.toggle('active', id === mode);
      }
    },
    setStars(total, fraction) {
      count.textContent = String(total);
      fill.style.setProperty('--p', String(Math.max(0, Math.min(1, fraction))));
    },
    setWorks(n) {
      badge.textContent = String(n);
      badge.hidden = n === 0;
    },
    flashUnlock() {
      replay(pill, 'anim-bounce');
    },
  };
}
