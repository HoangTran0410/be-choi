import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { checkStep, extend, GAP_MS, makeSequence, MAX_LEN, PADS, PLAY_MS, STAR_AT, START_LEN } from './logic';

function hasTriple(seq: readonly number[]): boolean {
  for (let i = 2; i < seq.length; i++) {
    if (seq[i] === seq[i - 1] && seq[i] === seq[i - 2]) return true;
  }
  return false;
}

describe('simon logic', () => {
  it('has 4 pads with distinct emojis, names, notes and colours', () => {
    expect(PADS.length).toBe(4);
    expect(new Set(PADS.map((p) => p.emoji)).size).toBe(4);
    expect(new Set(PADS.map((p) => p.name)).size).toBe(4);
    expect(new Set(PADS.map((p) => p.note)).size).toBe(4);
    expect(new Set(PADS.map((p) => p.color)).size).toBe(4);
    for (const p of PADS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.note).toMatch(/^[A-G][#b]?\d$/);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('melody lengths grow from START_LEN past STAR_AT up to MAX_LEN', () => {
    expect(START_LEN).toBe(2);
    expect(STAR_AT).toBe(4);
    expect(MAX_LEN).toBe(6);
    expect(START_LEN).toBeLessThan(STAR_AT);
    expect(STAR_AT).toBeLessThan(MAX_LEN);
    expect(PLAY_MS).toBeGreaterThan(0);
    expect(GAP_MS).toBeGreaterThan(0);
  });

  it('makeSequence has the requested length and only pad indices', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (let len = 0; len <= MAX_LEN; len++) {
        const seq = makeSequence(len, mulberry32(seed * 7 + len));
        expect(seq.length).toBe(len);
        for (const i of seq) {
          expect(Number.isInteger(i)).toBe(true);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(PADS.length);
        }
      }
    }
  });

  it('makeSequence is deterministic for a given rng', () => {
    expect(makeSequence(6, mulberry32(3))).toEqual(makeSequence(6, mulberry32(3)));
  });

  it('never plays the same pad three times in a row', () => {
    for (let seed = 0; seed < 300; seed++) {
      const seq = makeSequence(40, mulberry32(seed));
      expect(hasTriple(seq)).toBe(false);
    }
  });

  it('uses every pad and allows doubles', () => {
    const seq = makeSequence(200, mulberry32(42));
    expect(new Set(seq).size).toBe(PADS.length);
    expect(seq.some((v, i) => i > 0 && v === seq[i - 1])).toBe(true);
  });

  it('extend adds exactly one index and leaves the input alone', () => {
    const base = [0, 3, 1];
    const copy = [...base];
    for (let seed = 0; seed < 50; seed++) {
      const next = extend(base, mulberry32(seed));
      expect(next.length).toBe(4);
      expect(next.slice(0, 3)).toEqual(base);
      expect(next[3]).toBeGreaterThanOrEqual(0);
      expect(next[3]).toBeLessThan(PADS.length);
    }
    expect(base).toEqual(copy);
    expect(extend([]).length).toBe(1);
  });

  it('extend never completes a triple', () => {
    for (let pad = 0; pad < PADS.length; pad++) {
      for (let seed = 0; seed < 100; seed++) {
        const next = extend([pad, pad], mulberry32(seed));
        expect(next[2]).not.toBe(pad);
        const longer = extend([2, pad, pad], mulberry32(seed));
        expect(longer[3]).not.toBe(pad);
      }
    }
  });

  it('checkStep reports ok, wrong and complete', () => {
    const seq = [2, 0, 3];
    expect(checkStep(seq, 0, 2)).toBe('ok');
    expect(checkStep(seq, 1, 0)).toBe('ok');
    expect(checkStep(seq, 2, 3)).toBe('complete');
    expect(checkStep(seq, 0, 1)).toBe('wrong');
    expect(checkStep(seq, 2, 0)).toBe('wrong');
    expect(checkStep(seq, 3, 3)).toBe('wrong');
    expect(checkStep([1], 0, 1)).toBe('complete');
  });
});
