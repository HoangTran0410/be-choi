import { h } from '../core/dom';

/**
 * How far a new build has got onto this device.
 *
 * Installing a service worker means Workbox downloading every file in its precache list,
 * one after another, and the recorded sounds make that list heavy. None of it is visible
 * from the page, and the worker says nothing while it works. What the page can see is the
 * list itself (it is written into the worker script) and the cache it is filling, so it
 * measures one against the other. Anything it cannot read leaves the bar without a number
 * rather than breaking the app.
 */

export interface PrecacheEntry {
  url: string;
  revision: string | null;
}

/**
 * The precache list, read out of the generated worker script. Workbox writes it as an
 * object literal, `{url:"index.html",revision:"79bc…"}` when minified; quoted keys and
 * spaces are accepted too, in case the output ever comes out unminified.
 */
export function parsePrecacheManifest(swSource: string): PrecacheEntry[] {
  const entry = /\{\s*"?url"?\s*:\s*"([^"]+)"\s*,\s*"?revision"?\s*:\s*(?:"([^"]*)"|null)\s*\}/g;
  return [...swSource.matchAll(entry)].map((m) => ({ url: m[1] ?? '', revision: m[2] || null }));
}

/**
 * The cache keys Workbox stores those entries under (mirrors workbox-precaching's
 * createCacheKey). A file with a revision is kept as `url?__WB_REVISION__=rev`, which is
 * what makes a changed file count as missing until the new copy has been downloaded.
 */
export function precacheKeys(entries: readonly PrecacheEntry[], base: string): string[] {
  const keys = entries.map(({ url, revision }) => {
    const key = new URL(url, base);
    if (revision) key.searchParams.set('__WB_REVISION__', revision);
    return key.href;
  });
  return [...new Set(keys)];
}

/**
 * Share of the list already in the cache, 0–1, or null when there is no list to measure
 * against. Files unchanged since the last build are already there and Workbox skips them,
 * so an ordinary update starts part way along instead of at zero.
 */
export function precacheProgress(wanted: readonly string[], cached: ReadonlySet<string>): number | null {
  if (!wanted.length) return null;
  const have = wanted.filter((k) => cached.has(k)).length;
  return have / wanted.length;
}

/** Every URL in Workbox's precache cache(s). Throws if Cache Storage is unavailable. */
async function cachedPrecacheUrls(): Promise<Set<string>> {
  const names = (await caches.keys()).filter((n) => n.startsWith('workbox-precache'));
  const out = new Set<string>();
  for (const name of names) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) out.add(req.url);
  }
  return out;
}

async function loadWanted(worker: ServiceWorker): Promise<string[]> {
  try {
    // no-cache: revalidate, so an older sw.js sitting in the HTTP cache is not what gets read.
    const res = await fetch(worker.scriptURL, { cache: 'no-cache' });
    if (!res.ok) return [];
    return precacheKeys(parsePrecacheManifest(await res.text()), worker.scriptURL);
  } catch {
    return [];
  }
}

const POLL_MS = 400;
/** A bar that vanishes the instant it reaches 100% reads as a glitch; let "xong" be seen. */
const DONE_LINGER_MS = 1200;
/** Set by the parent panel's "Tải bản mới nhất" just before the reload that starts the download. */
export const UPDATING_FLAG = 'be-choi:updating';

/**
 * Follows one installing worker until it is installed (or given up on), showing the bar
 * the whole time. Only one bar at a time: a second worker found mid-install replaces it.
 */
function followInstall(worker: ServiceWorker, isUpdate: boolean): void {
  document.querySelector('.update-bar')?.remove();
  const label = isUpdate ? 'Đang tải bản mới' : 'Đang lưu để chơi không cần mạng';
  const text = h('span', { class: 'update-bar-text' }, `${label}…`);
  const fill = h('span', { class: 'update-bar-fill' });
  // Starts without a number: the list has not been read yet.
  const bar = h(
    'div',
    { class: 'update-bar indeterminate', role: 'progressbar', 'aria-label': label },
    text,
    h('span', { class: 'update-bar-track' }, fill),
  );
  document.body.append(bar);

  let wanted: string[] = [];
  let timer = 0;
  let stopped = false;

  const show = (p: number | null) => {
    bar.classList.toggle('indeterminate', p === null);
    if (p === null) {
      bar.removeAttribute('aria-valuenow');
      text.textContent = `${label}…`;
      fill.style.width = '';
      return;
    }
    const pct = Math.round(p * 100);
    bar.setAttribute('aria-valuenow', String(pct));
    text.textContent = `${label}… ${pct}%`;
    fill.style.width = `${pct}%`;
  };

  const tick = async () => {
    if (stopped) return;
    let p: number | null = null;
    try {
      p = precacheProgress(wanted, await cachedPrecacheUrls());
    } catch {
      /* no Cache Storage to look in: keep the bar moving without a number */
    }
    // The install may have finished while the cache was being read; don't undo "xong".
    if (stopped) return;
    show(p);
    timer = window.setTimeout(() => void tick(), POLL_MS);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    worker.removeEventListener('statechange', onState);
    try {
      sessionStorage.removeItem(UPDATING_FLAG);
    } catch {
      /* storage blocked: the flag only picks the wording */
    }
    if (worker.state === 'redundant') {
      // The install failed (usually the network dropped); the old build keeps working.
      bar.remove();
      return;
    }
    bar.classList.remove('indeterminate');
    fill.style.width = '100%';
    text.textContent = isUpdate ? 'Đã tải xong bản mới ✓' : 'Đã lưu, chơi được khi không có mạng ✓';
    setTimeout(() => bar.remove(), DONE_LINGER_MS);
  };
  const onState = () => {
    if (worker.state !== 'installing') stop();
  };
  worker.addEventListener('statechange', onState);

  void loadWanted(worker).then((w) => {
    wanted = w;
    void tick();
  });
  onState();
}

/**
 * Hook the bar up to a registration: the worker installing right now (the first visit,
 * or the reload after "Tải bản mới nhất") and any found later by the checks in app/updateCheck.ts.
 */
export function watchUpdateProgress(registration: ServiceWorkerRegistration | undefined): void {
  if (!registration || typeof caches === 'undefined') return;
  const isUpdate = () => {
    try {
      if (sessionStorage.getItem(UPDATING_FLAG)) return true;
    } catch {
      /* fall through */
    }
    return !!navigator.serviceWorker?.controller;
  };
  // Registration and updatefound can both hand over the same worker; follow it once.
  const seen = new WeakSet<ServiceWorker>();
  const follow = (worker: ServiceWorker | null) => {
    if (!worker || seen.has(worker)) return;
    seen.add(worker);
    followInstall(worker, isUpdate());
  };
  follow(registration.installing);
  registration.addEventListener('updatefound', () => follow(registration.installing));
}
