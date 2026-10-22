import { describe, it, expect, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';

const FACES = ['😢', '😠', '😮', '🥱'];

let clock = 0;
function press(stage: HTMLElement, comfort: string): void {
  // A finger: the stage cancels touches, so a phone never sends a click here.
  const btn = stage.querySelector<HTMLElement>(`[data-comfort="${comfort}"]`)!;
  clock += 1000; // past the double-press guard, which reads performance.now
  vi.spyOn(performance, 'now').mockReturnValue(clock);
  btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
}
const face = (stage: HTMLElement) => stage.querySelector('.feel-face')!.textContent!;

describe('feelings game', () => {
  it('mounts a friend with an upset face and 4 comfort buttons, says the feeling, cleans up', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    expect(FACES).toContain(face(ctx.stage));
    expect(ctx.stage.querySelectorAll('.feel-btn').length).toBe(4);
    expect(ctx.spoken[0]).toMatch(/^Bé .* quá$/);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    vi.useRealTimers();
  });

  it('any comfort cheers the friend up and names the feeling, in any order', () => {
    vi.useFakeTimers();
    for (const c of ['hug', 'candy', 'lullaby', 'tickle']) {
      const ctx = fakeContext();
      game.start(ctx);
      press(ctx.stage, c);
      expect(FACES).not.toContain(face(ctx.stage));
      expect(ctx.spoken.at(-1)).toMatch(/^Bé .* quá… .*, bé vui!$/);
      ctx.cleanup();
    }
    vi.useRealTimers();
  });

  it('an extra press while happy is only a giggle and does not count', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    press(ctx.stage, 'hug');
    press(ctx.stage, 'tickle');
    expect(ctx.spoken.at(-1)).toMatch(/^Hihi/);
    vi.advanceTimersByTime(3000);
    expect(FACES).toContain(face(ctx.stage));
    expect(ctx.celebrations).toBe(0);
    ctx.cleanup();
    vi.useRealTimers();
  });

  it('celebrates and awards a star after 5 soothed moods', async () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    for (const c of ['tickle', 'candy', 'hug', 'lullaby', 'hug']) {
      press(ctx.stage, c);
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    }
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(FACES).toContain(face(ctx.stage));
    ctx.cleanup();
    vi.useRealTimers();
  });

  it('clears timers on cleanup so nothing fires afterwards', () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    game.start(ctx);
    press(ctx.stage, 'hug');
    ctx.cleanup();
    const spoken = ctx.spoken.length;
    vi.advanceTimersByTime(10000);
    expect(ctx.spoken.length).toBe(spoken);
    vi.useRealTimers();
  });
});
