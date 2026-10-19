import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeContext, type FakeContext } from '../../core/testing';
import game from './index';
import { fitBox, deriveDots, strokePath, toPixels } from './modes';
import { PICTURES } from './pictures';
import type { Pt } from './logic';

// jsdom has no layout: the field falls back to 400 x 600.
const box = fitBox(400, 600);

function ev(type: string, at: Pt): MouseEvent {
  const px = toPixels(box, at);
  return new MouseEvent(type, { bubbles: true, clientX: px.x, clientY: px.y, buttons: 1 });
}

function setup(): { ctx: FakeContext; field: Element; modeBtn: (i: number) => Element } {
  vi.useFakeTimers();
  const ctx = fakeContext();
  game.start(ctx);
  const field = ctx.stage.querySelector('.tp')!;
  return { ctx, field, modeBtn: (i) => ctx.stage.querySelectorAll('.tp-mode')[i]! };
}

afterEach(() => vi.useRealTimers());

async function finishRound(ctx: FakeContext): Promise<void> {
  expect(ctx.celebrations).toBe(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(ctx.stars).toBe(1);
}

describe('trace game (Tập vẽ)', () => {
  it('has three big mode buttons, defaults to following the lines, and announces the picture', () => {
    const { ctx } = setup();
    const btns = [...ctx.stage.querySelectorAll('.tp-mode')];
    expect(btns).toHaveLength(3);
    expect(btns[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(ctx.spoken.some((s) => s.startsWith('Mình vẽ '))).toBe(true);
    ctx.cleanup();
  });

  it('follow: a stray touch does nothing; tracing every stroke (in any order) finishes the picture', async () => {
    const { ctx, field } = setup();
    // Whichever picture came up, trace its strokes backwards in order to show order does not matter.
    const spoken = ctx.spoken[0]!;
    const shown = PICTURES.find((p) => spoken.includes(p.name))!;
    field.dispatchEvent(ev('pointerdown', { x: -0.4, y: -0.4 }));
    expect(ctx.celebrations).toBe(0);
    for (const stroke of [...shown.strokes].reverse()) {
      const pts = strokePath(stroke).pts;
      field.dispatchEvent(ev('pointerdown', pts[0]!));
      for (const q of pts) field.dispatchEvent(ev('pointermove', q));
      field.dispatchEvent(ev('pointerup', pts[pts.length - 1]!));
    }
    expect(ctx.spoken.some((s) => s.startsWith('Bé vẽ xong'))).toBe(true);
    await finishRound(ctx);
    ctx.cleanup();
  });

  it('dots: only the next dot joins; joining all dots finishes the picture', async () => {
    const { ctx, field, modeBtn } = setup();
    modeBtn(1).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(modeBtn(1).getAttribute('aria-pressed')).toBe('true');
    const shown = PICTURES.find((p) => ctx.spoken[0]!.includes(p.name))!;
    const ds = deriveDots(shown.strokes);
    // Only one stroke's dots show at a time.
    expect([...ctx.stage.querySelectorAll('.tp-dots > g')].filter((g) => g.getAttribute('display') !== 'none')).toHaveLength(1);
    expect(ctx.stage.querySelectorAll('.tp-dot').length).toBe(ds.reduce((n, d) => n + d.pts.length, 0));
    // The second dot of the first stroke does nothing before the first is joined.
    field.dispatchEvent(ev('pointerdown', ds[0]!.pts[1]!));
    field.dispatchEvent(ev('pointerup', ds[0]!.pts[1]!));
    expect(ctx.celebrations).toBe(0);
    for (const d of ds) {
      for (const pt of d.pts) {
        field.dispatchEvent(ev('pointerdown', pt));
        field.dispatchEvent(ev('pointerup', pt));
      }
    }
    await finishRound(ctx);
    ctx.cleanup();
  });

  it('colour: rubbing every fill colours the picture in and moves on', async () => {
    const { ctx, field, modeBtn } = setup();
    modeBtn(2).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    const shown = PICTURES.find((p) => ctx.spoken[0]!.includes(p.name))!;
    for (const f of shown.fills) {
      const xs = f.pts.map((q) => q.x);
      const ys = f.pts.map((q) => q.y);
      for (let y = Math.min(...ys); y <= Math.max(...ys) + 0.05; y += 0.04) {
        field.dispatchEvent(ev('pointerdown', { x: Math.min(...xs), y }));
        field.dispatchEvent(ev('pointermove', { x: Math.max(...xs), y }));
        field.dispatchEvent(ev('pointerup', { x: Math.max(...xs), y }));
      }
    }
    await finishRound(ctx);
    ctx.cleanup();
  });

  it('remembers the chosen mode within the visit', () => {
    const a = setup();
    a.modeBtn(2).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    a.ctx.cleanup();
    vi.useRealTimers();
    const b = setup();
    expect(b.modeBtn(2).getAttribute('aria-pressed')).toBe('true');
    b.modeBtn(0).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    b.ctx.cleanup();
  });
});
