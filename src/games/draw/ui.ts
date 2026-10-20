/**
 * Small pieces every screen of the workshop uses: big round buttons, a scope that
 * remembers what to undo, a grid panel (colours, pens, stickers, pictures) and a toast.
 */
import { h } from '../../core/dom';
import { makeTappable } from '../../core/tap';

/** Things to undo when a screen is left. */
export interface Scope {
  add(fn: () => void): void;
  /** A timeout that is cleared with the scope. */
  timeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  dispose(): void;
}

export function createScope(): Scope {
  const fns: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    add: (fn) => void fns.push(fn),
    timeout(fn, ms) {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    },
    dispose() {
      timers.forEach(clearTimeout);
      timers.clear();
      for (const fn of fns.splice(0).reverse()) fn();
    },
  };
}

export interface ButtonSpec {
  /** Vietnamese aria-label (the child reads pictures, not words). */
  label: string;
  /** Emoji, or an element (SVG, swatch…). */
  content: string | Node;
  cls?: string;
  onTap: () => void;
}

/** A round button that reacts on touch-down. Never smaller than the app's tap size. */
export function makeButton(scope: Scope, spec: ButtonSpec): HTMLButtonElement {
  const b = h('button', { class: `dr-btn ${spec.cls ?? ''}`.trim(), type: 'button', 'aria-label': spec.label }, spec.content);
  scope.add(makeTappable(b, spec.onTap, { cooldownMs: 0 }));
  return b;
}

/** A drag that starts on a tile is a scroll, not a choice. */
const SLOP = 12;

/**
 * Run `fn` when the finger that went down on `el` comes up on it. A release with no press of
 * its own does nothing: a panel that opens under the finger that tapped its button must not
 * count that finger's lift as a choice.
 */
export function onTapRelease(el: HTMLElement, fn: () => void): void {
  let from: { x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    from = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener('pointerup', (e) => {
    const start = from;
    from = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) return;
    e.preventDefault();
    fn();
  });
}

export interface PanelTile {
  id: string;
  label: string;
  /** Emoji or short text in the middle. */
  text?: string;
  /** Picture behind the tile (a data URL). */
  image?: string;
  /** Plain colour (a swatch). */
  color?: string;
  /** Shown dimmed with a lock; choosing it does not close the panel. */
  locked?: boolean;
  selected?: boolean;
  /** A little mark in the corner (✨ new, 📷 photo). */
  badge?: string;
  /** Return false to keep the panel open. */
  onPick: () => boolean | void;
}

export type PanelItem = PanelTile | { heading: string };

export interface Panel {
  el: HTMLElement;
  close(): void;
}

/** A full-stage grid of big tiles over everything else. Tapping outside the card or the ✕ closes it. */
export function openPanel(host: HTMLElement, items: readonly PanelItem[], opts: { onClose?: () => void; wide?: boolean; sixes?: boolean } = {}): Panel {
  let done = false;
  const grid = h('div', { class: `dr-grid${opts.sixes ? ' sixes' : ''}` });
  for (const item of items) {
    if ('heading' in item) {
      grid.append(h('div', { class: 'dr-heading', 'aria-hidden': 'true' }, item.heading));
      continue;
    }
    const tile = h(
      'button',
      {
        class: `dr-tile${item.locked ? ' locked' : ''}${item.selected ? ' selected' : ''}${item.color ? ' swatch' : ''}`,
        type: 'button',
        'aria-label': item.label,
        'data-id': item.id,
        style: `${item.image ? `background-image:url("${item.image}");` : ''}${item.color ? `--sw:${item.color};` : ''}`,
      },
      item.text ?? '',
      item.badge ? h('span', { class: 'dr-badge', 'aria-hidden': 'true' }, item.badge) : null,
      item.locked ? h('span', { class: 'dr-lock', 'aria-hidden': 'true' }, '🔒') : null,
    );
    onTapRelease(tile, () => {
      const keep = item.onPick() === false;
      if (!keep) close();
    });
    grid.append(tile);
  }
  const closeBtn = h('button', { class: 'dr-btn dr-close', type: 'button', 'aria-label': 'Đóng' }, '✕');
  onTapRelease(closeBtn, () => close());
  const card = h('div', { class: `dr-card${opts.wide ? ' wide' : ''}` }, grid);
  const el = h('div', { class: 'dr-panel' }, card, closeBtn);
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) close();
  });
  host.append(el);

  function close(): void {
    if (done) return;
    done = true;
    el.remove();
    opts.onClose?.();
  }
  return { el, close };
}

export interface ToastSpec {
  icon?: string;
  color?: string;
}

/** A brief round badge that pops in the middle of the stage (a new colour, a new picture…). */
export function showToast(host: HTMLElement, scope: Scope, specs: readonly ToastSpec[], ms = 2600): void {
  if (!specs.length) return;
  const row = h(
    'div',
    { class: 'dr-toast', 'aria-hidden': 'true' },
    ...specs.slice(0, 4).map((s) =>
      h('span', { class: `dr-toast-item${s.color ? ' swatch' : ''}`, style: s.color ? `--sw:${s.color}` : '' }, s.icon ?? ''),
    ),
  );
  host.append(row);
  scope.timeout(() => row.remove(), ms);
  scope.add(() => row.remove());
}
