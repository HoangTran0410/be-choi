import { h } from './dom';

/** One tile in the picker: a photo (url) or an emoji option (e.g. 🐣 "tranh emoji"). */
export interface PickerChoice {
  id: string;
  url?: string;
  emoji?: string;
  /** Vietnamese label, used for aria-label only (children do not read). */
  label: string;
  /** Choices of another group start on a new row, under a thin line (e.g. beats, then speeds). */
  group?: string;
}

/**
 * Full-stage photo picker for the child: big tappable tiles, no scrolling needed
 * (at most 12 photos + a couple of options). Rendered inside `host` (the game stage)
 * so it works with the stage's touch rules. Returns a close function; `onPick(null)`
 * fires when the picker is dismissed without choosing.
 */
/** A finger that travelled this far was scrolling the panel, not choosing. */
const TAP_SLOP = 12;

export function showPhotoPicker(
  host: HTMLElement,
  choices: readonly PickerChoice[],
  onPick: (choice: PickerChoice | null) => void,
): () => void {
  let done = false;
  /** Where the finger went down, so a scroll is not read as a choice. */
  let from: { x: number; y: number } | null = null;
  /** No recorded start is a tap: something dispatched the release on its own. */
  const travelled = (e: PointerEvent): boolean => from !== null && Math.hypot(e.clientX - from.x, e.clientY - from.y) > TAP_SLOP;
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
    tile.addEventListener('pointerdown', (e) => {
      from = { x: e.clientX, y: e.clientY };
    });
    tile.addEventListener('pointerup', (e) => {
      // Dragging the panel up ends on some tile; that is a scroll, not a choice.
      const dragged = travelled(e);
      from = null;
      if (dragged) return;
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
  const cells: HTMLElement[] = [];
  tiles.forEach((tile, i) => {
    if (i > 0 && choices[i]?.group !== choices[i - 1]?.group) cells.push(h('div', { class: 'pp-break', 'aria-hidden': 'true' }));
    cells.push(tile);
  });
  const panel = h('div', { class: 'pp-panel' }, h('div', { class: 'pp-grid' }, ...cells));
  const overlay = h('div', { class: 'pp-overlay' }, panel, close);
  overlay.addEventListener('pointerdown', (e) => {
    from = { x: e.clientX, y: e.clientY };
    if (e.target === overlay) finish(null);
  });
  host.append(overlay);
  return () => finish(null);
}
