import { describe, it, expect, vi } from 'vitest';
import { COLORS } from '../../core/content';
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

/** jsdom has no layout: give basket `i` the rect x ∈ [i·200, i·200+100], y ∈ [0, 100]. */
function layout(baskets: HTMLElement[]): void {
  baskets.forEach((el, i) => {
    const left = i * 200;
    el.getBoundingClientRect = () => ({
      x: left,
      y: 0,
      left,
      top: 0,
      width: 100,
      height: 100,
      right: left + 100,
      bottom: 100,
      toJSON: () => ({}),
    });
  });
}

/** Drag `ball` from the origin and release it at (x, y). */
function drop(ball: HTMLElement, x: number, y: number): void {
  ball.dispatchEvent(ptr('pointerdown', 0, 0));
  ball.dispatchEvent(ptr('pointermove', x, y));
  ball.dispatchEvent(ptr('pointerup', x, y));
}

function mount() {
  const ctx = fakeContext();
  game.start(ctx);
  const baskets = [...ctx.stage.querySelectorAll<HTMLElement>('.colors-basket')];
  layout(baskets);
  return { ctx, baskets };
}

describe('colors game', () => {
  it('mounts 2 baskets and 4 balls in round 0, cleans up', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.colors-basket').length).toBe(2);
    expect(ctx.stage.querySelectorAll('.colors-basket .colors-basket-balls').length).toBe(2);
    expect(ctx.stage.querySelectorAll('.g-tray .colors-ball').length).toBe(4);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('accepts a ball on the matching basket, springs back on the wrong one', () => {
    const { ctx, baskets } = mount();
    const first = baskets[0]!;
    const color = first.dataset.color ?? '';
    const right = ctx.stage.querySelector<HTMLElement>(`.colors-ball[data-color="${color}"]`)!;
    const wrong = ctx.stage.querySelector<HTMLElement>(`.colors-ball:not([data-color="${color}"])`)!;

    drop(wrong, 50, 50);
    expect(wrong.classList.contains('placed')).toBe(false);
    expect(wrong.classList.contains('spring-back')).toBe(true);
    expect(wrong.parentElement?.classList.contains('colors-tray')).toBe(true);
    expect(ctx.spoken).toEqual([]);

    drop(right, 50, 50);
    expect(right.classList.contains('placed')).toBe(true);
    expect(right.style.transform).toBe('');
    expect(first.querySelector('.colors-basket-balls')?.contains(right)).toBe(true);
    expect(ctx.spoken).toEqual([COLORS.find((c) => c.id === color)?.name]);
    ctx.cleanup();
  });

  it('celebrates, awards a star and starts the next round once every ball is sorted', async () => {
    const { ctx, baskets } = mount();
    for (const ball of [...ctx.stage.querySelectorAll<HTMLElement>('.colors-ball')]) {
      const i = baskets.findIndex((b) => b.dataset.color === ball.dataset.color);
      expect(i).toBeGreaterThanOrEqual(0);
      drop(ball, i * 200 + 50, 50);
    }
    expect(ctx.stage.querySelectorAll('.colors-ball.placed').length).toBe(4);
    await vi.waitFor(() => expect(ctx.stars).toBe(1));
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stage.querySelectorAll('.colors-basket').length).toBe(2);
    expect(ctx.stage.querySelectorAll('.g-tray .colors-ball:not(.placed)').length).toBe(4);
    ctx.cleanup();
  });

  it('idle hint wiggles the first unplaced ball and its basket', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(6000);
    const ball = ctx.stage.querySelector<HTMLElement>('.colors-ball')!;
    expect(ball.classList.contains('anim-wiggle')).toBe(true);
    const basket = ctx.stage.querySelector(`.colors-basket[data-color="${ball.dataset.color}"]`)!;
    expect(basket.classList.contains('anim-wiggle')).toBe(true);
    ctx.cleanup();
    vi.useRealTimers();
  });
});
