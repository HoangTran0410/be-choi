import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const ptr = (type: string, x = 0, y = 0) =>
  new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, bubbles: true });

const tubes = (stage: HTMLElement) => [...stage.querySelectorAll<HTMLElement>('.tubes-tube')];
const ballsIn = (tube: HTMLElement) => [...tube.querySelectorAll<HTMLElement>('.tubes-ball')];
const colorOf = (ball: HTMLElement) => ball.dataset.color ?? '';
const upBalls = (stage: HTMLElement) => [...stage.querySelectorAll<HTMLElement>('.tubes-ball.up')];
/** A tap: down and up in the same spot, anywhere on the tube. */
const tap = (el: HTMLElement) => {
  el.dispatchEvent(ptr('pointerdown'));
  el.dispatchEvent(ptr('pointerup'));
};
/** A drag from `el` to a point, in the pointer events the tube listens for. */
const dragTo = (el: HTMLElement, from: [number, number], to: [number, number]) => {
  el.dispatchEvent(ptr('pointerdown', from[0], from[1]));
  el.dispatchEvent(ptr('pointermove', to[0], to[1]));
  el.dispatchEvent(ptr('pointerup', to[0], to[1]));
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

/** jsdom has no layout: hand the tubes a row of rects so a drag can be aimed. */
function stubRects(stage: HTMLElement): void {
  tubes(stage).forEach((t, i) => {
    const box = { left: i * 100, top: 0, width: 60, height: 300, right: i * 100 + 60, bottom: 300, x: i * 100, y: 0 };
    t.getBoundingClientRect = () => ({ ...box, toJSON: () => box }) as DOMRect;
  });
}

describe('tubes game', () => {
  it('deals the first level: two full tubes and two empty ones', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const all = tubes(ctx.stage);
    expect(all.length).toBe(4);
    expect(all.map((t) => ballsIn(t).length)).toEqual([3, 3, 0, 0]);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('a press anywhere on the tube — even on a buried ball — takes the top ball out', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const tube = tubes(ctx.stage)[0]!;
    const balls = ballsIn(tube);
    // The finger lands on the ball at the bottom of the pile.
    balls[0]!.dispatchEvent(ptr('pointerdown'));
    balls[0]!.dispatchEvent(ptr('pointerup'));
    expect(upBalls(ctx.stage)).toEqual([balls.at(-1)]);
    tap(tube);
    expect(upBalls(ctx.stage)).toEqual([]);
    ctx.cleanup();
  });

  it('lifts the ball clear of the rim however deep in the tube it sat', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const [a, , spare] = tubes(ctx.stage);
    tap(a!);
    // A full tube of three: the top ball is at the rim already.
    expect(upBalls(ctx.stage)[0]!.style.getPropertyValue('--tubes-lift')).toBe('0.98');
    tap(spare!);
    tap(a!);
    // Two balls left, so the next one has an empty slot to climb past as well.
    expect(upBalls(ctx.stage)[0]!.style.getPropertyValue('--tubes-lift')).toBe('1.98');
    ctx.cleanup();
  });

  it('tapping another tube sends the waiting ball over', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const [from, , spare] = tubes(ctx.stage);
    const top = ballsIn(from!).at(-1)!;
    tap(from!);
    tap(spare!);
    expect(ballsIn(spare!)).toEqual([top]);
    expect(ballsIn(from!).length).toBe(2);
    expect(top.classList.contains('up')).toBe(false);
    ctx.cleanup();
  });

  it('a full tube says no and keeps the ball in hand', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const boing = vi.fn();
    ctx.audio.boing = boing;
    const [a, b] = tubes(ctx.stage);
    const top = ballsIn(a!).at(-1)!;
    tap(a!);
    tap(b!);
    expect(boing).toHaveBeenCalled();
    expect(ballsIn(b!).length).toBe(3);
    expect(ballsIn(a!).length).toBe(3);
    expect(top.classList.contains('up')).toBe(true);
    ctx.cleanup();
  });

  it('dragging a ball across drops it into the tube it was let go over', () => {
    const ctx = fakeContext();
    game.start(ctx);
    stubRects(ctx.stage);
    const [from, , spare] = tubes(ctx.stage);
    const top = ballsIn(from!).at(-1)!;
    dragTo(from!, [30, 150], [230, 150]);
    expect(ballsIn(spare!)).toEqual([top]);
    expect(top.style.transform).toBe('');
    ctx.cleanup();
  });

  it('dragging from another tube drops the waiting ball and picks that one up instead', () => {
    const ctx = fakeContext();
    game.start(ctx);
    stubRects(ctx.stage);
    const all = tubes(ctx.stage);
    const waiting = ballsIn(all[0]!).at(-1)!;
    tap(all[0]!);
    expect(waiting.classList.contains('up')).toBe(true);
    // The child ignores the ball in hand and drags tube 1 over to the empty tube 3.
    const other = ballsIn(all[1]!).at(-1)!;
    dragTo(all[1]!, [130, 150], [330, 150]);
    expect(waiting.classList.contains('up')).toBe(false);
    expect(ballsIn(all[0]!).length).toBe(3);
    expect(ballsIn(all[3]!)).toEqual([other]);
    ctx.cleanup();
  });

  it('sorting every colour celebrates, awards a star and deals a bigger level', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    // Level 1 is two colours of three balls with two empty tubes: one tube each.
    const home = new Map<string, number>();
    for (let src = 0; src < 2; src++) {
      for (let i = 0; i < 3; i++) {
        const tube = tubes(ctx.stage)[src]!;
        const color = colorOf(ballsIn(tube).at(-1)!);
        if (!home.has(color)) home.set(color, home.size + 2);
        tap(tube);
        tap(tubes(ctx.stage)[home.get(color)!]!);
      }
    }
    const sorted = tubes(ctx.stage).slice(2);
    expect(sorted.every((t) => t.classList.contains('done'))).toBe(true);
    expect(ctx.celebrations).toBe(1);
    await flush();
    expect(ctx.stars).toBe(1);
    expect(tubes(ctx.stage).length).toBe(5);
    expect(tubes(ctx.stage).some((t) => t.classList.contains('done'))).toBe(false);
    ctx.cleanup();
  });

  describe('idle', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    it('wiggles a ball worth moving and bounces where it should go', () => {
      const ctx = fakeContext();
      game.start(ctx);
      vi.advanceTimersByTime(6000);
      const wiggled = [...ctx.stage.querySelectorAll('.tubes-ball.anim-wiggle')];
      expect(wiggled.length).toBe(1);
      expect(ctx.stage.querySelectorAll('.tubes-tube.anim-bounce').length).toBe(1);
      ctx.cleanup();
    });
  });
});
