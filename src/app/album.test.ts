import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPhotoStore } from '../core/photos';
import type { Speech } from '../core/speech';
import { fakeAudio } from '../core/testing';
import { mountAlbum } from './album';
import type { AppDeps } from './deps';
import { createStore } from './storage';

function fakeSpeech(): Speech {
  const noop = () => undefined;
  return { warm: noop, setEnabled: noop, available: () => true, speak: noop, speakSeq: () => Promise.resolve(false), cancel: noop };
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

describe('the album', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    location.hash = '';
    root = document.createElement('div');
    document.body.append(root);
  });

  afterEach(() => {
    root.remove();
    location.hash = '';
  });

  it('says what the stickers are for, and goes there', () => {
    const d = deps();
    d.store.addSticker('🐻');
    mountAlbum(root, d);

    const use = root.querySelector<HTMLButtonElement>('.album-use');
    expect(use).not.toBeNull();
    expect(use?.textContent).toContain('Tô màu');

    use?.click();
    expect(location.hash).toBe('#/g/paint');
  });

  it('says nothing about stamps before there is a sticker to stamp with', () => {
    const d = deps();
    mountAlbum(root, d);
    expect(root.querySelector('.album-use')).toBeNull();
    expect(root.querySelector('.album-empty')).not.toBeNull();
  });

  it('shows sets with silhouettes for missing stickers and a near-complete hint', () => {
    const d = deps();
    for (const e of ['🍦', '🍩', '🍭']) d.store.addSticker(e);
    mountAlbum(root, d);
    const food = root.querySelector('[data-set="food"]');
    expect(food?.classList.contains('near')).toBe(true);
    expect(food?.querySelectorAll('.album-dots i.on').length).toBe(3);
    expect(food?.querySelectorAll('.album-silhouette').length).toBe(1);
    expect(root.querySelectorAll('.album-set').length).toBeGreaterThan(5);
    // Closest-to-full set is listed first.
    expect(root.querySelector('.album-set')?.getAttribute('data-set')).toBe('food');
  });
});
