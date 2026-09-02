import { describe, it, expect, vi } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { fakeContext } from '../../core/testing';
import { PICTURES, congruent, makeBlocksRound } from './logic';
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

/** jsdom has no layout: give outline `i` the rect x ∈ [i·200, i·200+100], y ∈ [0, 100]. */
function layout(outlines: Element[]): void {
  outlines.forEach((el, i) => {
    const left = i * 200;
    el.getBoundingClientRect = () => ({
      x: left, y: 0, left, top: 0, width: 100, height: 100, right: left + 100, bottom: 100, toJSON: () => ({}),
    });
  });
}

/** Drag `piece` from the origin and release it at (x, y). */
function drop(piece: HTMLElement, x: number, y: number): void {
  piece.dispatchEvent(ptr('pointerdown', 0, 0));
  piece.dispatchEvent(ptr('pointermove', x, y));
  piece.dispatchEvent(ptr('pointerup', x, y));
}

/** Release `piece` over the outline of block `slotIndex`. */
function dropOn(piece: HTMLElement, slotIndex: number): void {
  drop(piece, slotIndex * 200 + 50, 50);
}

function mount() {
  const ctx = fakeContext();
  game.start(ctx);
  const root = ctx.stage.querySelector<HTMLElement>('.blocks')!;
  const picture = PICTURES.find((p) => p.id === root.dataset.picture)!;
  const outlines = [...ctx.stage.querySelectorAll<SVGPathElement>('.blocks-outline path')];
  layout(outlines);
  const pieces = [...ctx.stage.querySelectorAll<HTMLElement>('.blocks-tray .blocks-piece')];
  return { ctx, root, picture, outlines, pieces };
}

const indexOf = (piece: HTMLElement) => Number(piece.dataset.index);

describe('blocks game', () => {
  it('mounts one outline and one piece per block, announces the picture, cleans up', () => {
    const { ctx, root, picture, outlines, pieces } = mount();
    const n = picture.blocks.length;
    expect(n).toBeLessThanOrEqual(4);
    expect(outlines.length).toBe(n);
    expect(pieces.length).toBe(n);
    expect(ctx.stage.querySelectorAll('.blocks-fill path').length).toBe(0);
    expect([...outlines].map((o) => o.dataset.index).sort()).toEqual(pieces.map((p) => p.dataset.index).sort());
    for (const piece of pieces) {
      expect(piece.classList.contains('g-item')).toBe(true);
      expect(piece.querySelector('svg.blocks-piece-svg')).not.toBeNull();
    }
    expect(root.classList.contains('blocks-many')).toBe(false);
    expect(ctx.spoken).toEqual([`Xếp ${picture.name} nào!`]);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('boings and springs back on a wrong outline, snaps into the right one', () => {
    const { ctx, picture, outlines, pieces } = mount();
    const boing = vi.spyOn(ctx.audio, 'boing');
    const ding = vi.spyOn(ctx.audio, 'ding');
    const piece = pieces[0]!;
    const own = picture.blocks[indexOf(piece)]!;
    const wrong = picture.blocks.findIndex((b) => !congruent(own, b));
    expect(wrong).toBeGreaterThanOrEqual(0);

    dropOn(piece, wrong);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(ding).not.toHaveBeenCalled();
    expect(piece.classList.contains('placed')).toBe(false);
    expect(piece.classList.contains('spring-back')).toBe(true);
    expect(piece.parentElement?.classList.contains('blocks-tray')).toBe(true);
    expect(ctx.stage.querySelectorAll('.blocks-fill path').length).toBe(0);
    expect(outlines[wrong]!.classList.contains('blocks-done')).toBe(false);

    dropOn(piece, indexOf(piece));
    expect(ding).toHaveBeenCalledTimes(1);
    expect(piece.classList.contains('placed')).toBe(true);
    expect(piece.style.transform).toBe('');
    expect(outlines[indexOf(piece)]!.classList.contains('blocks-done')).toBe(true);
    const fills = ctx.stage.querySelectorAll('.blocks-fill path');
    expect(fills.length).toBe(1);
    expect(fills[0]!.getAttribute('fill')).toBe(own.color);
    expect(ctx.celebrations).toBe(0);
    ctx.cleanup();
  });

  it('celebrates, awards a star and starts a fresh picture once every block is placed', async () => {
    const { ctx, root, picture, outlines, pieces } = mount();
    const n = picture.blocks.length;
    for (const piece of pieces) dropOn(piece, indexOf(piece));
    expect(ctx.stage.querySelectorAll('.blocks-piece.placed').length).toBe(n);
    expect(ctx.stage.querySelectorAll('.blocks-fill path').length).toBe(n);
    expect(outlines.every((o) => o.classList.contains('blocks-done'))).toBe(true);
    expect(ctx.spoken).toContain(picture.name);
    expect(ctx.stage.querySelector('.blocks-svg')?.classList.contains('anim-bounce')).toBe(true);

    await vi.waitFor(() => expect(ctx.stars).toBe(1));
    expect(ctx.celebrations).toBe(1);
    const next = PICTURES.find((p) => p.id === root.dataset.picture)!;
    expect(next.id).not.toBe(picture.id);
    expect(next.blocks.length).toBeLessThanOrEqual(4);
    expect(ctx.stage.querySelectorAll('.blocks-outline path').length).toBe(next.blocks.length);
    expect(ctx.stage.querySelectorAll('.blocks-tray .blocks-piece:not(.placed)').length).toBe(next.blocks.length);
    expect(ctx.stage.querySelectorAll('.blocks-fill path').length).toBe(0);
    expect(ctx.spoken.at(-1)).toBe(`Xếp ${next.name} nào!`);
    ctx.cleanup();
  });

  it('accepts a piece on the outline of an identical twin block', () => {
    const seed = Array.from({ length: 300 }, (_, i) => i + 1).find((s) => makeBlocksRound(0, mulberry32(s)).id === 'car');
    expect(seed).toBeDefined();
    const random = vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed!));
    const { ctx, picture, outlines, pieces } = mount();
    random.mockRestore();
    expect(picture.id).toBe('car');

    const wheels = pieces.filter((p) => picture.blocks[indexOf(p)]?.shape === 'circle');
    expect(wheels.length).toBe(2);
    const [a, b] = wheels as [HTMLElement, HTMLElement];
    dropOn(a, indexOf(b));
    expect(a.classList.contains('placed')).toBe(true);
    expect(outlines[indexOf(b)]!.classList.contains('blocks-done')).toBe(true);
    expect(outlines[indexOf(a)]!.classList.contains('blocks-done')).toBe(false);
    dropOn(b, indexOf(b));
    expect(b.classList.contains('placed')).toBe(false);
    dropOn(b, indexOf(a));
    expect(b.classList.contains('placed')).toBe(true);
    ctx.cleanup();
  });

  it('idle hint wiggles the first unplaced piece and pulses its outline for 1.5 s', () => {
    vi.useFakeTimers();
    const { ctx, outlines, pieces } = mount();
    vi.advanceTimersByTime(6000);
    const piece = pieces[0]!;
    expect(piece.classList.contains('anim-wiggle')).toBe(true);
    const outline = outlines[indexOf(piece)]!;
    expect(outline.classList.contains('anim-pulse')).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(outline.classList.contains('anim-pulse')).toBe(false);
    ctx.cleanup();
    vi.useRealTimers();
  });
});
