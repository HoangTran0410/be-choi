/**
 * A tap that fires when the finger is lifted in place, so a swipe that starts on the element
 * scrolls its container instead of pressing it. Missing pointer coordinates (tests) count as
 * no movement.
 */
const MOVE_LIMIT = 12;
const HOLD_LIMIT_MS = 900;

export function tapOnRelease(el: HTMLElement, onTap: () => void, ctx?: { onCleanup(fn: () => void): void }): () => void {
  let down: { x: number; y: number; t: number } | null = null;
  const onDown = (e: Event): void => {
    const p = e as PointerEvent;
    if (p.isPrimary === false) return;
    down = { x: p.clientX || 0, y: p.clientY || 0, t: performance.now() };
  };
  const onUp = (e: Event): void => {
    const p = e as PointerEvent;
    const d = down;
    down = null;
    if (!d) return;
    const moved = Math.hypot((p.clientX || 0) - d.x, (p.clientY || 0) - d.y);
    if (moved > MOVE_LIMIT || performance.now() - d.t > HOLD_LIMIT_MS) return;
    onTap();
  };
  const onCancel = (): void => {
    down = null;
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  const dispose = (): void => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
  };
  ctx?.onCleanup(dispose);
  return dispose;
}
