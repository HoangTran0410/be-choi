import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';

function mouse(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: 1 });
}

describe('trace game', () => {
  it('moves the bee along the path, ignores stray touches, celebrates at the hive', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const field = ctx.stage.querySelector('.trace')!;
    const bee = ctx.stage.querySelector('.trace-bee') as HTMLElement;
    expect(ctx.stage.querySelector('.trace-hive')).not.toBeNull();
    const before = bee.style.transform;
    // jsdom has no layout: the field is 400 x 600. A touch far from the path does nothing.
    field.dispatchEvent(mouse('pointerdown', 390, 590));
    expect(ctx.celebrations).toBe(0);
    expect(bee.style.transform).toBe(before);
    // Sweep a grid of touches over the whole field: some will hit the path ahead of the bee.
    for (let pass = 0; pass < 40 && ctx.celebrations === 0; pass++) {
      for (let y = 600; y >= 0; y -= 20) for (let x = 0; x <= 400; x += 20) field.dispatchEvent(mouse('pointermove', x, y));
    }
    expect(ctx.celebrations).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(ctx.stars).toBe(1);
    ctx.cleanup();
    vi.useRealTimers();
  });
});
