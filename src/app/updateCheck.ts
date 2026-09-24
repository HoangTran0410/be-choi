import { h } from '../core/dom';
import { formatBuildTime } from './buildTime';

/**
 * Looking for a new build, and offering it.
 *
 * A browser only re-checks the service worker when a page is navigated to, and an app
 * on a tablet is hardly ever navigated to: it is switched to, from the background,
 * for weeks. So the app asks for itself — on opening, on coming back to the front, on
 * getting the network back, and every so often while it stays open. A new build then
 * downloads in the background (app/updateProgress.ts shows how far), waits, and a
 * notice on the home screen offers it. Nothing reloads by itself: that would pull a
 * child out of the middle of a game.
 */

/** Never more often than this, however many times the app is switched to. */
export const CHECK_GAP_MS = 60_000;
/** And at least this often while it stays open. */
export const CHECK_EVERY_MS = 30 * 60_000;
/** Set just before the reload that lets a new build in, to say so once it has. */
export const JUST_UPDATED_FLAG = 'be-choi:just-updated';

/** True when `remote` is a later build stamp than `current`. Unreadable stamps are never newer. */
export function isNewerBuild(remote: string | undefined, current: string | undefined): boolean {
  const r = Date.parse(remote ?? '');
  const c = Date.parse(current ?? '');
  return Number.isFinite(r) && Number.isFinite(c) && r > c;
}

/** The build the server has right now, or null offline / on any trouble. */
export async function fetchLiveBuild(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}version.json?t=${Date.now().toString(36)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: unknown };
    return typeof data.build === 'string' ? data.build : null;
  } catch {
    return null;
  }
}

export interface UpdateCheck {
  /** Ask now (still throttled by CHECK_GAP_MS unless `force`). */
  check(force?: boolean): Promise<void>;
  /** The worker has a new build downloaded and waiting: offer it. */
  ready(): void;
  stop(): void;
}

export interface UpdateCheckDeps {
  /** Re-fetch the service worker; resolves when the browser has looked. Absent without one. */
  refreshWorker?: () => Promise<unknown>;
  /** Let the waiting build in and reload onto it. */
  apply: () => void;
  /** Build stamp of the running app. */
  current: string;
  base: string;
  now?: () => number;
}

export function watchForUpdates(deps: UpdateCheckDeps): UpdateCheck {
  const now = deps.now ?? Date.now;
  let last = -Infinity;
  let live: string | null = null;
  let offered = false;
  let dismissed = false;
  let notice: HTMLElement | null = null;

  function show(): void {
    if (dismissed || notice) return;
    const when = formatBuildTime(live ?? undefined)?.replace('Bản dựng ', 'dựng ');
    const go = h('button', { class: 'update-notice-go', type: 'button' }, 'Cập nhật');
    const close = h('button', { class: 'update-notice-close', type: 'button', 'aria-label': 'để sau' }, '✕');
    notice = h(
      'div',
      { class: 'update-notice', role: 'status' },
      h('span', { class: 'update-notice-text' }, when ? `✨ Có bản mới · ${when}` : '✨ Có bản mới'),
      go,
      close,
    );
    go.addEventListener('click', () => {
      go.disabled = true;
      go.textContent = 'Đang cập nhật…';
      try {
        sessionStorage.setItem(JUST_UPDATED_FLAG, '1');
      } catch {
        /* only the "done" toast depends on it */
      }
      deps.apply();
    });
    close.addEventListener('click', () => {
      // Until the app is next opened: a parent who said "later" means later.
      dismissed = true;
      notice?.remove();
      notice = null;
    });
    document.body.append(notice);
  }

  async function check(force = false): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (!force && now() - last < CHECK_GAP_MS) return;
    last = now();
    const remote = await fetchLiveBuild(deps.base);
    if (remote) live = remote;
    if (!isNewerBuild(remote ?? undefined, deps.current)) return;
    if (deps.refreshWorker) {
      // The worker downloads the new build; ready() fires once it is waiting.
      await deps.refreshWorker().catch(() => undefined);
      if (offered) show();
    } else {
      // No service worker (dev, or a browser without one): a reload is all it takes.
      offered = true;
      show();
    }
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  const onOnline = () => void check(true);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void check();
  }, CHECK_EVERY_MS);

  return {
    check,
    ready() {
      offered = true;
      // The browser can find the build on its own; fetch its stamp for the notice.
      if (live) show();
      else void fetchLiveBuild(deps.base).then((b) => ((live = b), show()));
    },
    stop() {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
      notice?.remove();
    },
  };
}

/** After the reload onto a new build: say it worked, briefly, and which build it is. */
export function announceIfJustUpdated(current: string): void {
  let flagged = false;
  try {
    flagged = sessionStorage.getItem(JUST_UPDATED_FLAG) === '1';
    sessionStorage.removeItem(JUST_UPDATED_FLAG);
  } catch {
    return;
  }
  if (!flagged) return;
  const when = formatBuildTime(current);
  const toast = h('div', { class: 'update-notice update-notice-done', role: 'status' }, `✓ Đã cập nhật${when ? ` · ${when}` : ''}`);
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3500);
}
