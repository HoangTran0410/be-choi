/**
 * Keep `--app-h` equal to the height the app may actually draw into.
 *
 * `100dvh` is the right answer and on a fresh launch it is also the true one.
 * But an installed PWA that Android has restored from the background can come
 * back holding the layout viewport it had before: the app lays itself out for a
 * screen taller than the one in front of the child, and the bottom of every game
 * — the tray, the last row of buttons — sits under the navigation bar until the
 * app is killed and opened again. The visual viewport is measured separately and
 * does not go stale in the same way, so the smaller of the two is the honest
 * answer, and it is re-read every time the app comes back to the front.
 */

/**
 * Chrome resizes the window a moment *after* handing the app back, and again
 * after it settles into full screen. One reading on the way in is not enough.
 */
const SETTLE_MS: readonly number[] = [120, 500, 1200];

/** The custom property `base.css` feeds to `body`, and the panels to `max-height`. */
export const APP_H = '--app-h';

/** Start syncing. Returns a function that stops and hands `100dvh` back. */
export function watchViewport(): () => void {
  const root = document.documentElement;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const apply = (): void => {
    const layout = window.innerHeight || 0;
    const visual = window.visualViewport?.height ?? 0;
    // Either can be missing; when both are here the smaller one wins, because
    // drawing past it is precisely the bug this is here for.
    const h = Math.min(layout || Infinity, visual || Infinity);
    // Nothing to say (no window metrics at all): leave the CSS fallback alone.
    if (!Number.isFinite(h) || h <= 0) root.style.removeProperty(APP_H);
    else root.style.setProperty(APP_H, `${Math.round(h)}px`);
  };

  const settle = (): void => {
    apply();
    for (const ms of SETTLE_MS) {
      const id = setTimeout(() => {
        timers.delete(id);
        apply();
      }, ms);
      timers.add(id);
    }
  };

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') settle();
  };

  const vv = window.visualViewport;
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', settle);
  window.addEventListener('pageshow', settle);
  document.addEventListener('visibilitychange', onVisible);
  vv?.addEventListener('resize', apply);
  settle();

  return () => {
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', settle);
    window.removeEventListener('pageshow', settle);
    document.removeEventListener('visibilitychange', onVisible);
    vv?.removeEventListener('resize', apply);
    for (const id of timers) clearTimeout(id);
    timers.clear();
    root.style.removeProperty(APP_H);
  };
}
