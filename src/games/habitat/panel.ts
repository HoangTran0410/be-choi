import { h } from '../../core/dom';

export interface Panel {
  el: HTMLElement;
  close(): void;
}

/** Long enough that the tap that opened a panel cannot also choose from it. */
export const SETTLE_MS = 250;

/**
 * A full-stage panel over the game with one big close button. Opening and
 * closing is done on `pointerup`: opened on the press, the release of that same
 * tap would land on whichever tile the panel put under the finger.
 */
export function openPanel(host: HTMLElement, cls: string, body: HTMLElement, onClose?: () => void): Panel {
  const opened = Date.now();
  const settled = (): boolean => Date.now() - opened > SETTLE_MS;
  let done = false;
  const close = (): void => {
    if (done) return;
    done = true;
    el.remove();
    onClose?.();
  };
  const shut = h('button', { class: 'hb-close btn-round', type: 'button', 'aria-label': 'Đóng' }, '✕');
  shut.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (settled()) close();
  });
  const el = h('div', { class: `pp-overlay hb-overlay ${cls}` }, h('div', { class: 'pp-panel hb-panel' }, body), shut);
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el && settled()) close();
  });
  host.append(el);
  return { el, close };
}

/** A tile that reacts on release, only once the panel has settled. */
export function onTile(tile: HTMLElement, opened: number, fn: () => void): void {
  tile.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (Date.now() - opened > SETTLE_MS) fn();
  });
}
