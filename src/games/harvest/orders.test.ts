import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { give, isDone, itemById, ITEMS, itemsAt, makeOrder, missingPieces, orderPhrase, orderSize, remaining } from './orders';

describe('orders', () => {
  it('has unique items and only offers what the farm can make', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(itemsAt(1).map((i) => i.id)).toEqual(['carrot', 'corn', 'tomato', 'egg', 'milk']);
    expect(itemsAt(7).length).toBe(ITEMS.length);
  });

  it('starts easy (one thing, one or two) and asks for more as the farm grows', () => {
    expect(orderSize(1)).toEqual({ kinds: 1, most: 2 });
    expect(orderSize(3).kinds).toBe(2);
    expect(orderSize(5)).toEqual({ kinds: 3, most: 4 });
  });

  it('only asks for things that exist at that level, never twice for one thing, and numbers stay in range', () => {
    for (let level = 1; level <= 7; level++) {
      const rng = mulberry32(level * 31);
      const have = new Set(itemsAt(level).map((i) => i.id));
      const { kinds, most } = orderSize(level);
      for (let k = 0; k < 40; k++) {
        const o = makeOrder(level, { rng });
        expect(o.wants.length).toBeGreaterThanOrEqual(1);
        expect(o.wants.length).toBeLessThanOrEqual(kinds);
        expect(new Set(o.wants.map((w) => w.item)).size).toBe(o.wants.length);
        for (const w of o.wants) {
          expect(have.has(w.item)).toBe(true);
          expect(w.n).toBeGreaterThanOrEqual(1);
          expect(w.n).toBeLessThanOrEqual(most);
          expect(w.got).toBe(0);
        }
      }
    }
  });

  it('does not ask for exactly what the last customer asked for, and brings a different face', () => {
    const rng = mulberry32(5);
    let prev = makeOrder(1, { rng });
    for (let k = 0; k < 30; k++) {
      const next = makeOrder(1, { rng, prev });
      expect(next.wants[0]!.item).not.toBe(prev.wants[0]!.item);
      expect(next.shopper).not.toBe(prev.shopper);
      prev = next;
    }
  });

  it('counts deliveries, refuses what is not wanted without harm, and finishes when everything is there', () => {
    const o = {
      shopper: 0,
      photo: false,
      wants: [
        { item: 'carrot', n: 2, got: 0 },
        { item: 'egg', n: 1, got: 0 },
      ],
    };
    expect(give(o, 'milk')).toBe(false);
    expect(remaining(o, 'carrot')).toBe(2);
    expect(give(o, 'carrot')).toBe(true);
    expect(remaining(o, 'carrot')).toBe(1);
    expect(missingPieces(o).sort()).toEqual(['carrot', 'egg']);
    give(o, 'carrot');
    expect(give(o, 'carrot')).toBe(false); // enough already
    expect(isDone(o)).toBe(false);
    give(o, 'egg');
    expect(isDone(o)).toBe(true);
  });

  it('says the order slowly, in short phrases, with the count first', () => {
    const o = {
      shopper: 0,
      photo: false,
      wants: [
        { item: 'carrot', n: 2, got: 0 },
        { item: 'egg', n: 1, got: 0 },
      ],
    };
    expect(orderPhrase(o, 'Gấu')).toBe('Gấu muốn, hai, cà rốt, và, một, trứng.');
    o.wants[0]!.got = 2;
    expect(orderPhrase(o, 'Gấu')).toBe('Gấu muốn, một, trứng.');
    o.wants[1]!.got = 1;
    expect(orderPhrase(o, 'Gấu')).toContain('cảm ơn');
    expect(itemById('egg')!.emoji).toBe('🥚');
  });
});
