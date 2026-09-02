import { describe, it, expect } from 'vitest';
import { makeShapeRound, roundSize, SHAPES, shapeSvg, holeSvg } from './logic';
import { mulberry32 } from '../../core/dom';

describe('shapes logic', () => {
  it('round size grows', () => {
    expect(roundSize(0)).toBe(3);
    expect(roundSize(1)).toBe(3);
    expect(roundSize(2)).toBe(4);
    expect(roundSize(9)).toBe(4);
  });
  it('targets are distinct shapes with distinct colors, tray is a permutation', () => {
    const r = makeShapeRound(3, mulberry32(7));
    expect(r.targets.length).toBe(4);
    expect(new Set(r.targets.map((t) => t.shape)).size).toBe(4);
    expect(new Set(r.targets.map((t) => t.color)).size).toBe(4);
    const key = (p: { shape: string }) => p.shape;
    expect([...r.tray].map(key).sort()).toEqual([...r.targets].map(key).sort());
  });
  it('has 8 shapes with paths', () => {
    expect(SHAPES.length).toBe(8);
    for (const s of SHAPES) expect(s.path.startsWith('M')).toBe(true);
  });
  it('renders svg for piece and hole', () => {
    expect(shapeSvg('star', '#f00').querySelector('path')?.getAttribute('fill')).toBe('#f00');
    expect(holeSvg('heart').classList.contains('hole-svg')).toBe(true);
  });
});
