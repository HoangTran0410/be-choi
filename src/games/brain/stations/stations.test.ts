import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../core/dom';
import { diffParams, MAX_LEVEL, missingParams, sequenceParams } from '../levels';
import { dealCards } from './cards';
import { dealScene } from './diff';
import { dealTable } from './missing';
import { dealTune } from './sequence';

const photo = (n: number) => ({ id: `p${n}`, url: `data:image/jpeg;base64,${n}`, createdAt: n });

describe('dealCards', () => {
  it('makes every picture appear exactly twice, with unique ids', () => {
    for (const pairs of [2, 3, 4, 6, 8]) {
      const deck = dealCards(pairs, 0, [], mulberry32(pairs));
      expect(deck).toHaveLength(pairs * 2);
      expect(new Set(deck.map((c) => c.id)).size).toBe(pairs * 2);
      const count = new Map<string, number>();
      for (const c of deck) count.set(c.piece.key, (count.get(c.piece.key) ?? 0) + 1);
      expect([...count.values()].every((n) => n === 2)).toBe(true);
    }
  });
  it('is the same board for the same seed', () => {
    const a = dealCards(6, 1, [], mulberry32(7)).map((c) => c.piece.key);
    const b = dealCards(6, 1, [], mulberry32(7)).map((c) => c.piece.key);
    expect(a).toEqual(b);
  });
  it('puts family photos in as pairs, at least one and at most half', () => {
    const photos = [photo(1), photo(2), photo(3), photo(4), photo(5)];
    const two = dealCards(2, 0, photos, mulberry32(1));
    expect(two.filter((c) => c.piece.photo)).toHaveLength(2);
    const eight = dealCards(8, 0, photos, mulberry32(1));
    expect(eight.filter((c) => c.piece.photo)).toHaveLength(8); // 4 photo pairs
    const one = dealCards(8, 0, [photo(1)], mulberry32(1));
    expect(one.filter((c) => c.piece.photo)).toHaveLength(2);
  });
});

describe('dealTune', () => {
  it('has the asked length, no repeats, all inside the options', () => {
    for (let l = 0; l <= MAX_LEVEL.sequence; l++) {
      for (const kind of ['animals', 'colors', 'fruits'] as const) {
        const t = dealTune(l, kind, [], mulberry32(l * 3 + kind.length));
        const p = sequenceParams(l);
        expect(t.order).toHaveLength(p.length);
        expect(t.options).toHaveLength(p.options);
        expect(new Set(t.order).size).toBe(p.length);
        expect(t.order.every((i) => i >= 0 && i < t.options.length)).toBe(true);
        expect(new Set(t.options.map((o) => o.key)).size).toBe(p.options);
      }
    }
  });
  it('lets a family photo take one seat among the animals', () => {
    const t = dealTune(2, 'animals', [photo(1)], mulberry32(5));
    expect(t.options.filter((o) => o.photo)).toHaveLength(1);
    expect(t.options).toHaveLength(sequenceParams(2).options);
  });
});

describe('dealTable', () => {
  it('has a thing that vanishes, and wrong answers that were never on the table', () => {
    for (let l = 0; l <= MAX_LEVEL.missing; l++) {
      for (let seed = 1; seed <= 20; seed++) {
        const t = dealTable(l, l % 3, [], mulberry32(seed));
        const p = missingParams(l);
        expect(t.shown).toHaveLength(p.shown);
        expect(t.choices).toHaveLength(p.choices);
        const gone = t.shown[t.gone]!;
        expect(t.choices.filter((c) => c.key === gone.key)).toHaveLength(1);
        const onTable = new Set(t.shown.map((s) => s.key));
        for (const c of t.choices) if (c.key !== gone.key) expect(onTable.has(c.key)).toBe(false);
        expect(onTable.size).toBe(p.shown);
      }
    }
  });
});

describe('dealScene', () => {
  it('differs in exactly one cell', () => {
    for (let l = 0; l <= MAX_LEVEL.diff; l++) {
      for (let seed = 1; seed <= 30; seed++) {
        const s = dealScene(l, l % 3, mulberry32(seed));
        const p = diffParams(l);
        expect(s.left).toHaveLength(p.cols * p.rows);
        const diffs = s.left.map((e, i) => (e === s.right[i] ? -1 : i)).filter((i) => i >= 0);
        expect(diffs).toEqual([s.odd]);
        expect(new Set(s.left).size).toBe(s.left.length);
        if (!p.mayVanish) expect(s.right[s.odd]).not.toBe('');
      }
    }
  });
});
