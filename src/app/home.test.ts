import { describe, it, expect, beforeEach } from 'vitest';
import { createPhotoStore } from '../core/photos';
import type { Speech } from '../core/speech';
import { fakeAudio } from '../core/testing';
import type { AppDeps } from './deps';
import { mountHome } from './home';
import { GAMES } from './registry';
import { createStore } from './storage';

function deps(): AppDeps {
  const noop = () => undefined;
  const speech: Speech = { warm: noop, setEnabled: noop, available: () => true, speak: noop, speakSeq: () => Promise.resolve(false), cancel: noop };
  return {
    audio: fakeAudio(),
    speech,
    store: createStore(),
    install: { available: () => false, prompt: noop, isIOS: false, isStandalone: true },
    update: { force: async () => true },
    photos: createPhotoStore(async () => 'data:image/jpeg;base64,'),
  };
}

const heartOf = (root: HTMLElement, title: string) => root.querySelector<HTMLElement>(`.tile[aria-label="${title}"] .tile-heart`)!;
const favorites = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.section-favorites .tile')].map((t) => t.getAttribute('aria-label'));

describe('home favourites', () => {
  let root: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    location.hash = '';
    root = document.createElement('div');
    document.body.replaceChildren(root);
  });

  it('has no favourites section until something is liked', () => {
    const unmount = mountHome(root, deps());
    expect(root.querySelector('.section-favorites')).toBeNull();
    unmount();
  });

  it('shows a liked game at the top as well as in its own place, without opening it', () => {
    const d = deps();
    const unmount = mountHome(root, d);
    const [a, b] = [GAMES[5]!, GAMES[2]!];
    heartOf(root, a.title).click();
    heartOf(root, b.title).click();
    expect(location.hash).toBe('');
    expect(favorites(root)).toEqual([a.title, b.title]);
    // Still in its usual section: nothing below it moves.
    expect(root.querySelectorAll(`.section-regular .tile[aria-label="${a.title}"]`).length).toBe(1);
    expect(root.querySelectorAll(`.tile[aria-label="${a.title}"]`).length).toBe(2);
    root.querySelector<HTMLElement>(`.section-favorites .tile[aria-label="${a.title}"] .tile-heart`)!.click();
    expect(favorites(root)).toEqual([b.title]);
    expect(root.querySelectorAll(`.tile[aria-label="${a.title}"]`).length).toBe(1);
    unmount();
  });

  it('remembers favourites next time', () => {
    const d = deps();
    mountHome(root, d)();
    d.store.toggleFavorite(GAMES[0]!.id);
    const unmount = mountHome(root, deps());
    expect(favorites(root)).toEqual([GAMES[0]!.title]);
    unmount();
  });
});

describe('home today suggestions', () => {
  let root: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    location.hash = '';
    root = document.createElement('div');
    document.body.replaceChildren(root);
  });
  const today = () => [...root.querySelectorAll<HTMLElement>('.section-today .today-tile')].map((t) => t.getAttribute('aria-label'));

  it('shows three icon-only games', () => {
    const unmount = mountHome(root, deps());
    const tiles = [...root.querySelectorAll<HTMLElement>('.section-today .today-tile')];
    expect(tiles).toHaveLength(3);
    for (const t of tiles) expect(t.textContent).toBe(GAMES.find((g) => g.title === t.getAttribute('aria-label'))?.icon);
    unmount();
  });

  it('holds still for the day even after the child plays', () => {
    const d = deps();
    const a = mountHome(root, d);
    const first = today();
    a();
    for (const g of GAMES) d.store.recordPlay(g.id);
    const b = mountHome(root, d);
    expect(today()).toEqual(first);
    b();
  });

  it('goes away when the parent switches it off', () => {
    const d = deps();
    d.store.setSettings({ todayPick: false });
    const unmount = mountHome(root, d);
    expect(root.querySelector('.section-today')).toBeNull();
    unmount();
  });
});
