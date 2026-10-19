import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import {
  GARMENTS,
  MAX_TOYS,
  MIN_TOYS,
  OFFER_COUNT,
  SCENARIOS,
  SLOTS,
  TOYS,
  dressed,
  fits,
  makeDressRound,
  makeToys,
} from './logic';

describe('dressup data', () => {
  it('every scenario has a fitting garment in every slot, and enough that do not', () => {
    for (const s of SCENARIOS) {
      for (const slot of SLOTS) {
        const all = GARMENTS.filter((g) => g.slot === slot);
        expect(all.filter((g) => fits(g, s)).length).toBeGreaterThan(0);
        expect(all.filter((g) => !fits(g, s)).length).toBeGreaterThanOrEqual(OFFER_COUNT - 1);
      }
    }
  });
  it('garment emoji are unique', () => {
    expect(new Set(GARMENTS.map((g) => g.emoji)).size).toBe(GARMENTS.length);
  });
});

describe('makeDressRound', () => {
  it('offers three distinct garments per slot with exactly one that suits', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = makeDressRound(mulberry32(seed));
      for (const slot of SLOTS) {
        const o = r.offers[slot];
        expect(o).toHaveLength(OFFER_COUNT);
        expect(new Set(o.map((g) => g.emoji)).size).toBe(OFFER_COUNT);
        expect(o.every((g) => g.slot === slot)).toBe(true);
        expect(o.filter((g) => fits(g, r.scenario))).toHaveLength(1);
      }
    }
  });
  it('avoids the excluded scenario and reaches every other one', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 80; seed++) {
      const r = makeDressRound(mulberry32(seed), 'rainy');
      expect(r.scenario.id).not.toBe('rainy');
      seen.add(r.scenario.id);
    }
    expect(seen.size).toBe(SCENARIOS.length - 1);
  });
});

describe('dressed', () => {
  it('needs all three slots, in any order', () => {
    const [hat, top, shoes] = SLOTS.map((s) => GARMENTS.find((g) => g.slot === s)!);
    expect(dressed({})).toBe(false);
    expect(dressed({ shoes, hat })).toBe(false);
    expect(dressed({ shoes, hat, top })).toBe(true);
  });
});

describe('makeToys', () => {
  it('gives 3–4 different toys', () => {
    for (let seed = 1; seed < 30; seed++) {
      const t = makeToys(mulberry32(seed));
      expect(t.length).toBeGreaterThanOrEqual(MIN_TOYS);
      expect(t.length).toBeLessThanOrEqual(MAX_TOYS);
      expect(new Set(t).size).toBe(t.length);
      expect(t.every((x) => TOYS.includes(x))).toBe(true);
    }
  });
});
