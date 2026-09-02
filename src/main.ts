import { registerSW } from 'virtual:pwa-register';
import { createAudio } from './core/audio';
import { createSpeech } from './core/speech';
import type { InstallState } from './app/deps';
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

const deps = { audio, speech, store, install };

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

// ---- Toddler-proofing: no pinch zoom, no long-press menus, no accidental selection. ----
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => e.preventDefault());

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
  } else {
    unmount = mountHome(root, deps);
  }
});
