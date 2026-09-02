import type { AudioEngine } from '../core/audio';
import type { PhotoStore } from '../core/photos';
import type { Speech } from '../core/speech';
import type { Store } from './storage';

export interface InstallState {
  /** True when the browser offered a `beforeinstallprompt`. */
  available(): boolean;
  prompt(): void;
  /** iOS Safari never fires the prompt; we show manual instructions instead. */
  isIOS: boolean;
  isStandalone: boolean;
}

export interface AppDeps {
  audio: AudioEngine;
  speech: Speech;
  store: Store;
  install: InstallState;
  photos: PhotoStore;
}
