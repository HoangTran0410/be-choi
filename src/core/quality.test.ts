import { describe, expect, it } from 'vitest';
import { LOW_DPR, decorCount, decorRate, pickDpr } from './quality';

describe('pickDpr', () => {
  it('keeps the screen resolution up to the cap when all is well', () => {
    expect(pickDpr(3, 2, false)).toBe(2);
    expect(pickDpr(1.5, 2, false)).toBe(1.5);
  });
  it('drops to LOW_DPR when struggling, never raising a low screen', () => {
    expect(pickDpr(3, 2, true)).toBe(LOW_DPR);
    expect(pickDpr(0.75, 2, true)).toBe(0.75);
  });
  it('survives a missing or odd devicePixelRatio', () => {
    expect(pickDpr(0, 2, false)).toBe(1);
    expect(pickDpr(NaN, 2, true)).toBe(1);
  });
});

describe('decorCount', () => {
  it('is untouched normally', () => {
    expect(decorCount(90, false)).toBe(90);
  });
  it('halves when struggling but keeps a floor and never exceeds n', () => {
    expect(decorCount(90, true)).toBe(45);
    expect(decorCount(1, true)).toBe(1);
    expect(decorCount(3, true, 5)).toBe(3);
    expect(decorCount(0, true)).toBe(0);
  });
});

describe('decorRate', () => {
  it('halves only when struggling', () => {
    expect(decorRate(10, false)).toBe(10);
    expect(decorRate(10, true)).toBe(5);
  });
});
