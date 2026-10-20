/** Small DOM helpers shared by the farm's screens. */
import { h } from '../../core/dom';
import type { Target } from '../../core/drag';
import { createDragDrop, pickTarget } from '../../core/dragdrop';
import type { Photo } from '../../core/photos';
import type { Env, Pt } from './env';
import { centerOf } from './env';

export interface PressOptions {
  /** Picture that follows the finger while dragging. */
  ghost: string;
  onTap(): void;
  /** Places that react to a carried picture passing over them (measured once at pick-up). */
  targets?(): Target[];
  /** The carried picture came over target `id`. */
  onHover?(id: string): void;
  /** Called on release after a drag. */
  onDrop?(p: Pt): void;
}

/** Finger travel (px) before a press counts as a drag rather than a tap. */
export const DRAG_SLOP = 12;

/**
 * One finger, two meanings: a short press is a tap, a press that travels is a drag with a picture
 * under the finger. The pointer work (capture, slop, the light copy moved by `transform` once per
 * frame, cleanup) is the shared `core/dragdrop`; this only says what the farm does with it.
 */
export function pressOrDrag(env: Env, el: HTMLElement, o: PressOptions): void {
  const dd = createDragDrop<true>({
    layer: env.layer,
    slop: DRAG_SLOP,
    targets: () => o.targets?.() ?? [],
    // The place under the finger (the watering can's plots) is reported as it changes, once a frame.
    resolve: (p, targets) => pickTarget(p, targets, { tolerance: 0 }),
    ghost: () => h('div', { class: 'hv-ghost' }, o.ghost),
    onTap: () => o.onTap(),
    onHover: (id) => {
      if (id !== null) o.onHover?.(id);
    },
    onDrop: (_src, _hit, _el, p) => {
      o.onDrop?.(p);
    },
    ctx: env.ctx,
  });
  dd.attach(el, () => true);
}

/** Make a tapped element wiggle. */
export function wiggle(el: Element | null | undefined, cls = 'hv-wiggle'): void {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/** A picture rising off `at`, like a heart or a plus-one. */
export function pop(env: Env, at: Element | Pt, glyph: string): void {
  const c = centerOf(at);
  const el = h('div', { class: 'hv-pop', style: `left:${c.x}px;top:${c.y}px` }, glyph);
  env.layer.append(el);
  env.later(() => el.remove(), 1000);
}

/** Replace an element's text only when it changed (cheap to call every frame). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Add or remove a class only when needed. */
export function setClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Show a family photo in a frame, or `fallback` (an emoji) when there is none. */
export function setFrame(frame: HTMLElement, photo: Photo | undefined, fallback: string): void {
  const img = frame.querySelector('img');
  if (photo) {
    if (img?.getAttribute('src') === photo.url) return;
    frame.replaceChildren(h('img', { src: photo.url, alt: '', draggable: false }));
    frame.classList.add('has-photo');
  } else if (img || !frame.firstChild) {
    frame.replaceChildren(fallback);
    frame.classList.remove('has-photo');
  }
}
