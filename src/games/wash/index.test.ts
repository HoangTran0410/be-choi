import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { BLOB_COUNT } from './logic';
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

function ptr(type: string, x: number, y: number, id = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, button: 0, isPrimary: true, bubbles: true });
}

function rect(size: number): DOMRect {
  return { x: 0, y: 0, left: 0, top: 0, width: size, height: size, right: size, bottom: size, toJSON: () => ({}) };
}

/** Enough of a 2d context for the game: every call is a spy, image data is fully clear. */
function fake2d() {
  return {
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    clearRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })),
  };
}

describe('wash game', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts subject, dirt canvas and sponge; rubbing without a 2d context never throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const ctx = fakeContext();
    game.start(ctx);
    const wrap = ctx.stage.querySelector<HTMLElement>('.wash')!;
    const sponge = ctx.stage.querySelector<HTMLElement>('.wash-sponge')!;
    expect(wrap).not.toBeNull();
    expect(ctx.stage.querySelector('.wash-subject .wash-item')?.textContent?.length).toBeGreaterThan(0);
    expect(ctx.stage.querySelector('canvas.wash-dirt')).not.toBeNull();
    expect(sponge.hidden).toBe(true);
    expect(ctx.spoken.some((s) => s.includes('bị bẩn'))).toBe(true);

    wrap.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(sponge.hidden).toBe(false);
    for (let i = 1; i <= 12; i++) wrap.dispatchEvent(ptr('pointermove', 10 + i, 10 + i));
    expect(ctx.stage.querySelectorAll('.wash-suds').length).toBe(2);
    vi.advanceTimersByTime(900);
    expect(ctx.stage.querySelectorAll('.wash-suds').length).toBe(0);
    wrap.dispatchEvent(ptr('pointerup', 22, 22));
    expect(sponge.hidden).toBe(true);
    // A second pointer rubs too and the sponge stays while any finger is down.
    wrap.dispatchEvent(ptr('pointerdown', 30, 30, 2));
    wrap.dispatchEvent(ptr('pointerdown', 40, 40, 3));
    wrap.dispatchEvent(ptr('pointermove', 35, 35, 2));
    window.dispatchEvent(ptr('pointerup', 35, 35, 2));
    expect(sponge.hidden).toBe(false);
    window.dispatchEvent(ptr('pointercancel', 40, 40, 3));
    expect(sponge.hidden).toBe(true);

    // Idle hint: the sponge wiggles on the subject, then hides again.
    vi.advanceTimersByTime(6000);
    expect(sponge.hidden).toBe(false);
    expect(sponge.classList.contains('anim-wiggle')).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(sponge.hidden).toBe(true);

    window.dispatchEvent(new Event('resize'));
    expect(ctx.celebrations).toBe(0);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('draws dirt, erases under the sponge and finishes the round once clean', async () => {
    const c = fake2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(c as unknown as CanvasRenderingContext2D);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(300));
    const ctx = fakeContext();
    game.start(ctx);
    const wrap = ctx.stage.querySelector<HTMLElement>('.wash')!;
    const canvas = ctx.stage.querySelector<HTMLCanvasElement>('canvas.wash-dirt')!;
    const item = ctx.stage.querySelector<HTMLElement>('.wash-item')!;
    const first = item.textContent;
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(300);
    expect(c.arc).toHaveBeenCalledTimes(BLOB_COUNT);

    wrap.dispatchEvent(ptr('pointerdown', 150, 150));
    expect(c.globalCompositeOperation).toBe('destination-out');
    expect(c.arc).toHaveBeenCalledTimes(BLOB_COUNT + 1);
    expect(c.getImageData).not.toHaveBeenCalled();
    wrap.dispatchEvent(ptr('pointermove', 160, 160));
    expect(c.getImageData).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    wrap.dispatchEvent(ptr('pointermove', 170, 170));
    expect(c.getImageData).toHaveBeenCalledTimes(1);

    // Image data is all clear → the round ends.
    expect(ctx.spoken).toContain('Sạch rồi!');
    expect(ctx.stage.querySelectorAll('.wash-sparkle').length).toBeGreaterThan(0);
    expect(c.clearRect).toHaveBeenCalledWith(0, 0, 300, 300);
    await vi.advanceTimersByTimeAsync(10);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(item.textContent).not.toBe(first);
    expect(ctx.spoken.filter((s) => s.includes('bị bẩn')).length).toBe(2);
    // Fresh dirt for the new round.
    expect(c.arc).toHaveBeenCalledTimes(BLOB_COUNT * 2 + 3);
    vi.advanceTimersByTime(2000);
    expect(ctx.stage.querySelectorAll('.wash-sparkle').length).toBe(0);

    // Resize to a new box: bitmap follows and the dirt is redrawn.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(400));
    window.dispatchEvent(new Event('resize'));
    expect(canvas.width).toBe(400);
    expect(c.arc).toHaveBeenCalledTimes(BLOB_COUNT * 3 + 3);

    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});
