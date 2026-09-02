import { describe, it, expect } from 'vitest';
import {
  BLOB_COUNT,
  BLOB_POS_MAX,
  BLOB_POS_MIN,
  BLOB_R_MAX,
  BLOB_R_MIN,
  CLEAN_ALPHA,
  CLEAN_DONE,
  blobPixels,
  cleanRatio,
  dirtColor,
  makeWashRound,
  WASHABLE,
} from './logic';
import { mulberry32 } from '../../core/dom';

/** `n` pixels; the first `opaque` of them have alpha 255, the rest 0. */
function buffer(n: number, opaque: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < opaque; p++) out[p * 4 + 3] = 255;
  return out;
}

describe('wash cleanRatio', () => {
  it('is 0 for all-opaque and 1 for all-transparent', () => {
    expect(cleanRatio(buffer(1000, 1000))).toBe(0);
    expect(cleanRatio(buffer(1000, 0))).toBe(1);
  });
  it('is about 0.5 for half/half at several strides', () => {
    const half = buffer(1000, 500);
    for (const stride of [1, 3, 4, 7]) {
      expect(Math.abs(cleanRatio(half, stride) - 0.5)).toBeLessThanOrEqual(0.05);
    }
  });
  it('treats alpha below CLEAN_ALPHA as clean', () => {
    const px = new Uint8ClampedArray(8);
    px[3] = CLEAN_ALPHA - 1;
    px[7] = CLEAN_ALPHA;
    expect(cleanRatio(px, 1)).toBe(0.5);
  });
  it('returns 0 for an empty buffer', () => {
    expect(cleanRatio(new Uint8ClampedArray(0))).toBe(0);
    expect(CLEAN_DONE).toBe(0.9);
  });
});

describe('wash makeWashRound', () => {
  it('gives BLOB_COUNT blobs inside the normalized ranges', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = makeWashRound(mulberry32(seed));
      expect(r.blobs.length).toBe(BLOB_COUNT);
      expect(BLOB_COUNT).toBe(40);
      for (const b of r.blobs) {
        expect(b.x).toBeGreaterThanOrEqual(BLOB_POS_MIN);
        expect(b.x).toBeLessThanOrEqual(BLOB_POS_MAX);
        expect(b.y).toBeGreaterThanOrEqual(BLOB_POS_MIN);
        expect(b.y).toBeLessThanOrEqual(BLOB_POS_MAX);
        expect(b.r).toBeGreaterThanOrEqual(BLOB_R_MIN);
        expect(b.r).toBeLessThanOrEqual(BLOB_R_MAX);
      }
      expect(WASHABLE.some((i) => i.emoji === r.item.emoji)).toBe(true);
    }
  });
  it('never picks the excluded item', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(makeWashRound(mulberry32(seed), '🐶').item.emoji).not.toBe('🐶');
      expect(makeWashRound(mulberry32(seed), '🚗').item.emoji).not.toBe('🚗');
    }
  });
  it('is deterministic for a seed', () => {
    expect(makeWashRound(mulberry32(9))).toEqual(makeWashRound(mulberry32(9)));
  });
  it('maps blobs to pixels using the shorter side for the radius', () => {
    expect(blobPixels({ x: 0.5, y: 0.25, r: 0.1 }, 200, 400)).toEqual({ cx: 100, cy: 100, r: 20 });
    expect(dirtColor(0.9)).toBe('rgba(124, 90, 58, 0.9)');
  });
});
