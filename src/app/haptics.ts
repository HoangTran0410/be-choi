/** A tiny tick under the finger where the device supports it (Android; iOS has no vibrate). */
export function buzz(ms = 10): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch {
    /* some browsers throw without a user gesture */
  }
}

/** Buzz on every button press, anywhere in the app. Returns a function that stops it. */
export function installTapHaptics(doc: Document = document): () => void {
  const onDown = (e: Event) => {
    if ((e.target as Element | null)?.closest?.('button')) buzz();
  };
  doc.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  return () => doc.removeEventListener('pointerdown', onDown, { capture: true });
}

/** Width of the strip along each side where the system's back / app-switch swipes start. */
export const EDGE_PX = 24;

export function isEdgeTouch(x: number, width: number, edge = EDGE_PX): boolean {
  return x <= edge || x >= width - edge;
}

/**
 * Swallow touches that begin right at the left or right edge, so the browser's
 * swipe-back / swipe-forward never fires from a little hand sweeping the screen.
 * Scrolling lists keep working: their content sits inside the strip.
 */
export function installEdgeGuard(win: Window = window): () => void {
  const onStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t && isEdgeTouch(t.clientX, win.innerWidth) && e.cancelable) e.preventDefault();
  };
  win.document.addEventListener('touchstart', onStart, { passive: false });
  return () => win.document.removeEventListener('touchstart', onStart);
}
