import { registerSW } from 'virtual:pwa-register';
import { createAudio } from './core/audio';
import { createPhotoStore } from './core/photos';
import { createSpeech } from './core/speech';
import type { InstallState } from './app/deps';
import { mountAlbum } from './app/album';
import { mountHome } from './app/home';
import { findGame } from './app/registry';
import { hrefFor, startRouter } from './app/router';
import { mountShell } from './app/shell';
import { createStore } from './app/storage';
import './styles/base.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app missing');

const audio = createAudio();
const speech = createSpeech();
const store = createStore();
const photos = createPhotoStore();
const settings = store.settings();
audio.setEnabled(settings.sound);
speech.setEnabled(settings.voice);

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

const deps = { audio, speech, store, install, photos };

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
const cancelStageTouch = (e: TouchEvent) => {
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

registerSW({ immediate: true });

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
