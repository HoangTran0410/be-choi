import { describe, it, expect, afterEach, vi } from 'vitest';
import { parsePrecacheManifest, precacheKeys, precacheProgress, watchUpdateProgress } from './updateProgress';

// Shaped like the tail of a generated dist/sw.js.
const SW = `define(["./workbox-dcde9eb3"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"assets/index-abc.js",revision:null},{url:"index.html",revision:"79bc"},{url:"sounds/yawn.m4a",revision:"f215"}],{}),e.cleanupOutdatedCaches()}));`;

describe('parsePrecacheManifest', () => {
  it('reads every entry out of a minified worker', () => {
    expect(parsePrecacheManifest(SW)).toEqual([
      { url: 'assets/index-abc.js', revision: null },
      { url: 'index.html', revision: '79bc' },
      { url: 'sounds/yawn.m4a', revision: 'f215' },
    ]);
  });

  it('also reads quoted keys with spaces', () => {
    expect(parsePrecacheManifest('[{ "url": "a.png", "revision": "1" }, { "url": "b.js", "revision": null }]')).toEqual([
      { url: 'a.png', revision: '1' },
      { url: 'b.js', revision: null },
    ]);
  });

  it('finds nothing in a script without a list', () => {
    expect(parsePrecacheManifest('self.addEventListener("fetch",()=>{})')).toEqual([]);
  });
});

describe('precacheKeys', () => {
  it('matches the keys Workbox caches under, relative to the worker', () => {
    expect(precacheKeys(parsePrecacheManifest(SW), 'https://x.test/app/sw.js')).toEqual([
      'https://x.test/app/assets/index-abc.js',
      'https://x.test/app/index.html?__WB_REVISION__=79bc',
      'https://x.test/app/sounds/yawn.m4a?__WB_REVISION__=f215',
    ]);
  });

  it('counts a repeated entry once', () => {
    const e = { url: 'a.js', revision: null };
    expect(precacheKeys([e, e], 'https://x.test/sw.js')).toHaveLength(1);
  });
});

describe('precacheProgress', () => {
  const wanted = ['a', 'b', 'c', 'd'];

  it('is the share of the list already cached', () => {
    expect(precacheProgress(wanted, new Set())).toBe(0);
    expect(precacheProgress(wanted, new Set(['a', 'c']))).toBe(0.5);
    expect(precacheProgress(wanted, new Set(wanted))).toBe(1);
  });

  it('ignores cache entries from other builds', () => {
    // An old copy of a changed file sits under its old revision until activation.
    expect(precacheProgress(wanted, new Set(['a', 'old-b', 'old-c']))).toBe(0.25);
  });

  it('has no number when there is no list', () => {
    expect(precacheProgress([], new Set(['a']))).toBeNull();
  });
});

describe('watchUpdateProgress', () => {
  afterEach(() => {
    document.querySelector('.update-bar')?.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function fakeWorker() {
    const w = new EventTarget() as EventTarget & { state: string; scriptURL: string };
    w.state = 'installing';
    w.scriptURL = 'https://x.test/sw.js';
    return w;
  }

  it('shows the percentage while installing and "xong" when installed', async () => {
    vi.useFakeTimers();
    const cached = new Set<string>(['https://x.test/assets/index-abc.js']);
    vi.stubGlobal('fetch', async () => new Response(SW));
    vi.stubGlobal('caches', {
      keys: async () => ['workbox-precache-v2-https://x.test/', 'ambience'],
      open: async () => ({ keys: async () => [...cached].map((url) => ({ url })) }),
    });
    const worker = fakeWorker();
    const reg = Object.assign(new EventTarget(), { installing: worker }) as unknown as ServiceWorkerRegistration;
    watchUpdateProgress(reg);

    const bar = document.querySelector('.update-bar');
    expect(bar).not.toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(bar?.textContent).toContain('33%');

    cached.add('https://x.test/index.html?__WB_REVISION__=79bc');
    await vi.advanceTimersByTimeAsync(500);
    expect(bar?.textContent).toContain('67%');

    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    expect(bar?.textContent).toContain('✓');
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector('.update-bar')).toBeNull();
  });

  it('falls back to a bar without a number when nothing can be read', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('caches', {
      keys: async () => {
        throw new Error('no caches');
      },
    });
    const reg = Object.assign(new EventTarget(), { installing: fakeWorker() }) as unknown as ServiceWorkerRegistration;
    watchUpdateProgress(reg);
    await vi.advanceTimersByTimeAsync(1000);
    const bar = document.querySelector('.update-bar');
    expect(bar?.classList.contains('indeterminate')).toBe(true);
    expect(bar?.textContent).not.toContain('%');
  });

  it('removes the bar when the install fails', async () => {
    vi.stubGlobal('fetch', async () => new Response(SW));
    vi.stubGlobal('caches', { keys: async () => [], open: async () => ({ keys: async () => [] }) });
    const worker = fakeWorker();
    const reg = Object.assign(new EventTarget(), { installing: worker }) as unknown as ServiceWorkerRegistration;
    watchUpdateProgress(reg);
    worker.state = 'redundant';
    worker.dispatchEvent(new Event('statechange'));
    expect(document.querySelector('.update-bar')).toBeNull();
  });
});
