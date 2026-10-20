import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';
import { loadProgress, saveGallery } from './store';

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

const tap = (el: Element): void => {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
};

beforeEach(() => {
  // `performance` is faked too: the tap cooldown reads it.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function visibleModes(ctx: { stage: HTMLElement }): string[] {
  return [...ctx.stage.querySelectorAll<HTMLElement>('.bw-body > .bw-mode')].filter((m) => !m.hidden).map((m) => m.className);
}

describe('build (Xưởng xếp hình)', () => {
  it('opens on the puzzle with three mode buttons and the cabinet', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(50);
    expect(ctx.stage.querySelectorAll('.bw-tab')).toHaveLength(3);
    expect(ctx.stage.querySelector('.bw-cabinet')).not.toBeNull();
    expect(visibleModes(ctx)).toHaveLength(1);
    expect(ctx.stage.querySelectorAll('.bw-pz-item').length).toBeGreaterThanOrEqual(2);
    ctx.cleanup();
  });

  it('switches mode without leaving, keeps each mode as it was, and remembers the last one', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(50);
    const pieces = ctx.stage.querySelectorAll('.bw-pz-item').length;
    tap(ctx.stage.querySelector('.bw-tab-shadow')!);
    await vi.advanceTimersByTimeAsync(50);
    expect(visibleModes(ctx)[0]).toContain('bw-sh');
    expect(ctx.stage.querySelectorAll('.bw-sh-piece').length).toBeGreaterThanOrEqual(3);
    expect(ctx.sequenced.some((s) => s.startsWith('Xếp theo bóng'))).toBe(true);
    tap(ctx.stage.querySelector('.bw-tab-build')!);
    await vi.advanceTimersByTimeAsync(50);
    expect(visibleModes(ctx)[0]).toContain('bw-bk');
    expect(ctx.stage.querySelectorAll('.bw-bk-piece')).toHaveLength(5);
    expect(ctx.stage.querySelector<HTMLElement>('.bw-bk-next')?.hidden).toBe(false);
    expect(loadProgress().mode).toBe('build');
    tap(ctx.stage.querySelector('.bw-tab-puzzle')!);
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.stage.querySelectorAll('.bw-pz-item').length).toBe(pieces);
    ctx.cleanup();
  });

  it('opens on the mode the child left in', async () => {
    localStorage.setItem('be-choi:build:progress', JSON.stringify({ v: 1, counts: { puzzle: 0, shadow: 0, build: 0 }, mode: 'shadow' }));
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(50);
    expect(visibleModes(ctx)[0]).toContain('bw-sh');
    ctx.cleanup();
  });

  it('names a blueprint step out loud and offers the free build', async () => {
    const ctx = fakeContext();
    localStorage.setItem('be-choi:build:progress', JSON.stringify({ v: 1, counts: { puzzle: 0, shadow: 0, build: 0 }, mode: 'build' }));
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(2500);
    expect(ctx.sequenced.some((s) => s.startsWith('Mình xây'))).toBe(true);
    expect(ctx.sequenced.some((s) => s.startsWith('Gạch màu'))).toBe(true);
    tap(ctx.stage.querySelector('.bw-bk-btn[aria-label="Xây tự do"]')!);
    expect(ctx.stage.querySelector('.bw-bk')?.getAttribute('data-sub')).toBe('free');
    ctx.cleanup();
  });

  it('keeps the brick dock thin: colours fold into a palette, the next brick glows, a tap picks a brick', async () => {
    const ctx = fakeContext();
    localStorage.setItem('be-choi:build:progress', JSON.stringify({ v: 1, counts: { puzzle: 0, shadow: 0, build: 0 }, mode: 'build' }));
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(500);
    const q = <T extends Element>(s: string): T => ctx.stage.querySelector<T>(s)!;
    // The colours live in a palette that is shut until the chip is tapped.
    const palette = q<HTMLElement>('.bw-bk-palette');
    expect(palette.hidden).toBe(true);
    expect(q('.bw-bk-tray').contains(palette)).toBe(false);
    // The blueprint's next brick is lit in the dock.
    expect(ctx.stage.querySelectorAll('.bw-bk-piece.next')).toHaveLength(1);
    // Free build: every colour is on offer; the chip opens and a colour closes the palette.
    tap(q('.bw-bk-btn[aria-label="Xây tự do"]'));
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.stage.querySelectorAll('.bw-bk-color:not([hidden])').length).toBeGreaterThanOrEqual(5);
    tap(q('.bw-bk-chip'));
    expect(palette.hidden).toBe(false);
    tap(q('.bw-bk-color[data-color]:not(.active)'));
    expect(palette.hidden).toBe(true);
    // Tap (no drag) on a brick in the dock picks it; a tap on another one moves the pick.
    const [a, b] = [...ctx.stage.querySelectorAll<HTMLElement>('.bw-bk-piece')];
    for (const piece of [a!, b!]) {
      piece.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: 5, clientY: 5 }),
      );
      piece.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: 5, clientY: 5 }),
      );
    }
    expect(a!.classList.contains('sel')).toBe(false);
    expect(b!.classList.contains('sel')).toBe(true);
    ctx.cleanup();
  });

  it('the cabinet shows saved works, a work large, and closes', async () => {
    saveGallery([{ id: 'a', name: 'tháp cao', at: 1, bricks: [[0, 0, 2, 1, '#ef4444']] }]);
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(50);
    expect(ctx.stage.querySelector('.bw-badge')?.textContent).toBe('1');
    tap(ctx.stage.querySelector('.bw-cabinet')!);
    expect(ctx.stage.querySelectorAll('.bw-cab-tile')).toHaveLength(1);
    tap(ctx.stage.querySelector('.bw-cab-tile')!);
    expect(ctx.stage.querySelector('.bw-cab-big svg')).not.toBeNull();
    tap(ctx.stage.querySelector('.bw-cab-close')!);
    expect(ctx.stage.querySelectorAll('.bw-cab-tile')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(400);
    tap(ctx.stage.querySelector('.bw-cab-close')!);
    expect(ctx.stage.querySelector('.bw-cab')).toBeNull();
    ctx.cleanup();
  });

  it('shows the picture button only when the family has photos', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    await vi.advanceTimersByTimeAsync(50);
    expect(ctx.stage.querySelector<HTMLElement>('.bw-pz .bw-source')?.hidden).toBe(true);
    await ctx.photos.add([new Blob(['x'])]);
    await vi.advanceTimersByTimeAsync(50);
    expect(ctx.stage.querySelector<HTMLElement>('.bw-pz .bw-source')?.hidden).toBe(false);
    ctx.cleanup();
  });
});
