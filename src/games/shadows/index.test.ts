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

describe('shadows game', () => {
  it('mounts shadows and pieces, cleans up', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.shadows-shadow').length).toBe(3);
    expect(ctx.stage.querySelectorAll('.shadows-glyph').length).toBe(3);
    expect(ctx.stage.querySelectorAll('.shadows-piece').length).toBe(3);
    const shadowIds = [...ctx.stage.querySelectorAll<HTMLElement>('.shadows-shadow')].map((s) => s.dataset.emoji).sort();
    const pieceIds = [...ctx.stage.querySelectorAll<HTMLElement>('.shadows-piece')].map((p) => p.dataset.emoji).sort();
    expect(pieceIds).toEqual(shadowIds);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('springs back a wrong drop, accepts correct drops, then starts a new round', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const boing = vi.spyOn(ctx.audio, 'boing');
    game.start(ctx);
    const pieces = [...ctx.stage.querySelectorAll<HTMLElement>('.shadows-piece')];
    for (const piece of pieces) {
      piece.setPointerCapture = vi.fn();
      piece.releasePointerCapture = vi.fn();
    }
    // jsdom rects are all zeros, so at (0,0) hitTest reports the FIRST still-open
    // shadow in board order. Dropping any other piece is therefore a wrong drop,
    // and dropping the piece that matches that shadow is a correct one.
    const openShadow = () => ctx.stage.querySelector<HTMLElement>('.shadows-shadow:not(.revealed)');
    const pieceFor = (emoji: string | undefined) => pieces.find((p) => p.dataset.emoji === emoji)!;
    const drop = (piece: HTMLElement) => {
      piece.dispatchEvent(ptr('pointerdown', 0, 0));
      piece.dispatchEvent(ptr('pointermove', 0, 0));
      piece.dispatchEvent(ptr('pointerup', 0, 0));
    };

    const wrong = pieces.find((p) => p.dataset.emoji !== openShadow()!.dataset.emoji)!;
    drop(wrong);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(wrong.classList.contains('placed')).toBe(false);
    expect(wrong.classList.contains('spring-back')).toBe(true);
    expect(ctx.spoken.length).toBe(0);

    const target = openShadow()!;
    const right = pieceFor(target.dataset.emoji);
    drop(right);
    expect(right.classList.contains('placed')).toBe(true);
    expect(target.classList.contains('revealed')).toBe(true);
    expect(target.contains(right)).toBe(true);
    expect(right.style.transform).toBe('');
    expect(ctx.spoken.length).toBe(1);
    expect(ctx.spoken[0]?.length).toBeGreaterThan(0);

    while (openShadow()) drop(pieceFor(openShadow()!.dataset.emoji));
    expect(ctx.stage.querySelectorAll('.shadows-shadow.revealed').length).toBe(3);
    expect(boing).toHaveBeenCalledTimes(1);
    // fakeContext.celebrate resolves as a microtask; the idle hint re-arms itself
    // forever, so flush microtasks only rather than "all timers".
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    // A new round was mounted with fresh shadows and pieces.
    expect(ctx.stage.querySelectorAll('.shadows-shadow.revealed').length).toBe(0);
    expect(ctx.stage.querySelectorAll('.shadows-shadow').length).toBe(3);
    expect(ctx.stage.querySelectorAll('.shadows-piece:not(.placed)').length).toBe(3);
    ctx.cleanup();
    vi.useRealTimers();
  });
});
