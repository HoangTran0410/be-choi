import type { GameContext } from '../../core/types';
import { h } from '../../core/dom';
import { thumbSvg, type Entry } from './catalog';
import type { Album } from './logic';

/** What every screen of the museum is given, and hands back when the child leaves it. */
export interface Deps {
  ctx: GameContext;
  album: Album;
  /** Write the album to storage. */
  save(): void;
  go: {
    room(): void;
    table(entryId: string): void;
    album(): void;
    band(): void;
  };
}
export interface View {
  destroy(): void;
}

/**
 * A tap that fires when the finger lifts without having travelled: inside the stage
 * the shell cancels touchstart, so there is no `click`, and a tile in a list the
 * child may drag must not fire when the drag starts on it.
 */
export function onTap(el: HTMLElement, fn: (e: PointerEvent) => void): void {
  let id: number | undefined = -1;
  let sx = 0;
  let sy = 0;
  const reset = (): void => {
    id = -1;
    el.classList.remove('is-tapped');
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.isPrimary === false) return;
    id = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    el.classList.add('is-tapped');
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId === id && Math.hypot(e.clientX - sx, e.clientY - sy) > TAP_SLOP) reset();
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== id) return;
    reset();
    fn(e);
  });
  el.addEventListener('pointercancel', reset);
}
const TAP_SLOP = 12;

/** Let a finger drag a long list up and down (the stage does not allow native scrolling). */
export function dragScroll(el: HTMLElement): void {
  let id: number | undefined = -1;
  let startY = 0;
  let top = 0;
  el.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    startY = e.clientY;
    top = el.scrollTop;
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 8) el.scrollTop = top - dy;
  });
  const end = (): void => {
    id = -1;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** A round or square button with a picture or emoji. */
export function button(cls: string, label: string, content: string | Node, onClick: (e: PointerEvent) => void): HTMLButtonElement {
  const b = h('button', { class: cls, type: 'button', 'aria-label': label }, content);
  onTap(b, onClick);
  return b;
}

/** A tile with a picture of the instrument; a ⭐ when its stamp is earned. */
export function tile(en: Entry, stamped: boolean, onClick: (e: PointerEvent) => void, extraClass = ''): HTMLButtonElement {
  const thumb = h('span', { class: 'mu-thumb' });
  thumb.innerHTML = thumbSvg(en.kind);
  const b = button(`mu-tile ${extraClass}${stamped ? ' stamped' : ''}`, en.name, thumb, onClick);
  b.dataset.id = en.id;
  if (stamped) b.append(h('span', { class: 'mu-star', 'aria-hidden': 'true' }, '⭐'));
  return b;
}

/** Call `cb(width, height)` now and whenever `el` changes size. Returns a function that stops listening. */
export function watchSize(el: HTMLElement, cb: (w: number, h: number) => void): () => void {
  const run = (): void => {
    const r = el.getBoundingClientRect();
    cb(r.width, r.height);
  };
  run();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }
  window.addEventListener('resize', run);
  return () => window.removeEventListener('resize', run);
}

/** Timers a view owns, all cleared together. */
export function timers(): { later(fn: () => void, ms: number): ReturnType<typeof setTimeout>; clear(): void } {
  const set = new Set<ReturnType<typeof setTimeout>>();
  return {
    later(fn, ms) {
      const t = setTimeout(() => {
        set.delete(t);
        fn();
      }, ms);
      set.add(t);
      return t;
    },
    clear() {
      for (const t of set) clearTimeout(t);
      set.clear();
    },
  };
}

export function wiggle(el: Element): void {
  el.classList.remove('anim-wiggle');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('anim-wiggle');
}
