import { describe, it, expect } from 'vitest';
import { makeShadowRound, roundSize } from './logic';
import { ANIMALS } from '../../core/content';
import { mulberry32 } from '../../core/dom';

describe('shadows logic', () => {
  it('round size grows', () => {
    expect(roundSize(0)).toBe(3);
    expect(roundSize(1)).toBe(3);
    expect(roundSize(2)).toBe(4);
    expect(roundSize(9)).toBe(4);
  });
  it('animals are distinct by emoji and come from ANIMALS', () => {
    for (const [round, n] of [
      [0, 3],
      [3, 4],
    ] as const) {
      const r = makeShadowRound(round, mulberry32(11 + round));
      expect(r.animals.length).toBe(n);
      expect(new Set(r.animals.map((a) => a.emoji)).size).toBe(n);
      for (const a of r.animals) expect(ANIMALS.some((x) => x.emoji === a.emoji)).toBe(true);
    }
  });
  it('tray is a permutation of the animals', () => {
    const r = makeShadowRound(2, mulberry32(5));
    expect(r.tray.length).toBe(r.animals.length);
    const key = (i: { emoji: string }) => i.emoji;
    expect([...r.tray].map(key).sort()).toEqual([...r.animals].map(key).sort());
  });
  it('every item has a non-empty Vietnamese name', () => {
    const r = makeShadowRound(4, mulberry32(9));
    for (const a of [...r.animals, ...r.tray]) {
      expect(typeof a.name).toBe('string');
      expect(a.name.trim().length).toBeGreaterThan(0);
    }
  });
});
