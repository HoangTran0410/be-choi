import { describe, it, expect } from 'vitest';
import {
  BLOCK_SHAPES,
  PICTURES,
  blockPath,
  blockTransform,
  congruent,
  difficultyFor,
  makeBlocksRound,
  overlaps,
  pieceOrder,
  type Block,
} from './logic';
import { mulberry32 } from '../../core/dom';

const box = (x: number, y: number, w: number, h: number): Block => ({ shape: 'rect', x, y, w, h, color: '#000' });

describe('blocks logic', () => {
  it('has at least 22 pictures with unique ids, Vietnamese names and 3–6 blocks inside the 100×100 picture', () => {
    expect(PICTURES.length).toBeGreaterThanOrEqual(22);
    expect(new Set(PICTURES.map((p) => p.id)).size).toBe(PICTURES.length);
    for (const p of PICTURES) {
      expect(p.id).toMatch(/^[a-z]+$/);
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(p.blocks.length).toBeGreaterThanOrEqual(3);
      expect(p.blocks.length).toBeLessThanOrEqual(6);
      for (const b of p.blocks) {
        expect(BLOCK_SHAPES).toContain(b.shape);
        expect(b.w).toBeGreaterThan(0);
        expect(b.h).toBeGreaterThan(0);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, `${p.id}: block past the right edge`).toBeLessThanOrEqual(100);
        expect(b.y + b.h, `${p.id}: block past the bottom edge`).toBeLessThanOrEqual(100);
        expect(b.color).toMatch(/^#[0-9a-f]{6}$/i);
        if (b.rot !== undefined) expect([90, 180, 270]).toContain(b.rot);
        if (b.rot === 90 || b.rot === 270) expect(b.w, `${p.id}: quarter turns need a square box`).toBe(b.h);
      }
    }
  });

  it('has at least 8 easy pictures (≤ 4 blocks) for the first two rounds', () => {
    const easy = PICTURES.filter((p) => p.blocks.length <= difficultyFor(0));
    expect(easy.length).toBeGreaterThanOrEqual(8);
  });

  it('every block has a non-congruent sibling, so a wrong outline always exists', () => {
    for (const p of PICTURES) {
      for (const b of p.blocks) {
        expect(
          p.blocks.some((other) => !congruent(b, other)),
          `${p.id}`,
        ).toBe(true);
      }
    }
  });

  it('no two blocks in a picture overlap', () => {
    for (const p of PICTURES) {
      for (let i = 0; i < p.blocks.length; i++) {
        for (let j = i + 1; j < p.blocks.length; j++) {
          expect(overlaps(p.blocks[i]!, p.blocks[j]!), `${p.id}: blocks ${i} and ${j}`).toBe(false);
        }
      }
    }
  });

  it('overlaps: crossing boxes overlap, touching or separate boxes do not', () => {
    expect(overlaps(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBe(true);
    expect(overlaps(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(0, 10, 10, 10))).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(20, 20, 10, 10))).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(9.8, 0, 10, 10))).toBe(false);
    expect(overlaps(box(0, 0, 10, 10), box(9.8, 0, 10, 10), 0)).toBe(true);
  });

  it('blockPath returns a path for every shape', () => {
    expect(BLOCK_SHAPES.length).toBe(7);
    for (const s of BLOCK_SHAPES) {
      const d = blockPath(s);
      expect(d.length).toBeGreaterThan(0);
      expect(d.startsWith('M')).toBe(true);
      expect(d.trim().endsWith('Z')).toBe(true);
    }
  });

  it('blockTransform places the unit box and rotates about the box centre', () => {
    const b = box(10, 20, 30, 40);
    expect(blockTransform(b)).toBe('translate(10 20) scale(30 40)');
    expect(blockTransform(b, 0, 0)).toBe('translate(0 0) scale(30 40)');
    expect(blockTransform({ ...b, rot: 180 })).toBe('translate(25 40) rotate(180) translate(-25 -40) translate(10 20) scale(30 40)');
    expect(blockTransform({ ...b, rot: 360 })).toBe('translate(10 20) scale(30 40)');
  });

  it('difficultyFor: 4 blocks for rounds 0 and 1, then 6', () => {
    expect(difficultyFor(0)).toBe(4);
    expect(difficultyFor(1)).toBe(4);
    expect(difficultyFor(2)).toBe(6);
    expect(difficultyFor(9)).toBe(6);
  });

  it('makeBlocksRound respects the block budget and excludeId', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const easy = makeBlocksRound(0, mulberry32(seed));
      expect(easy.blocks.length).toBeLessThanOrEqual(4);
      expect(PICTURES).toContain(easy);
      expect(makeBlocksRound(1, mulberry32(seed), easy.id).id).not.toBe(easy.id);
      const hard = makeBlocksRound(5, mulberry32(seed));
      expect(hard.blocks.length).toBeLessThanOrEqual(6);
      expect(makeBlocksRound(5, mulberry32(seed + 100), hard.id).id).not.toBe(hard.id);
      seen.add(hard.id);
    }
    expect(seen.size).toBeGreaterThan(4);
    expect(PICTURES).toContain(makeBlocksRound(0, mulberry32(3), 'no-such-picture'));
  });

  it('pieceOrder is a permutation of the block indices', () => {
    const picture = PICTURES.find((p) => p.id === 'robot')!;
    const order = pieceOrder(picture, mulberry32(9));
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    let shuffled = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (pieceOrder(picture, mulberry32(seed)).some((v, i) => v !== i)) shuffled++;
    }
    expect(shuffled).toBeGreaterThan(0);
  });

  it('congruent: same shape, size and rotation; square and rect are the same family', () => {
    const a = box(0, 0, 20, 20);
    expect(congruent(a, box(50, 50, 20, 20))).toBe(true);
    expect(congruent(a, { ...a, shape: 'square' })).toBe(true);
    expect(congruent(a, box(0, 0, 20, 30))).toBe(false);
    expect(congruent(a, { ...a, shape: 'circle' })).toBe(false);
    const tri: Block = { ...a, shape: 'triangle' };
    expect(congruent(tri, { ...tri, rot: 180 })).toBe(false);
    expect(congruent(tri, { ...tri, rot: 360 })).toBe(true);
  });
});
