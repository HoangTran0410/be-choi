import { describe, it, expect } from 'vitest';
import { makeBubble, popPitch, starEvery } from './logic';
import { mulberry32 } from '../../core/dom';

describe('bubbles', () => {
  it('produces sane specs', () => {
    const rng = mulberry32(3);
    let withItem = 0;
    for (let i = 0; i < 200; i++) {
      const b = makeBubble(rng);
      expect(b.size).toBeGreaterThanOrEqual(80);
      expect(b.size).toBeLessThanOrEqual(160);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(1);
      expect(b.hue).toBeGreaterThanOrEqual(0);
      expect(b.hue).toBeLessThan(360);
      expect(b.speed).toBeGreaterThan(0);
      if (b.item) withItem++;
    }
    expect(withItem).toBeGreaterThan(20);
    expect(withItem).toBeLessThan(100);
  });
  it('pitch is higher for small bubbles and clamped', () => {
    expect(popPitch(80)).toBe(2);
    expect(popPitch(160)).toBe(1);
    expect(popPitch(1000)).toBe(0.8);
  });
  it('awards a star every 15 pops', () => {
    expect(starEvery()).toBe(15);
  });
});
