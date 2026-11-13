import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import { fitBox, toPixels } from '../trace/modes';
import game from './index';
import { LETTERS, placeStrokes } from './logic';

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('writing game', () => {
  it('tracing every stroke of the first letter finishes it: star, saved, next letter', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    const field = ctx.stage.querySelector('.wr')!;
    const box = fitBox(400, 600);
    const ev = (type: string, u: { x: number; y: number }) => {
      const p = toPixels(box, u);
      return new MouseEvent(type, { bubbles: true, clientX: p.x, clientY: p.y, buttons: 1 });
    };
    expect(ctx.stage.querySelectorAll('.wr-tile').length).toBe(LETTERS.length);
    for (const s of placeStrokes(LETTERS[0]!)) {
      field.dispatchEvent(ev('pointerdown', s.path.pts[0]!));
      for (const pt of s.path.pts) field.dispatchEvent(ev('pointermove', pt));
      field.dispatchEvent(ev('pointerup', s.path.pts.at(-1)!));
    }
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stage.querySelector('.wr-alive')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctx.stars).toBe(1);
    expect(JSON.parse(localStorage.getItem('be-choi:writing')!).done).toEqual(['o']);
    expect(ctx.sequenced.join(' ')).toContain('ong');
    ctx.cleanup();
  });
});
