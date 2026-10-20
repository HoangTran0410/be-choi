import { describe, expect, it } from 'vitest';
import { floodRegion, growMask, hexToRgb, nearestOpen, paintMask, wallsFromRgba } from './flood';

/** A 10x10 page with a 4x4 box drawn from (3,3) to (6,6) (its border is wall). */
function boxPage(gap = false): { walls: Uint8Array; w: number; h: number } {
  const w = 10;
  const h = 10;
  const walls = new Uint8Array(w * h);
  for (let i = 3; i <= 6; i++) {
    walls[3 * w + i] = 1;
    walls[6 * w + i] = 1;
    walls[i * w + 3] = 1;
    walls[i * w + 6] = 1;
  }
  if (gap) walls[3 * w + 4] = 0;
  return { walls, w, h };
}

describe('floodRegion', () => {
  it('fills only the inside of a closed shape', () => {
    const { walls, w, h } = boxPage();
    const r = floodRegion(walls, w, h, 4, 4)!;
    expect(r.count).toBe(4); // the 2x2 inside
    expect(r.mask[4 * w + 4]).toBe(1);
    expect(r.mask[3 * w + 3]).toBe(0);
    expect(r.mask[0]).toBe(0);
  });
  it('fills the outside from outside, around the box', () => {
    const { walls, w, h } = boxPage();
    const r = floodRegion(walls, w, h, 0, 0)!;
    expect(r.count).toBe(100 - 16);
    expect(r.mask[4 * w + 4]).toBe(0);
  });
  it('leaks through a gap, which is fine', () => {
    const { walls, w, h } = boxPage(true);
    const r = floodRegion(walls, w, h, 4, 4)!;
    expect(r.count).toBe(89); // 84 outside + 4 inside + the gap
  });
  it('gives null on a wall or off the page', () => {
    const { walls, w, h } = boxPage();
    expect(floodRegion(walls, w, h, 3, 3)).toBeNull();
    expect(floodRegion(walls, w, h, -1, 2)).toBeNull();
    expect(floodRegion(walls, w, h, 2, 99)).toBeNull();
  });
});

describe('nearestOpen', () => {
  it('moves a tap on a line to the nearest open pixel', () => {
    const { walls, w, h } = boxPage();
    expect(nearestOpen(walls, w, h, 5, 5)).toEqual({ x: 5, y: 5 });
    const p = nearestOpen(walls, w, h, 3, 3, 2)!;
    expect(walls[p.y * w + p.x]).toBe(0);
    expect(Math.hypot(p.x - 3, p.y - 3)).toBeLessThanOrEqual(2);
  });
  it('gives up when everything near is wall', () => {
    const walls = new Uint8Array(25).fill(1);
    expect(nearestOpen(walls, 5, 5, 2, 2, 2)).toBeNull();
  });
});

describe('growMask / paintMask / wallsFromRgba', () => {
  it('grows by one pixel per step', () => {
    const mask = new Uint8Array(25);
    mask[12] = 1;
    expect(growMask(mask, 5, 5, 1).reduce((a, b) => a + b, 0)).toBe(5);
    expect(growMask(mask, 5, 5, 2).reduce((a, b) => a + b, 0)).toBe(13);
  });
  it('paints masked pixels opaque and leaves the rest', () => {
    const rgba = new Uint8ClampedArray(8);
    paintMask(rgba, Uint8Array.from([0, 1]), '#ff8000');
    expect([...rgba]).toEqual([0, 0, 0, 0, 255, 128, 0, 255]);
    expect(hexToRgb('nope')).toEqual([0, 0, 0]);
  });
  it('reads dark visible pixels as walls', () => {
    // dark opaque, white opaque, dark but transparent
    const rgba = Uint8ClampedArray.from([20, 20, 20, 255, 255, 255, 255, 255, 0, 0, 0, 0]);
    expect([...wallsFromRgba(rgba, 3, 1)]).toEqual([1, 0, 0]);
  });
});
