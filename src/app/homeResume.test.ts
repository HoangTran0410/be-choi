import { describe, it, expect, beforeEach } from 'vitest';
import { createPhotoStore } from '../core/photos';
import type { Speech } from '../core/speech';
import { fakeAudio } from '../core/testing';
import type { AppDeps } from './deps';
import { mountHome } from './home';
import { openParentPanel } from './parentPanel';
import { GAMES } from './registry';
import { createStore } from './storage';

(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = '0.0.0-test';

function deps(): AppDeps {
  const noop = () => undefined;
  const speech: Speech = { warm: noop, setEnabled: noop, available: () => true, speak: noop, cancel: noop };
  return {
    audio: fakeAudio(),
    speech,
    store: createStore(),
    install: { available: () => false, prompt: noop, isIOS: false, isStandalone: true },
    update: { force: async () => true },
    photos: createPhotoStore(async () => 'data:image/jpeg;base64,'),
  };
}

function btn(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('.panel button')].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`no button ${label}`);
  return found as HTMLButtonElement;
}

describe('home: resume and age', () => {
  let root: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    location.hash = '';
    root = document.createElement('div');
    document.body.replaceChildren(root);
  });

  it('has no resume tile before anything was played', () => {
    const unmount = mountHome(root, deps());
    expect(root.querySelector('.tile-resume')).toBeNull();
    unmount();
  });

  it('offers the last game played and opens it in one tap', () => {
    const d = deps();
    const g = GAMES[3]!;
    d.store.setLastPlayed(g.id);
    const unmount = mountHome(root, d);
    const tile = root.querySelector<HTMLElement>('.tile-resume')!;
    expect(tile.getAttribute('aria-label')).toBe(`Chơi tiếp ${g.title}`);
    tile.click();
    expect(location.hash).toContain(g.id);
    unmount();
  });

  it('remembers the last game across sessions', () => {
    createStore().setLastPlayed('shapes');
    expect(createStore().lastPlayed()).toBe('shapes');
  });

  it('puts a picture on every section heading', () => {
    const unmount = mountHome(root, deps());
    const titles = root.querySelectorAll('.section-regular .section-title');
    expect(titles.length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.section-regular .section-icon').length).toBe(titles.length);
    unmount();
  });

  it('hides games for older children when an age is set, but not favourites', () => {
    const d = deps();
    const hard = GAMES.find((g) => g.id === 'pattern')!;
    d.store.setSettings({ age: 2 });
    d.store.toggleFavorite(hard.id);
    const unmount = mountHome(root, d);
    expect(root.querySelectorAll(`.section-regular .tile[aria-label="${hard.title}"]`).length).toBe(0);
    expect(root.querySelectorAll(`.section-favorites .tile[aria-label="${hard.title}"]`).length).toBe(1);
    unmount();
  });

  it('redraws when a parent changes the age in the panel', () => {
    const d = deps();
    const hard = GAMES.find((g) => g.id === 'pattern')!;
    const unmount = mountHome(root, d);
    const sel = `.section-regular .tile[aria-label="${hard.title}"]`;
    expect(root.querySelectorAll(sel).length).toBe(1);
    openParentPanel(d);
    btn('2 tuổi').click();
    expect(root.querySelectorAll(sel).length).toBe(0);
    btn('Tất cả').click();
    expect(root.querySelectorAll(sel).length).toBe(1);
    unmount();
  });

  it('rest reminder is off by default and a parent can pick a time', () => {
    const d = deps();
    expect(d.store.settings().breakMinutes).toBe(0);
    openParentPanel(d);
    btn("15'").click();
    expect(d.store.settings().breakMinutes).toBe(15);
    btn('Tắt').click();
    expect(d.store.settings().breakMinutes).toBe(0);
  });
});
