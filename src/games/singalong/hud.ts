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
  /** The corner: the way back, and a small ticket count. */
  top: HTMLElement;
  /** The four big mode cards of the opening screen. */
  modes: HTMLElement;
  /** Back: out of a song, or out of a mode to the opening screen. */
  home: HTMLButtonElement;
  setMode(id: ModeId | null): void;
  setTickets(n: number): void;
}

export function createHud(ctx: Pick<GameContext, 'onCleanup'>, onMode: (id: ModeId) => void, onBack: () => void): Hud {
  const chip = h('div', { class: 'sa-chip', 'aria-live': 'polite' });
  const home = h('button', { class: 'btn-round sa-home', type: 'button', 'aria-label': 'Quay lại' }, '⬅️');
  makeTappable(home, onBack, { ctx });
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
    top: h('div', { class: 'sa-top' }, home, chip),
    modes: row,
    home,
    setMode(id) {
      for (const [mid, btn] of buttons) {
        btn.classList.toggle('sa-mode-on', mid === id);
        btn.setAttribute('aria-pressed', String(mid === id));
      }
    },
    setTickets(n) {
      // Just the count: the next gift is a grown-up's business, and it is in the dressing room.
      const next = nextGift(n);
      chip.replaceChildren(h('span', { class: 'sa-chip-n' }, `🎟️ ${n}`));
      chip.title = next ? `Quà tiếp theo ${next.emoji} ở ${next.at} vé` : 'Đã mở hết quà';
    },
  };
}
