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

const ptr = (type: string, x: number, y: number) =>
  new PointerEvent(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    isPrimary: true,
    bubbles: true,
  });

function rect(el: Element, left: number, top: number, w = 100, h = 100) {
  el.getBoundingClientRect = () =>
    ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON() {} }) as DOMRect;
}

/** Lay the bins out side by side in jsdom (which has no layout). */
function layout(stage: HTMLElement) {
  stage.querySelectorAll<HTMLElement>('.sortout-bin').forEach((b, i) => rect(b, 300 * (i + 1), 0));
  stage.querySelectorAll<HTMLElement>('.sortout-piece').forEach((p) => rect(p, 0, 500, 72, 72));
}

function prep(piece: HTMLElement) {
  piece.setPointerCapture = vi.fn();
  piece.releasePointerCapture = vi.fn();
}

function drag(piece: HTMLElement, x: number, y: number) {
  prep(piece);
  piece.dispatchEvent(ptr('pointerdown', 10, 510));
  piece.dispatchEvent(ptr('pointermove', x, y));
  piece.dispatchEvent(ptr('pointerup', x, y));
}

function tap(piece: HTMLElement) {
  prep(piece);
  piece.dispatchEvent(ptr('pointerdown', 10, 510));
  piece.dispatchEvent(ptr('pointerup', 10, 510));
}

const binX = (stage: HTMLElement, cat: string) => {
  const bins = [...stage.querySelectorAll<HTMLElement>('.sortout-bin')];
  return 300 * (bins.findIndex((b) => b.dataset.cat === cat) + 1) + 50;
};

describe('sortout game', () => {
  it('mounts 2 bins and 4 items in round 0, cleans up', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.sortout-bin').length).toBe(2);
    expect(ctx.stage.querySelectorAll('.sortout-piece').length).toBe(4);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });

  it('wrong bin springs back silently; right bin files the item', () => {
    const ctx = fakeContext();
    game.start(ctx);
    layout(ctx.stage);
    const piece = ctx.stage.querySelector<HTMLElement>('.sortout-piece')!;
    const cat = piece.dataset.cat!;
    const other = [...ctx.stage.querySelectorAll<HTMLElement>('.sortout-bin')].find((b) => b.dataset.cat !== cat)!;
    drag(piece, binX(ctx.stage, other.dataset.cat!), 50);
    expect(piece.classList.contains('placed')).toBe(false);
    expect(piece.classList.contains('is-carried')).toBe(false);
    expect(ctx.spoken.length).toBe(1); // only the opening line
    drag(piece, binX(ctx.stage, cat), 50);
    expect(piece.classList.contains('placed')).toBe(true);
    expect(piece.parentElement?.parentElement?.dataset.cat).toBe(cat);
    expect(ctx.spoken.length).toBe(2);
    ctx.cleanup();
  });

  it('tap an item then tap its bin; wrong bin does nothing', () => {
    const ctx = fakeContext();
    game.start(ctx);
    layout(ctx.stage);
    const piece = ctx.stage.querySelector<HTMLElement>('.sortout-piece')!;
    tap(piece);
    expect(piece.classList.contains('selected')).toBe(true);
    const bins = [...ctx.stage.querySelectorAll<HTMLElement>('.sortout-bin')];
    bins.find((b) => b.dataset.cat !== piece.dataset.cat)!.click();
    expect(piece.classList.contains('placed')).toBe(false);
    expect(piece.classList.contains('selected')).toBe(false);
    tap(piece);
    bins.find((b) => b.dataset.cat === piece.dataset.cat)!.click();
    expect(piece.classList.contains('placed')).toBe(true);
    ctx.cleanup();
  });

  it('celebrates, awards a star and deals a 3-bin round when all are put away', async () => {
    const ctx = fakeContext();
    game.start(ctx);
    layout(ctx.stage);
    for (const piece of [...ctx.stage.querySelectorAll<HTMLElement>('.sortout-piece')]) {
      drag(piece, binX(ctx.stage, piece.dataset.cat!), 50);
    }
    expect(ctx.celebrations).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.stars).toBe(1);
    expect(ctx.stage.querySelectorAll('.sortout-bin').length).toBe(3);
    expect(ctx.stage.querySelectorAll('.sortout-piece:not(.placed)').length).toBe(6);
    ctx.cleanup();
  });
});
