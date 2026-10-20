/**
 * A tap that works for small hands: fires on `pointerdown` (no 300 ms wait, no
 * click that a wobbly finger turns into a drag), swallows the compatibility mouse
 * events that would fire it twice, ignores a second press on the same element
 * within `cooldownMs`, and gives a light "pressed" look and optional buzz.
 *
 * One exception: an element inside a list the finger scrolls (its CSS says `touch-action: pan-…`,
 * see main.ts) fires when the finger lifts where it landed instead, so a swipe that starts on it
 * scrolls the list rather than choosing it. The browser cancels the pointer once it scrolls.
 */

export interface TapOptions {
  /** Ignore another tap on this element for this long (ms). Default 120. 0 turns it off. */
  cooldownMs?: number;
  /** Add the `is-tapped` class for a moment. Default true. */
  feedback?: boolean;
  /** `navigator.vibrate(ms)` on tap. Default 0 (none). */
  haptic?: number;
  /** Call `preventDefault()` on the press (stops text selection, ghost clicks, zoom). Default true. */
  preventDefault?: boolean;
  /** Only the primary pointer (first finger). Default true. */
  primaryOnly?: boolean;
  /** Unregister when the child leaves the game. */
  ctx?: { onCleanup(fn: () => void): void };
}

const FEEDBACK_MS = 140;
/** How far a finger in a scrolling list may wander and still count as a tap (px). */
const SCROLL_SLOP = 12;
const scrolls = (el: Element): boolean => (getComputedStyle(el).touchAction ?? '').includes('pan');

/** Returns a function that removes the listener. */
export function makeTappable(el: HTMLElement, onTap: (e: PointerEvent) => void, opts: TapOptions = {}): () => void {
  const cooldown = opts.cooldownMs ?? 120;
  const feedback = opts.feedback ?? true;
  const prevent = opts.preventDefault ?? true;
  const primaryOnly = opts.primaryOnly ?? true;
  let lastTap = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (pe: PointerEvent): void => {
    const now = performance.now();
    if (cooldown > 0 && now - lastTap < cooldown) return;
    lastTap = now;
    if (feedback) {
      el.classList.add('is-tapped');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        el.classList.remove('is-tapped');
      }, FEEDBACK_MS);
    }
    if (opts.haptic) navigator.vibrate?.(opts.haptic);
    onTap(pe);
  };
  /** Where a press in a scrolling list landed, until the finger lifts. */
  let held: { id: number; x: number; y: number } | null = null;
  const handler = (e: Event): void => {
    const pe = e as PointerEvent;
    if (primaryOnly && pe.isPrimary === false) return;
    if (prevent) e.preventDefault();
    if ((pe.pointerType === 'touch' || pe.pointerType === 'pen') && scrolls(el)) {
      held = { id: pe.pointerId, x: pe.clientX, y: pe.clientY };
      return;
    }
    fire(pe);
  };
  const onUp = (e: Event): void => {
    const pe = e as PointerEvent;
    const d = held;
    held = null;
    if (!d || pe.pointerId !== d.id || Math.hypot(pe.clientX - d.x, pe.clientY - d.y) > SCROLL_SLOP) return;
    fire(pe);
  };
  const onCancel = (): void => {
    held = null;
  };

  el.addEventListener('pointerdown', handler);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  const dispose = (): void => {
    el.removeEventListener('pointerdown', handler);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    if (timer) clearTimeout(timer);
    timer = null;
    el.classList.remove('is-tapped');
  };
  opts.ctx?.onCleanup(dispose);
  return dispose;
}
