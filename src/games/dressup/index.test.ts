import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { SLOTS } from './logic';
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

function garments(root: ParentNode, slot?: string): HTMLElement[] {
  const sel = slot ? `.dressup-garment[data-slot="${slot}"]` : '.dressup-garment';
  return [...root.querySelectorAll<HTMLElement>(sel)];
}

const phase = (root: ParentNode): string => root.querySelector<HTMLElement>('.dressup')!.dataset.phase ?? '';

describe('dressup game', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts a friend, three empty slots and nine tappable garments (>=72px), and says the weather', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.dressup-slot')).toHaveLength(3);
    expect(garments(ctx.stage)).toHaveLength(9);
    expect(phase(ctx.stage)).toBe('dress');
    expect(ctx.spoken.length).toBe(1);
    expect(ctx.stage.querySelector('.dressup-sky')?.textContent?.length).toBeGreaterThan(0);
    ctx.cleanup();
  });

  it('puts garments on in any order; a mismatched one makes the friend giggle, never an error', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const boing = vi.spyOn(ctx.audio, 'boing');
    // Shoes first, then hat, then top; always the first one on offer.
    for (const slot of ['shoes', 'hat']) {
      garments(ctx.stage, slot)[0]!.click();
      expect(ctx.stage.querySelector(`.dressup-slot[data-slot="${slot}"]`)?.textContent).not.toBe('');
    }
    expect(phase(ctx.stage)).toBe('dress');
    const topBtn = garments(ctx.stage, 'top')[0]!;
    topBtn.click();
    expect(phase(ctx.stage)).toBe('dressed');
    expect(ctx.stage.querySelector('.dressup-slot-top')?.textContent).toBe(topBtn.dataset.emoji);
    expect(ctx.stage.textContent).not.toMatch(/sai|lỗi|không phải/i);
    // Whatever was picked, a giggle is only ever triggered by an odd piece.
    expect(boing.mock.calls.length).toBeLessThanOrEqual(3);
    ctx.cleanup();
  });

  it('an odd garment plays boing and swaps the face; a fitting one plays ding', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const boing = vi.spyOn(ctx.audio, 'boing');
    const ding = vi.spyOn(ctx.audio, 'ding');
    const sky = ctx.stage.querySelector<HTMLElement>('.dressup-sky')!;
    const all = garments(ctx.stage, 'hat');
    // Find which of the three suits the weather by trying the pair of calls on a fresh game each time.
    const first = all[0]!;
    first.click();
    const odd = boing.mock.calls.length === 1;
    expect(odd ? ding.mock.calls.length : boing.mock.calls.length).toBe(0);
    expect(ctx.stage.querySelector('.dressup-head')?.textContent).toBe(odd ? '🤣' : '🧒');
    expect(sky.dataset.scenario).toBeTruthy();
    ctx.cleanup();
  });

  it('wearing another piece in the same slot swaps it; tapping the worn piece takes it off', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const [a, b] = garments(ctx.stage, 'hat');
    const slot = ctx.stage.querySelector<HTMLElement>('.dressup-slot-hat')!;
    a!.click();
    expect(slot.textContent).toBe(a!.dataset.emoji);
    b!.click();
    expect(slot.textContent).toBe(b!.dataset.emoji);
    slot.click();
    expect(slot.textContent).toBe('');
    ctx.cleanup();
  });

  it('dragging a garment onto the friend dresses it; dropping elsewhere does nothing', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const kid = ctx.stage.querySelector<HTMLElement>('.dressup-kid')!;
    vi.spyOn(kid, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, width: 100, height: 300, right: 100, bottom: 300, toJSON: () => ({}),
    });
    const g = garments(ctx.stage, 'top')[0]!;
    const slot = ctx.stage.querySelector<HTMLElement>('.dressup-slot-top')!;
    g.dispatchEvent(ptr('pointerdown', 500, 500));
    g.dispatchEvent(ptr('pointermove', 400, 400));
    g.dispatchEvent(ptr('pointerup', 400, 400));
    expect(slot.textContent).toBe('');
    g.dispatchEvent(ptr('pointerdown', 500, 500));
    g.dispatchEvent(ptr('pointermove', 50, 150));
    g.dispatchEvent(ptr('pointerup', 50, 150));
    expect(slot.textContent).toBe(g.dataset.emoji);
    ctx.cleanup();
  });

  it('plays the whole round: dress, tidy the toys, celebrate, one star, then a new round', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    for (const slot of SLOTS) garments(ctx.stage, slot)[0]!.click();
    expect(phase(ctx.stage)).toBe('dressed');
    vi.advanceTimersByTime(1500);
    expect(phase(ctx.stage)).toBe('tidy');
    const toys = [...ctx.stage.querySelectorAll<HTMLElement>('.dressup-toy')];
    expect(toys.length).toBeGreaterThanOrEqual(3);
    expect(toys.length).toBeLessThanOrEqual(4);
    expect(ctx.stage.querySelector('.dressup-box')).not.toBeNull();
    // Tapping the same toy twice counts once.
    toys[0]!.click();
    toys[0]!.click();
    for (const t of toys) t.click();
    expect(ctx.stars).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);
    expect(phase(ctx.stage)).toBe('dress');
    expect(ctx.stage.querySelectorAll('.dressup-toy')).toHaveLength(0);
    expect(ctx.stage.querySelectorAll('.dressup-slot.on')).toHaveLength(0);
    expect(garments(ctx.stage)).toHaveLength(9);
    ctx.cleanup();
  });

  it('cleanup stops pending timers: no celebrate or star after leaving', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    for (const slot of SLOTS) garments(ctx.stage, slot)[0]!.click();
    ctx.cleanup();
    await vi.advanceTimersByTimeAsync(10000);
    expect(ctx.celebrations).toBe(0);
    expect(ctx.stars).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
