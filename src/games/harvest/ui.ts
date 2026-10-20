/** Small DOM helpers shared by the farm's screens. */
import { h } from '../../core/dom';
import type { Photo } from '../../core/photos';
import type { Env, Pt } from './env';
import { centerOf } from './env';

export interface PressOptions {
  /** Picture that follows the finger while dragging. */
  ghost: string;
  onTap(): void;
  /** Called while dragging, with the finger position. */
  onMove?(p: Pt): void;
  /** Called on release after a drag. */
  onDrop?(p: Pt): void;
}

/** Finger travel (px) before a press counts as a drag rather than a tap. */
export const DRAG_SLOP = 12;

/**
 * One finger, two meanings: a short press is a tap, a press that travels is a drag with a picture
 * under the finger. Listeners live on the element itself (nothing on window/document to clean up).
 */
export function pressOrDrag(env: Env, el: HTMLElement, o: PressOptions): void {
  let id: number | null = null;
  let start: Pt = { x: 0, y: 0 };
  let ghost: HTMLElement | null = null;

  const place = (p: Pt): void => {
    if (ghost) ghost.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  };
  const drop = (): void => {
    ghost?.remove();
    ghost = null;
    el.classList.remove('dragging');
  };

  el.addEventListener('pointerdown', (e) => {
    if (id !== null || (e as PointerEvent).isPrimary === false) return;
    id = (e as PointerEvent).pointerId ?? 0;
    start = { x: e.clientX, y: e.clientY };
    try {
      el.setPointerCapture(id);
    } catch {
      /* jsdom, or the pointer is already gone */
    }
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (id === null || ((e as PointerEvent).pointerId ?? 0) !== id) return;
    const p = { x: e.clientX, y: e.clientY };
    if (!ghost && Math.hypot(p.x - start.x, p.y - start.y) > DRAG_SLOP) {
      ghost = h('div', { class: 'hv-ghost' }, o.ghost);
      env.layer.append(ghost);
      el.classList.add('dragging');
    }
    if (ghost) {
      place(p);
      o.onMove?.(p);
    }
  });
  const end = (e: Event, cancelled: boolean): void => {
    if (id === null || ((e as PointerEvent).pointerId ?? 0) !== id) return;
    id = null;
    const p = { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY };
    const dragged = ghost !== null;
    drop();
    try {
      el.releasePointerCapture((e as PointerEvent).pointerId);
    } catch {
      /* ignore */
    }
    if (cancelled) return;
    if (dragged) o.onDrop?.(p);
    else o.onTap();
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
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
