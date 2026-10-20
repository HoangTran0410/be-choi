import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import game from './index';
import { SAVE_KEY } from './store';

function press(el: Element): void {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
}

describe('Ngày của bạn nhỏ', () => {
  let ctx: FakeContext;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    localStorage.clear();
    ctx = fakeContext();
  });
  afterEach(() => {
    ctx.cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is the new all-in-one game for the care skill', () => {
    expect(game.id).toBe('day');
    expect(game.icon).toBe('🧸');
    expect(game.skill).toBe('care');
  });

  it('opens on the morning with its three jobs, the sun road and the friend', async () => {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(50);
    expect(ctx.stage.querySelector('.day-hud')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.sky-stop').length).toBe(4);
    const tasks = [...ctx.stage.querySelectorAll<HTMLElement>('.task')].map((t) => t.dataset.task);
    expect(tasks).toEqual(['dress', 'breakfast', 'teeth']);
    expect(ctx.stage.querySelector('.home-kid .kid-head')).not.toBeNull();
    expect(ctx.spoken.length).toBeGreaterThan(0);
  });

  it('opens every morning job as a scene in the same frame, and the back button returns', async () => {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(3000); // the day banner goes by itself
    for (const id of ['dress', 'breakfast', 'teeth']) {
      press(ctx.stage.querySelector(`[data-task="${id}"]`)!);
      const host = ctx.stage.querySelector<HTMLElement>('.day-act')!;
      expect(host.hidden, id).toBe(false);
      expect(host.children.length, id).toBeGreaterThan(0);
      expect(ctx.stage.querySelector('.day-hud')).not.toBeNull();
      const back = ctx.stage.querySelector<HTMLElement>('.hud-home')!;
      expect(back.hidden).toBe(false);
      press(back);
      await vi.advanceTimersByTimeAsync(300);
      expect(host.hidden, `${id} closed`).toBe(true);
      expect(host.children.length).toBe(0);
    }
  });

  it('dressing the friend finishes the job and ticks it off, in any order', async () => {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(3000);
    press(ctx.stage.querySelector('[data-task="dress"]')!);
    const rows = [...ctx.stage.querySelectorAll('.dress-row')];
    expect(rows.length).toBe(3);
    // shoes first, then hat, then top: any piece is allowed, even an odd one
    for (const i of [2, 0, 1]) {
      rows[i]!.querySelector<HTMLElement>('.dress-piece')!.click();
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(4500);
    expect(ctx.stage.querySelector<HTMLElement>('.day-act')!.hidden).toBe(true);
    expect(ctx.stage.querySelector('[data-task="dress"]')!.classList.contains('done')).toBe(true);
  });

  it('shows the family photo as the friend’s face when one is chosen', async () => {
    const added = await ctx.photos.add([new Blob(['x'], { type: 'image/jpeg' })]);
    const id = added[0]!.id;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, days: 2, face: id, lastEvent: 'none', seed: 5 }));
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(100);
    expect(ctx.stage.querySelector('.hud-day')!.textContent).toBe('Ngày 3');
    expect(ctx.stage.querySelector('.home-kid .kid-head.kid-photo')).not.toBeNull();
    expect(ctx.stage.querySelector<HTMLElement>('.home-face')!.hidden).toBe(false);
  });

  it('never leaves a face button when there are no photos', async () => {
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(100);
    expect(ctx.stage.querySelector<HTMLElement>('.home-face')!.hidden).toBe(true);
  });
});
