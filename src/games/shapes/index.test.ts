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
  return new PointerEvent(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    isPrimary: true,
    bubbles: true,
  });
}

/** Press at (0,0), drag to (x,y), release. */
function drop(el: Element, x: number, y: number): void {
  el.dispatchEvent(ptr('pointerdown', 0, 0));
  el.dispatchEvent(ptr('pointermove', x, y));
  el.dispatchEvent(ptr('pointerup', x, y));
}

/** jsdom has no layout: hole `i` sits at x ∈ [i·200, i·200+100], y ∈ [0, 100]. */
function layout(holes: HTMLElement[]): void {
  holes.forEach((el, i) => {
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

describe('shapes game', () => {
  it('mounts holes and pieces, cleans up', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.hole').length).toBe(3);
    expect(ctx.stage.querySelectorAll('.piece').length).toBe(3);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('greets once, fills the matching hole, refuses a wrong one, then deals the next round', async () => {
    const ctx = fakeContext();
    const boing = vi.spyOn(ctx.audio, 'boing');
    game.start(ctx);
    expect(ctx.spoken.length).toBe(1);
    const holes = [...ctx.stage.querySelectorAll<HTMLElement>('.hole')];
    layout(holes);
    const pieces = [...ctx.stage.querySelectorAll<HTMLElement>('.piece')];
    const wrongHole = holes.findIndex((hole) => hole.dataset.shape !== pieces[0]!.dataset.shape);
    drop(pieces[0]!, wrongHole * 200 + 50, 50);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(pieces[0]!.classList.contains('placed')).toBe(false);
    expect(pieces[0]!.classList.contains('is-carried')).toBe(false);
    expect(ctx.spoken.length).toBe(1);

    for (const piece of pieces) {
      const i = holes.findIndex((hole) => hole.dataset.shape === piece.dataset.shape);
      drop(piece, i * 200 + 50, 50);
    }
    expect(holes.every((hole) => hole.classList.contains('filled'))).toBe(true);
    expect(ctx.spoken.length).toBe(4);
    await vi.waitFor(() => expect(ctx.stars).toBe(1));
    expect(ctx.stage.querySelectorAll('.piece:not(.placed)').length).toBeGreaterThanOrEqual(3);
    ctx.cleanup();
  });

  it('idle hint wiggles a piece and its hole', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    vi.advanceTimersByTime(6000);
    const piece = ctx.stage.querySelector<HTMLElement>('.piece')!;
    expect(piece.classList.contains('anim-wiggle')).toBe(true);
    expect(ctx.stage.querySelector(`.hole[data-shape="${piece.dataset.shape}"]`)!.classList.contains('anim-wiggle')).toBe(true);
    expect(ctx.spoken.length).toBe(2);
    ctx.cleanup();
    vi.useRealTimers();
  });
});
