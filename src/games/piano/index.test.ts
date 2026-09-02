import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { KEYS } from './logic';
import game from './index';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
      this.isPrimary = i.isPrimary ?? true;
    }
  };
}

function ptr(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId, button: 0, isPrimary: true, bubbles: true });
}

const hadElementFromPoint = typeof document.elementFromPoint === 'function';

describe('piano game', () => {
  afterEach(() => {
    vi.useRealTimers();
    if (!hadElementFromPoint) delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it('mounts 8 keys, presses on tap, floats a note, cleans up', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    const keys = ctx.stage.querySelectorAll<HTMLElement>('.piano-key');
    expect(keys.length).toBe(8);
    expect(ctx.stage.querySelectorAll('.piano-animal').length).toBe(8);

    const first = keys[0]!;
    first.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(first.classList.contains('pressed')).toBe(true);
    expect(note).toHaveBeenCalledWith(KEYS[0]!.freq, 0.6);
    expect(first.querySelector('.piano-animal')!.classList.contains('anim-bounce')).toBe(true);

    // A real pointer event carries coordinates, so a floating note spawns and is removed later.
    const third = keys[2]!;
    third.dispatchEvent(ptr('pointerdown', 40, 50, 2));
    expect(third.classList.contains('pressed')).toBe(true);
    expect(ctx.stage.querySelectorAll('.piano-note').length).toBe(1);
    vi.advanceTimersByTime(800);
    expect(ctx.stage.querySelectorAll('.piano-note').length).toBe(0);

    window.dispatchEvent(ptr('pointerup', 40, 50, 2));
    expect(third.classList.contains('pressed')).toBe(false);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('plays the new key when a finger slides across keys', () => {
    const ctx = fakeContext();
    const note = vi.spyOn(ctx.audio, 'note');
    game.start(ctx);
    const keys = ctx.stage.querySelectorAll<HTMLElement>('.piano-key');
    let under: Element | null = keys[0]!;
    (document as { elementFromPoint?: unknown }).elementFromPoint = () => under;

    keys[0]!.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(keys[0]!.classList.contains('pressed')).toBe(true);
    expect(note).toHaveBeenCalledTimes(1);

    // Moving within the same key does not re-trigger.
    window.dispatchEvent(ptr('pointermove', 12, 12));
    expect(note).toHaveBeenCalledTimes(1);

    // Crossing into key 3 plays it and releases key 0.
    under = keys[3]!.querySelector('.piano-animal');
    window.dispatchEvent(ptr('pointermove', 300, 10));
    expect(keys[0]!.classList.contains('pressed')).toBe(false);
    expect(keys[3]!.classList.contains('pressed')).toBe(true);
    expect(note).toHaveBeenLastCalledWith(KEYS[3]!.freq, 0.6);

    // Sliding off the keys releases without playing.
    under = document.body;
    window.dispatchEvent(ptr('pointermove', 300, 900));
    expect(keys[3]!.classList.contains('pressed')).toBe(false);
    expect(note).toHaveBeenCalledTimes(2);

    // Coming back onto a key plays again; lifting releases it.
    under = keys[5]!;
    window.dispatchEvent(ptr('pointermove', 500, 10));
    expect(keys[5]!.classList.contains('pressed')).toBe(true);
    expect(note).toHaveBeenCalledTimes(3);
    window.dispatchEvent(ptr('pointercancel', 500, 10));
    expect(keys[5]!.classList.contains('pressed')).toBe(false);

    ctx.cleanup();
    // Listeners are gone: a stray move after cleanup changes nothing.
    window.dispatchEvent(ptr('pointermove', 500, 10));
    expect(note).toHaveBeenCalledTimes(3);
  });

  it('keeps a key pressed while another finger is still on it', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const key = ctx.stage.querySelector<HTMLElement>('.piano-key')!;
    key.dispatchEvent(ptr('pointerdown', 10, 10, 1));
    key.dispatchEvent(ptr('pointerdown', 12, 12, 2));
    window.dispatchEvent(ptr('pointerup', 10, 10, 1));
    expect(key.classList.contains('pressed')).toBe(true);
    window.dispatchEvent(ptr('pointerup', 12, 12, 2));
    expect(key.classList.contains('pressed')).toBe(false);
    ctx.cleanup();
  });
});
