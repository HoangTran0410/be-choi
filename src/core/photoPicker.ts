import { h } from './dom';

/** One tile in the picker: a photo (url) or an emoji option (e.g. 🐣 "tranh emoji"). */
export interface PickerChoice {
  id: string;
  url?: string;
  emoji?: string;
  /** Vietnamese label, used for aria-label only (children do not read). */
  label: string;
}

/**
 * Full-stage photo picker for the child: big tappable tiles, no scrolling needed
 * (at most 12 photos + a couple of options). Rendered inside `host` (the game stage)
 * so it works with the stage's touch rules. Returns a close function; `onPick(null)`
 * fires when the picker is dismissed without choosing.
 */
export function showPhotoPicker(host: HTMLElement, choices: readonly PickerChoice[], onPick: (choice: PickerChoice | null) => void): () => void {
  let done = false;
  const finish = (choice: PickerChoice | null) => {
    if (done) return;
    done = true;
    overlay.remove();
    onPick(choice);
  };
  const tiles = choices.map((c) => {
    const tile = h(
      'button',
      {
        class: `pp-tile${c.url ? ' pp-photo' : ' pp-emoji'}`,
        type: 'button',
        'aria-label': c.label,
        'data-id': c.id,
        style: c.url ? `background-image:url("${c.url}")` : '',
      },
      c.emoji ?? '',
    );
    tile.addEventListener('pointerup', (e) => {
      e.preventDefault();
      finish(c);
    });
    return tile;
  });
  const close = h('button', { class: 'pp-close btn-round', type: 'button', 'aria-label': 'Đóng' }, '✕');
  close.addEventListener('pointerup', (e) => {
    e.preventDefault();
    finish(null);
  });
  const panel = h('div', { class: 'pp-panel' }, h('div', { class: 'pp-grid' }, ...tiles));
  const overlay = h('div', { class: 'pp-overlay' }, panel, close);
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) finish(null);
  });
  host.append(overlay);
  return () => finish(null);
}
