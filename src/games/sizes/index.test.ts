import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
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

function ptr(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, bubbles: true });
}

/** Press at (0,0), drag to (x,y), release. */
function drop(el: Element, x: number, y: number): void {
  el.dispatchEvent(ptr('pointerdown', 0, 0));
  el.dispatchEvent(ptr('pointermove', x, y));
  el.dispatchEvent(ptr('pointerup', x, y));
}

function rect(left: number, top: number, w = 100, h = 100): DOMRect {
  return { left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON: () => ({}) };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('sizes game', () => {
  it('mounts two boxes and four pieces, speaks the round intro, cleans up', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.sizes-box').length).toBe(2);
    expect(ctx.stage.querySelector('.sizes-box-big')).not.toBeNull();
    expect(ctx.stage.querySelector('.sizes-box-small')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.sizes-piece').length).toBe(4);
    expect(ctx.stage.querySelectorAll('.sizes-piece-big').length).toBe(2);
    expect(ctx.stage.querySelectorAll('.sizes-piece-small').length).toBe(2);
    const glyphs = new Set(
      [...ctx.stage.querySelectorAll('.sizes-piece-emoji, .sizes-box-label')].map((el) => el.textContent),
    );
    expect(glyphs.size).toBe(1);
    expect(ctx.spoken[0]).toMatch(/ to và nhỏ$/);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('accepts pieces in the matching box, springs back otherwise, then starts a new round', async () => {
    const ctx = fakeContext();
    const boing = vi.spyOn(ctx.audio, 'boing');
    const ding = vi.spyOn(ctx.audio, 'ding');
    game.start(ctx);
    const big = ctx.stage.querySelector<HTMLElement>('.sizes-box-big')!;
    const small = ctx.stage.querySelector<HTMLElement>('.sizes-box-small')!;
    big.getBoundingClientRect = () => rect(0, 0);
    small.getBoundingClientRect = () => rect(300, 0);
    const firstEmoji = ctx.stage.querySelector('.sizes-piece-emoji')!.textContent;

    const smallPiece = ctx.stage.querySelector<HTMLElement>('.sizes-piece-small')!;
    drop(smallPiece, 50, 50); // into the big box: wrong
    expect(boing).toHaveBeenCalledTimes(1);
    expect(smallPiece.classList.contains('placed')).toBe(false);
    expect(smallPiece.classList.contains('spring-back')).toBe(true);
    expect(ding).not.toHaveBeenCalled();

    for (const el of ctx.stage.querySelectorAll<HTMLElement>('.sizes-piece-big')) drop(el, 50, 50);
    for (const el of ctx.stage.querySelectorAll<HTMLElement>('.sizes-piece-small')) drop(el, 350, 50);
    expect(ding).toHaveBeenCalledTimes(4);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(big.querySelectorAll('.sizes-box-items .sizes-piece.placed').length).toBe(2);
    expect(small.querySelectorAll('.sizes-box-items .sizes-piece.placed').length).toBe(2);
    expect(big.classList.contains('sizes-full')).toBe(true);
    expect(small.classList.contains('sizes-full')).toBe(true);
    expect(ctx.spoken).toContain('to');
    expect(ctx.spoken).toContain('nhỏ');
    expect(ctx.celebrations).toBe(1);

    await flush();
    expect(ctx.stars).toBe(1);
    const tray = ctx.stage.querySelector('.g-tray')!;
    expect(tray.querySelectorAll('.sizes-piece:not(.placed)').length).toBe(4);
    expect(ctx.stage.querySelectorAll('.sizes-box').length).toBe(2);
    expect(ctx.stage.querySelector('.sizes-piece-emoji')!.textContent).not.toBe(firstEmoji);
    ctx.cleanup();
  });

  it('wiggles the first unplaced piece and its box when idle', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(6000);
    const piece = ctx.stage.querySelector('.sizes-piece')!;
    expect(piece.classList.contains('anim-wiggle')).toBe(true);
    const key = piece.classList.contains('sizes-piece-big') ? 'big' : 'small';
    expect(ctx.stage.querySelector(`.sizes-box-${key}`)!.classList.contains('anim-wiggle')).toBe(true);
    ctx.cleanup();
    vi.useRealTimers();
  });
});
