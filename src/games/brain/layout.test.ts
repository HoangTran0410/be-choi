import { describe, expect, it } from 'vitest';
import { fitGrid, phraseMs } from './layout';

describe('fitGrid', () => {
  it('fills a tall box with few columns and a wide box with many', () => {
    expect(fitGrid(12, 300, 700).cols).toBeLessThan(fitGrid(12, 800, 300).cols);
  });
  it('never makes a cell wider than the box allows', () => {
    const f = fitGrid(16, 360, 360, 8);
    expect(f.size * f.cols + 8 * (f.cols - 1)).toBeLessThanOrEqual(360);
    expect(f.size * f.rows + 8 * (f.rows - 1)).toBeLessThanOrEqual(360);
  });
  it('handles an unmeasured (0-sized) box', () => {
    expect(fitGrid(4, 0, 0).cols).toBeGreaterThan(0);
  });
});

describe('phraseMs', () => {
  it('grows with the number of words', () => {
    expect(phraseMs('con mèo')).toBeLessThan(phraseMs('con mèo kêu meo meo'));
  });
});

describe('fitGrid exact', () => {
  it('leaves no lonely card on the last row', () => {
    const f = fitGrid(16, 360, 640, 10, 16, true);
    expect(16 % f.cols).toBe(0);
    expect(f.cols).toBe(4);
  });
});
