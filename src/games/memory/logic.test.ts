import { describe, it, expect } from 'vitest';
import { FLIP_BACK_MS, isMatch, makeDeck, pairCount } from './logic';
import { mulberry32 } from '../../core/dom';

describe('memory logic', () => {
  it('pair count grows 2 → 3 → 4', () => {
    expect(pairCount(0)).toBe(2);
    expect(pairCount(1)).toBe(2);
    expect(pairCount(2)).toBe(3);
    expect(pairCount(3)).toBe(3);
    expect(pairCount(4)).toBe(4);
    expect(pairCount(20)).toBe(4);
  });
  it('deck has 2*pairs cards, each emoji exactly twice, unique ids', () => {
    const deck = makeDeck(3, mulberry32(11));
    expect(deck.length).toBe(6);
    const counts = new Map<string, number>();
    for (const c of deck) counts.set(c.item.emoji, (counts.get(c.item.emoji) ?? 0) + 1);
    expect(counts.size).toBe(3);
    for (const n of counts.values()) expect(n).toBe(2);
    expect(new Set(deck.map((c) => c.id)).size).toBe(6);
    expect([...deck.map((c) => c.id)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('deck is shuffled deterministically by rng', () => {
    const a = makeDeck(4, mulberry32(5)).map((c) => c.item.emoji);
    const b = makeDeck(4, mulberry32(5)).map((c) => c.item.emoji);
    expect(a).toEqual(b);
  });
  it('matches by emoji, never a card with itself', () => {
    const dog = { emoji: '🐶', name: 'con chó' };
    const cat = { emoji: '🐱', name: 'con mèo' };
    expect(isMatch({ id: 0, item: dog }, { id: 3, item: dog })).toBe(true);
    expect(isMatch({ id: 0, item: dog }, { id: 0, item: dog })).toBe(false);
    expect(isMatch({ id: 0, item: dog }, { id: 1, item: cat })).toBe(false);
  });
  it('flips back after 800 ms', () => {
    expect(FLIP_BACK_MS).toBe(800);
  });
});
