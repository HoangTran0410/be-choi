import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPhotoStore } from '../core/photos';
import type { Speech } from '../core/speech';
import { fakeAudio } from '../core/testing';
import type { GameModule } from '../core/types';
import type { AppDeps } from './deps';
import type { GameEntry } from './registry';
import { mountShell } from './shell';
import { createStore } from './storage';

function fakeSpeech(): Speech {
  const noop = () => undefined;
  return { warm: noop, setEnabled: noop, available: () => true, speak: noop, cancel: noop };
}

function deps(): AppDeps {
  return {
    audio: fakeAudio(),
    speech: fakeSpeech(),
    store: createStore(),
    install: { available: () => false, prompt: () => undefined, isIOS: false, isStandalone: true },
    update: { force: async () => true },
    photos: createPhotoStore(async () => 'data:image/jpeg;base64,'),
  };
}

/** A game that mounts nothing, so the shell is all that is under test. */
function entry(night?: boolean): GameEntry {
  const meta = { id: 'test', title: 'Thử', icon: '🧪', color: '#fff', skill: 'nature', intro: 'Chơi nhé!', ...(night ? { night } : {}) };
  const mod: GameModule = { ...meta, start: () => undefined } as GameModule;
  return { ...meta, load: () => Promise.resolve({ default: mod }) } as GameEntry;
}

const chrome = (): string | null => document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;

describe('game shell', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.head.append(Object.assign(document.createElement('meta'), { name: 'theme-color', content: '#fb923c' }));
    root = document.createElement('div');
    document.body.append(root);
  });

  afterEach(() => {
    root.remove();
    document.querySelector('meta[name="theme-color"]')?.remove();
    delete document.documentElement.dataset.theme;
    localStorage.clear();
  });

  it('leaves a daytime game in the app’s own colours', () => {
    const unmount = mountShell(root, entry(), deps());
    expect(root.querySelector('.shell')?.classList.contains('shell-night')).toBe(false);
    expect(chrome()).toBe('#fb923c');
    unmount();
  });

  it('dresses down for a game set after dark, and dresses back on the way out', () => {
    const unmount = mountShell(root, entry(true), deps());
    expect(root.querySelector('.shell')?.classList.contains('shell-night')).toBe(true);
    // The strip above the page belongs to the browser; it goes dark too.
    expect(chrome()).toBe('#0a1226');

    unmount();
    // Back to whatever the parent chose for the rest of the app.
    expect(chrome()).toBe('#fb923c');
  });

  it('puts the parent’s own theme back, not a guess at it', () => {
    const d = deps();
    d.store.setSettings({ theme: 'dark' });
    const unmount = mountShell(root, entry(true), d);
    expect(chrome()).toBe('#0a1226');
    unmount();
    expect(chrome()).toBe('#1c1917');
  });
});
