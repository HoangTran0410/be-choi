import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPhotoStore } from '../core/photos';
import type { Speech } from '../core/speech';
import { fakeAudio } from '../core/testing';
import type { AppDeps } from './deps';
import { openParentPanel, STARS_CHANGED } from './parentPanel';
import { createStore } from './storage';

// The panel prints the app version, which vite normally replaces at build time.
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = '0.0.0-test';

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
    photos: createPhotoStore(async () => 'data:image/jpeg;base64,'),
  };
}

function btn(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('.panel button')].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`no button ${label}`);
  return found as HTMLButtonElement;
}

function has(label: string): boolean {
  return [...document.querySelectorAll('.panel button')].some((b) => b.textContent?.includes(label));
}

describe('parent panel: the sticker announcement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('can be turned off without turning the stickers themselves off', () => {
    const d = deps();
    openParentPanel(d);
    expect(d.store.settings().stickerPopup).toBe(true);

    btn('Báo sticker mới').dispatchEvent(new Event('pointerup'));

    expect(d.store.settings().stickerPopup).toBe(false);
    // The album is still what it was for: only the interruption is gone.
    d.store.addSticker('🐣');
    expect(d.store.stickers()).toEqual(['🐣']);
  });
});

describe('parent panel: wiping stars', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('asks before it wipes, instead of wiping on the first tap', () => {
    const d = deps();
    d.store.addStar('bubbles');
    d.store.addSticker('🐣');
    openParentPanel(d);

    btn('Xoá hết sao và sticker').click();

    expect(d.store.totalStars()).toBe(1);
    expect(d.store.stickers()).toEqual(['🐣']);
    expect(has('Huỷ')).toBe(true);
    expect(has('🗑️ Xoá hết')).toBe(true);
    expect(has('Xoá hết sao và sticker')).toBe(false);
    expect(document.querySelector('.panel-reset .panel-note')?.textContent).toContain('Không lấy lại được');
  });

  it('puts Huỷ where the tapped button was, and Xoá hết a row lower', () => {
    const d = deps();
    d.store.addStar('bubbles');
    openParentPanel(d);
    btn('Xoá hết sao và sticker').click();

    // Both are full-width .panel-btn, stacked, so a repeat tap mostly lands on Huỷ. The
    // bottom edge still reaches Xoá hết, which is what the arming delay covers.
    const row = [...document.querySelectorAll('.panel-reset .panel-btn')];
    expect(row.map((b) => b.textContent)).toEqual(['Huỷ', '🗑️ Xoá hết']);
    expect(row[0]?.className).not.toContain('danger');
    expect(row[1]?.className).toContain('danger');
  });

  it('goes back to one button on Huỷ, keeping the stars', () => {
    const d = deps();
    d.store.addStar('bubbles');
    openParentPanel(d);

    btn('Xoá hết sao và sticker').click();
    btn('Huỷ').click();

    expect(d.store.totalStars()).toBe(1);
    expect(has('Huỷ')).toBe(false);
    expect(has('Xoá hết sao và sticker')).toBe(true);
  });

  it('wipes on the second tap, tells the home screen, and says so', () => {
    const d = deps();
    d.store.addStar('bubbles');
    d.store.addStar('farm');
    d.store.addSticker('🐣');
    let told = 0;
    const listen = () => told++;
    window.addEventListener(STARS_CHANGED, listen);
    openParentPanel(d);

    btn('Xoá hết sao và sticker').click();
    vi.advanceTimersByTime(600);
    btn('🗑️ Xoá hết').click();
    window.removeEventListener(STARS_CHANGED, listen);

    expect(d.store.totalStars()).toBe(0);
    expect(d.store.stickers()).toEqual([]);
    expect(told).toBe(1);
    // `.panel-status` is also the photo section's line, so take the panel's own one.
    expect(document.querySelector('.panel > .panel-status')?.textContent).toBe('Đã xoá hết sao và sticker.');
    // …and the confirmation is gone, so a stray tap cannot wipe again.
    expect(has('Huỷ')).toBe(false);
    expect(has('Xoá hết sao và sticker')).toBe(true);
  });

  it('ignores a tap on Xoá hết that comes too fast to be a decision', () => {
    const d = deps();
    d.store.addStar('bubbles');
    openParentPanel(d);

    btn('Xoá hết sao và sticker').click();
    btn('🗑️ Xoá hết').click();

    // Nobody reads the question and answers it inside half a second; a child hammering does.
    expect(d.store.totalStars()).toBe(1);
    expect(has('Huỷ')).toBe(true);

    vi.advanceTimersByTime(600);
    btn('🗑️ Xoá hết').click();
    expect(d.store.totalStars()).toBe(0);
  });

  it('forgets an unanswered question when the panel is closed and reopened', () => {
    const d = deps();
    openParentPanel(d);
    btn('Xoá hết sao và sticker').click();
    btn('Đóng').click();

    openParentPanel(d);
    expect(has('Huỷ')).toBe(false);
    expect(has('Xoá hết sao và sticker')).toBe(true);
  });
});
