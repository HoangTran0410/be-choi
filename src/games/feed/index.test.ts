import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import { FEED_PAIRS } from '../../core/content';
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

function ptr(type: string, x = 0, y = 0): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, bubbles: true });
}

/** jsdom rects are all zeros, so a drop at (0,0) lands on the mouth. */
function drop(el: Element): void {
  el.dispatchEvent(ptr('pointerdown'));
  el.dispatchEvent(ptr('pointermove'));
  el.dispatchEvent(ptr('pointerup'));
}

function foodsOf(stage: HTMLElement): { correct: HTMLElement; wrong: HTMLElement } {
  const animal = stage.querySelector('.feed-animal')!.textContent;
  const pair = FEED_PAIRS.find((p) => p.animal.emoji === animal)!;
  const foods = [...stage.querySelectorAll<HTMLElement>('.feed-food')];
  const correct = foods.find((f) => f.dataset.emoji === pair.food.emoji)!;
  const wrong = foods.find((f) => f.dataset.emoji !== pair.food.emoji)!;
  return { correct, wrong };
}

describe('feed game', () => {
  it('mounts one animal, one mouth and 3 foods, names the hungry animal, cleans up', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.feed-animal').length).toBe(1);
    expect(ctx.stage.querySelectorAll('.feed-mouth').length).toBe(1);
    expect(ctx.stage.querySelectorAll('.feed-food').length).toBe(3);
    expect(ctx.spoken.some((s) => s.endsWith('đói rồi'))).toBe(true);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    vi.useRealTimers();
  });

  it('wrong food shakes the animal and springs back; right food is eaten and the next animal comes', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const first = ctx.stage.querySelector('.feed-animal')!.textContent;
    const { correct, wrong } = foodsOf(ctx.stage);

    drop(wrong);
    expect(ctx.spoken).toContain('Không phải món này');
    expect(ctx.stage.querySelector('.feed-animal')!.classList.contains('anim-shake')).toBe(true);
    expect(wrong.classList.contains('spring-back')).toBe(true);
    expect(ctx.stage.querySelectorAll('.feed-food').length).toBe(3);

    drop(correct);
    expect(ctx.spoken).toContain('Ngon quá!');
    expect(correct.classList.contains('eaten')).toBe(true);
    expect(correct.parentElement).toBe(ctx.stage.querySelector('.feed-mouth'));

    vi.advanceTimersByTime(1000);
    expect(ctx.stage.querySelector('.feed-animal')!.textContent).not.toBe(first);
    expect(ctx.stage.querySelectorAll('.feed-food').length).toBe(3);
    expect(ctx.spoken.filter((s) => s.endsWith('đói rồi')).length).toBe(2);
    ctx.cleanup();
    vi.useRealTimers();
  });

  it('celebrates and awards a star after 5 animals', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    for (let i = 0; i < 5; i++) {
      drop(foodsOf(ctx.stage).correct);
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    }
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(ctx.stage.querySelectorAll('.feed-food').length).toBe(3);
    ctx.cleanup();
    vi.useRealTimers();
  });
});
