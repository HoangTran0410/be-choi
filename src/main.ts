import { registerSW } from 'virtual:pwa-register';
import { createAudio } from './core/audio';
import { createPhotoStore } from './core/photos';
import { createSpeech } from './core/speech';
import { watchViewport } from './core/viewport';
import type { InstallState, UpdateState } from './app/deps';
import { mountAlbum } from './app/album';
import { mountHome } from './app/home';
import { findGame } from './app/registry';
import { hrefFor, startRouter } from './app/router';
import { mountShell } from './app/shell';
import { createStore } from './app/storage';
import { applyTheme, watchSystemTheme } from './app/theme';
import { currentBuild } from './app/buildTime';
import { announceIfJustUpdated, watchForUpdates } from './app/updateCheck';
import { UPDATING_FLAG, watchUpdateProgress } from './app/updateProgress';
import './styles/base.css';
import './styles/update.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app missing');

// Before anything is mounted: an app restored from the background can otherwise
// lay itself out for a screen taller than the one it is on. See core/viewport.ts.
watchViewport();

const audio = createAudio();
const speech = createSpeech();
const store = createStore();
const photos = createPhotoStore();
const settings = store.settings();
audio.setEnabled(settings.sound);
speech.setEnabled(settings.voice);
applyTheme(settings.theme);
watchSystemTheme(() => store.settings().theme);

// ---- PWA install prompt (Android / desktop). iOS needs manual steps. ----
type BeforeInstallPromptEvent = Event & { prompt(): Promise<void> };
let deferredInstall: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e as BeforeInstallPromptEvent;
});
const install: InstallState = {
  available: () => deferredInstall !== null,
  prompt: () => {
    void deferredInstall?.prompt();
    deferredInstall = null;
  },
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  isStandalone:
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true,
};

// ---- "give me the new version now", from the parent panel ----
/**
 * The app looks for new builds by itself and offers them (app/updateCheck.ts), but only
 * through the service worker, and a worker in a bad way can keep missing them. This is
 * the parent's hammer: drop the worker serving the old build and come back through the
 * network. The cache-busting
 * search param is for iOS, where a plain reload can still be answered from the HTTP cache.
 */
const update: UpdateState = {
  force: async () => {
    if (!navigator.onLine) return false;
    // The reloaded page shows the download as "bản mới", not as a first-time save.
    try {
      sessionStorage.setItem(UPDATING_FLAG, '1');
    } catch {
      /* only changes the wording */
    }
    // Only the worker goes, not the caches. Workbox keys every file by its revision and
    // skips any it already holds, so the fresh worker fetches just what changed; a stale
    // copy can never be served for a new revision. Wiping them meant every sound again.
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    const fresh = new URL(location.href);
    fresh.searchParams.set('v', Date.now().toString(36));
    location.replace(fresh.href);
    return true;
  },
};

const deps = { audio, speech, store, install, update, photos };

// ---- Unlock audio/speech inside the first user gesture; keep resuming after backgrounding. ----
let warmed = false;
document.addEventListener(
  'pointerdown',
  () => {
    audio.unlock();
    if (!warmed) {
      warmed = true;
      speech.warm();
    }
  },
  { capture: true, passive: true },
);

// ---- Toddler-proofing: no pinch zoom, no double-tap zoom, no long-press menus, no selection. ----
// iOS Safari ignores `user-scalable=no`, and `touch-action` alone still lets a fast
// double tap zoom. Inside the play area every touch is ours: cancelling touchstart /
// touchmove there kills zoom, scroll, the tap-vs-drag delay and the magnifier, so
// pointermove follows the finger immediately. Games use Pointer Events, which keep firing.
const inStage = (e: Event) => (e.target as Element | null)?.closest?.('.stage') !== null;
/**
 * The exception: a panel laid over the stage that is taller than the screen.
 * It is not the play area — it is a list to look through — and cancelling its
 * touches leaves the bottom of a long one unreachable.
 */
const SCROLLING_PANEL = '.pp-panel';
const cancelStageTouch = (e: TouchEvent) => {
  if ((e.target as Element | null)?.closest?.(SCROLLING_PANEL)) return;
  if (inStage(e)) e.preventDefault();
};
document.addEventListener('touchstart', cancelStageTouch, { passive: false });
document.addEventListener('touchmove', cancelStageTouch, { passive: false });
// Outside the stage (home grid, panels) we still need scrolling and clicks, so only the
// second tap of a quick double tap is cancelled, which is what triggers zoom.
let lastTouchEnd = 0;
let lastTouchX = 0;
let lastTouchY = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    const t = e.changedTouches[0];
    const x = t?.clientX ?? 0;
    const y = t?.clientY ?? 0;
    const near = Math.abs(x - lastTouchX) < 30 && Math.abs(y - lastTouchY) < 30;
    // Only a second tap on (almost) the same spot can zoom; two quick taps on different buttons must both work.
    if (now - lastTouchEnd < 350 && near && !inStage(e)) e.preventDefault();
    lastTouchEnd = now;
    lastTouchX = x;
    lastTouchY = y;
  },
  { passive: false },
);
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => e.preventDefault());

// The download itself is the slow part (every recorded sound comes with it), so the
// page shows how far it has got. See app/updateProgress.ts.
// New builds are looked for on opening and on coming back to the app, and offered on
// the home screen rather than swapped in mid-game. See app/updateCheck.ts.
let registration: ServiceWorkerRegistration | undefined;
const updates = watchForUpdates({
  current: currentBuild() ?? '',
  base: import.meta.env.BASE_URL,
  refreshWorker: 'serviceWorker' in navigator ? async () => registration?.update() : undefined,
  apply: () => {
    // With a waiting worker this lets it in and reloads; without one, just reload.
    if (registration?.waiting) void updateSW(true);
    else location.reload();
  },
});
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW: (_url, reg) => {
    registration = reg;
    watchUpdateProgress(reg);
    void updates.check(true);
  },
  onNeedRefresh: () => updates.ready(),
});
announceIfJustUpdated(currentBuild() ?? '');

// ---- Routing ----
let unmount: (() => void) | null = null;
startRouter((route) => {
  unmount?.();
  unmount = null;
  if (route.name === 'game') {
    const entry = findGame(route.id);
    if (!entry) {
      location.hash = hrefFor({ name: 'home' });
      return;
    }
    unmount = mountShell(root, entry, deps);
  } else if (route.name === 'album') {
    unmount = mountAlbum(root, deps);
  } else {
    unmount = mountHome(root, deps);
  }
});
