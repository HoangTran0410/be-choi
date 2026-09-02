import { ANIMALS, VEHICLES, type Item } from '../../core/content';
import { randInt } from '../../core/dom';

export interface DirtBlob {
  /** Centre as a fraction of the canvas width (0.15 … 0.85). */
  x: number;
  /** Centre as a fraction of the canvas height (0.15 … 0.85). */
  y: number;
  /** Radius as a fraction of the shorter canvas side (0.06 … 0.14). */
  r: number;
}

export interface WashRound {
  item: Item;
  /** Dirt in normalized coords so it can be redrawn identically after a resize. */
  blobs: DirtBlob[];
}

/** Fraction of sampled pixels that must be clear before the round ends. */
export const CLEAN_DONE = 0.9;
export const BLOB_COUNT = 40;
/** Pixels with alpha below this count as clean. */
export const CLEAN_ALPHA = 32;
export const DIRT_COLOR = '#7c5a3a';
export const BLOB_POS_MIN = 0.15;
export const BLOB_POS_MAX = 0.85;
export const BLOB_R_MIN = 0.06;
export const BLOB_R_MAX = 0.14;

/** Everything that can get dirty: animals and vehicles. */
export const WASHABLE: readonly Item[] = [...ANIMALS, ...VEHICLES];

export function makeWashRound(rng: () => number = Math.random, excludeEmoji?: string): WashRound {
  const pool = WASHABLE.filter((i) => i.emoji !== excludeEmoji);
  const item = pool[randInt(0, pool.length - 1, rng)];
  if (!item) throw new Error('wash: nothing to wash');
  const blobs: DirtBlob[] = [];
  for (let i = 0; i < BLOB_COUNT; i++) {
    blobs.push({
      x: BLOB_POS_MIN + rng() * (BLOB_POS_MAX - BLOB_POS_MIN),
      y: BLOB_POS_MIN + rng() * (BLOB_POS_MAX - BLOB_POS_MIN),
      r: BLOB_R_MIN + rng() * (BLOB_R_MAX - BLOB_R_MIN),
    });
  }
  return { item, blobs };
}

/** Map a normalized blob onto a `w`×`h` canvas. */
export function blobPixels(b: DirtBlob, w: number, h: number): { cx: number; cy: number; r: number } {
  return { cx: b.x * w, cy: b.y * h, r: b.r * Math.min(w, h) };
}

/** `DIRT_COLOR` with the given alpha, as a canvas fill string. */
export function dirtColor(alpha: number): string {
  return `rgba(124, 90, 58, ${alpha})`;
}

/**
 * Fraction of sampled pixels whose alpha is below `CLEAN_ALPHA`. `rgba` is
 * `ImageData.data`; every `stride`-th pixel is sampled. An empty buffer
 * returns 0 so a round can never end by accident.
 */
export function cleanRatio(rgba: Uint8ClampedArray, stride = 4): number {
  const step = Math.max(1, Math.floor(stride)) * 4;
  let sampled = 0;
  let clean = 0;
  for (let i = 3; i < rgba.length; i += step) {
    sampled++;
    if ((rgba[i] ?? 255) < CLEAN_ALPHA) clean++;
  }
  return sampled === 0 ? 0 : clean / sampled;
}
