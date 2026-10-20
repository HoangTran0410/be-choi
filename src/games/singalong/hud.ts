import { h } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import { nextGift } from './catalog';

export type ModeId = 'song' | 'echo' | 'bird' | 'perform';

export interface ModeInfo {
  id: ModeId;
  icon: string;
  /** Short caption under the icon, for the grown-ups. */
  name: string;
}

export const MODES: readonly ModeInfo[] = [
  { id: 'song', icon: '🎶', name: 'Hát bài' },
  { id: 'echo', icon: '🦜', name: 'Vẹt nhại' },
  { id: 'bird', icon: '🐦', name: 'Chim bay' },
  { id: 'perform', icon: '🎆', name: 'Biểu diễn' },
];

export interface Hud {
  /** The top row: tickets chip and the four big mode buttons. */
  el: HTMLElement;
  setMode(id: ModeId): void;
  setTickets(n: number): void;
}

export function createHud(ctx: Pick<GameContext, 'onCleanup'>, onMode: (id: ModeId) => void): Hud {
  const chip = h('div', { class: 'sa-chip', 'aria-live': 'polite' });
  const buttons = new Map<ModeId, HTMLButtonElement>();
  const row = h('div', { class: 'sa-modes', role: 'group', 'aria-label': 'Chọn trò chơi' });
  for (const m of MODES) {
    const btn = h(
      'button',
      { class: 'sa-mode', type: 'button', 'data-mode': m.id, 'aria-label': m.name },
      h('span', { class: 'sa-mode-icon' }, m.icon),
      h('span', { class: 'sa-mode-name' }, m.name),
    );
    makeTappable(btn, () => onMode(m.id), { ctx });
    buttons.set(m.id, btn);
    row.append(btn);
  }
  return {
    el: h('div', { class: 'sa-top' }, chip, row),
    setMode(id) {
      for (const [mid, btn] of buttons) {
        btn.classList.toggle('sa-mode-on', mid === id);
        btn.setAttribute('aria-pressed', String(mid === id));
      }
    },
    setTickets(n) {
      const next = nextGift(n);
      chip.textContent = '';
      chip.append(h('span', { class: 'sa-chip-n' }, `🎟️ ${n}`));
      if (next) chip.append(h('span', { class: 'sa-chip-next' }, `Quà tiếp theo ${next.emoji} ở 🎟️ ${next.at}`));
      else chip.append(h('span', { class: 'sa-chip-next' }, 'Bé mở hết quà rồi! 🎉'));
    },
  };
}
