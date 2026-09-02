import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';
import { BRUSHES, PALETTE, STAMPS } from './logic';

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

function ptr(type: string, x = 0, y = 0, pointerId = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId, button: 0, isPrimary: true, bubbles: true });
}

describe('paint game', () => {
  it('mounts canvas and tools, moves selection, survives drawing without a 2d context, cleans up', () => {
    vi.useFakeTimers();
    // jsdom has no canvas backend; the game must guard every getContext call.
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const ctx = fakeContext();
    game.start(ctx);

    const canvas = ctx.stage.querySelector<HTMLCanvasElement>('canvas.paint-canvas');
    expect(canvas).not.toBeNull();
    const swatches = [...ctx.stage.querySelectorAll<HTMLElement>('.paint-swatch')];
    const sizes = [...ctx.stage.querySelectorAll<HTMLElement>('.paint-size')];
    const stamps = [...ctx.stage.querySelectorAll<HTMLElement>('.paint-stamp')];
    const eraser = ctx.stage.querySelector<HTMLElement>('.paint-eraser');
    const trash = ctx.stage.querySelector<HTMLElement>('.paint-trash');
    expect(swatches.length).toBe(PALETTE.length);
    expect(swatches.length).toBe(8);
    expect(sizes.length).toBe(BRUSHES.length);
    expect(sizes.length).toBe(3);
    expect(stamps.length).toBe(STAMPS.length);
    expect(stamps.length).toBe(4);
    expect(eraser).not.toBeNull();
    expect(trash).not.toBeNull();

    // Default: first colour, middle size.
    expect(swatches[0]?.classList.contains('selected')).toBe(true);
    expect(sizes[1]?.classList.contains('selected')).toBe(true);
    expect(ctx.spoken).toEqual([]);

    // Picking a colour moves the ring and names the colour.
    swatches[3]?.dispatchEvent(ptr('pointerdown'));
    expect(swatches[0]?.classList.contains('selected')).toBe(false);
    expect(swatches[3]?.classList.contains('selected')).toBe(true);
    expect(sizes[1]?.classList.contains('selected')).toBe(true);
    expect(ctx.spoken).toEqual(['màu xanh lá']);

    // A stamp drops the colour ring; a size keeps the stamp; the eraser drops the stamp.
    stamps[1]?.dispatchEvent(ptr('pointerdown'));
    expect(stamps[1]?.classList.contains('selected')).toBe(true);
    expect(swatches.some((s) => s.classList.contains('selected'))).toBe(false);
    sizes[2]?.dispatchEvent(ptr('pointerdown'));
    expect(sizes[2]?.classList.contains('selected')).toBe(true);
    expect(sizes[1]?.classList.contains('selected')).toBe(false);
    expect(stamps[1]?.classList.contains('selected')).toBe(true);
    eraser?.dispatchEvent(ptr('pointerdown'));
    expect(eraser?.classList.contains('selected')).toBe(true);
    expect(stamps[1]?.classList.contains('selected')).toBe(false);
    swatches[0]?.dispatchEvent(ptr('pointerdown'));
    expect(eraser?.classList.contains('selected')).toBe(false);
    expect(swatches[0]?.classList.contains('selected')).toBe(true);
    expect(ctx.spoken).toEqual(['màu xanh lá', 'màu đỏ']);

    // Drawing and stamping never throw even though there is no 2d context.
    canvas?.dispatchEvent(ptr('pointerdown', 10, 10, 1));
    canvas?.dispatchEvent(ptr('pointerdown', 50, 50, 2));
    canvas?.dispatchEvent(ptr('pointermove', 20, 20, 1));
    canvas?.dispatchEvent(ptr('pointerup', 20, 20, 1));
    canvas?.dispatchEvent(ptr('pointercancel', 50, 50, 2));
    stamps[0]?.dispatchEvent(ptr('pointerdown'));
    canvas?.dispatchEvent(ptr('pointerdown', 30, 30, 1));
    expect(ctx.stars).toBe(0);

    // Trash needs a 700 ms hold and must not throw without a context.
    trash?.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(300);
    trash?.dispatchEvent(ptr('pointerup'));
    trash?.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(700);
    expect(trash?.querySelector('.hold-ring')).toBeNull();

    window.dispatchEvent(new Event('resize'));
    expect(getContext).toHaveBeenCalled();

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    getContext.mockRestore();
    vi.useRealTimers();
  });
});
