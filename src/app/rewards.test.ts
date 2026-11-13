import { describe, it, expect } from 'vitest';
import { createStore } from './storage';
import { completedSetBy, maybeUnlockSticker, setOf, STARS_PER_STICKER, starsToNext, STICKER_SETS, STICKERS } from './rewards';

function mem(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe('rewards', () => {
  it('has many distinct stickers with names', () => {
    expect(STICKERS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(STICKERS.map((s) => s.emoji)).size).toBe(STICKERS.length);
  });
  it('unlocks one sticker every STARS_PER_STICKER stars, never a duplicate', () => {
    const store = createStore(mem());
    const got: string[] = [];
    for (let i = 1; i <= STARS_PER_STICKER * 5; i++) {
      store.addStar('g');
      const s = maybeUnlockSticker(store, () => 0);
      if (s) got.push(s.emoji);
      else expect(i % STARS_PER_STICKER).not.toBe(0);
    }
    expect(got.length).toBe(5);
    expect(new Set(got).size).toBe(5);
    expect(store.stickers()).toEqual(got);
  });
  it('counts stars to the next sticker', () => {
    expect(starsToNext(0)).toBe(3);
    expect(starsToNext(1)).toBe(2);
    expect(starsToNext(2)).toBe(1);
    expect(starsToNext(3)).toBe(3);
  });
  it('puts every sticker in exactly one themed set', () => {
    const all = STICKER_SETS.flatMap((s) => s.emojis);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(STICKERS.map((s) => s.emoji).sort());
  });
  it('prefers finishing a set the child has started', () => {
    const store = createStore(mem());
    store.addSticker('🐻');
    for (let i = 0; i < 3; i++) store.addStar('g');
    const s = maybeUnlockSticker(store, () => 0.1);
    expect(setOf(s!.emoji)?.id).toBe('forest');
  });
  it('still surprises with other sets sometimes', () => {
    const store = createStore(mem());
    store.addSticker('🐻');
    for (let i = 0; i < 3; i++) store.addStar('g');
    const s = maybeUnlockSticker(store, (() => { const v = [0.9, 0.99]; return () => v.shift() ?? 0; })());
    expect(setOf(s!.emoji)?.id).not.toBe('forest');
  });
  it('knows when a set is complete', () => {
    const food = STICKER_SETS.find((s) => s.id === 'food')!;
    const last = STICKERS.find((s) => s.emoji === food.emojis[3])!;
    expect(completedSetBy(last, food.emojis.slice(0, 3))).toBeNull();
    expect(completedSetBy(last, [...food.emojis])?.id).toBe('food');
  });
});
