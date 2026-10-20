import { describe, expect, it } from 'vitest';
import { plotCountFor } from './crops';
import { speciesAt } from './animals';
import {
  addStock,
  gainXp,
  LEVEL_XP,
  levelFor,
  levelProgress,
  loadFarm,
  MAX_LEVEL,
  newState,
  SAVE_KEY,
  saveFarm,
  stockOf,
  takeStock,
  unlocksAt,
} from './progress';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

describe('progress', () => {
  it('levels climb with xp and stop at the top', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(LEVEL_XP[1]! - 1)).toBe(1);
    expect(levelFor(LEVEL_XP[1]!)).toBe(2);
    expect(levelFor(1e6)).toBe(MAX_LEVEL);
    expect(levelProgress(0)).toBe(0);
    expect(levelProgress(1e6)).toBe(1);
  });

  it('a new farm has a first meal in the basket, six plots and two animals', () => {
    const s = newState();
    expect(s.plots.length).toBe(6);
    expect(s.pens.length).toBe(speciesAt(1).length);
    expect(stockOf(s, 'carrot')).toBeGreaterThan(0);
  });

  it('every level above the first brings something new to see', () => {
    for (let l = 2; l <= MAX_LEVEL; l++) expect(unlocksAt(l).length, `level ${l}`).toBeGreaterThan(0);
    expect(
      unlocksAt(2)
        .map((u) => u.kind)
        .sort(),
    ).toEqual(['animal', 'crop']);
  });

  it('gaining xp across a level adds plots and animals and reports the new level once', () => {
    const s = newState();
    expect(gainXp(s, 1)).toBeNull();
    expect(gainXp(s, LEVEL_XP[2]!)).toBe(3);
    expect(s.plots.length).toBe(plotCountFor(3));
    expect(s.pens.length).toBe(speciesAt(3).length);
    expect(gainXp(s, 1)).toBeNull();
  });

  it('the basket never goes below zero', () => {
    const s = newState();
    s.stock = {};
    expect(takeStock(s, 'egg')).toBe(false);
    addStock(s, 'egg', 2);
    expect(takeStock(s, 'egg')).toBe(true);
    expect(stockOf(s, 'egg')).toBe(1);
  });

  it('saves with a version and reads it back, including a half-grown plot and an order', () => {
    const store = memory();
    const s = newState();
    s.xp = 20;
    s.clock = 123.5;
    s.plots = [{ crop: 'carrot', stage: 1, wet: true, prog: 0.4 }, ...s.plots.slice(1)];
    s.order = { shopper: 3, photo: true, wants: [{ item: 'egg', n: 2, got: 1 }] };
    expect(saveFarm(s, store)).toBe(true);
    expect(JSON.parse(store.data[SAVE_KEY]!).v).toBe(1);
    const back = loadFarm(store);
    expect(back.xp).toBe(20);
    expect(back.clock).toBe(123.5);
    expect(back.plots[0]).toEqual({ crop: 'carrot', stage: 1, wet: true, prog: 0.4 });
    expect(back.order).toEqual(s.order);
    expect(back.plots.length).toBeGreaterThanOrEqual(plotCountFor(levelFor(20)));
  });

  it('a missing, corrupt or future save gives a fresh farm instead of an error', () => {
    expect(loadFarm(memory()).xp).toBe(0);
    expect(loadFarm(memory({ [SAVE_KEY]: '{nope' })).xp).toBe(0);
    expect(loadFarm(memory({ [SAVE_KEY]: JSON.stringify({ v: 99, xp: 500 }) })).xp).toBe(0);
    expect(loadFarm(null).plots.length).toBe(6);
  });

  it('cleans nonsense piece by piece and keeps the rest', () => {
    const raw = {
      v: 1,
      xp: 33,
      stock: { carrot: 3, ghost: 9, egg: -4 },
      plots: [{ crop: 'unicorn', stage: 2 }, { crop: 'corn', stage: 99, wet: true }, 'x'],
      pens: [{ id: 'chicken', phase: 'ready' }, { id: 'dragon' }],
      order: { wants: [{ item: 'zzz', n: 1 }] },
    };
    const s = loadFarm(memory({ [SAVE_KEY]: JSON.stringify(raw) }));
    expect(s.stock).toEqual({ carrot: 3, egg: 0 });
    expect(s.plots[0]).toEqual({ crop: null, stage: 0, wet: false, prog: 0 });
    expect(s.plots[1]!.crop).toBe('corn');
    expect(s.plots[1]!.stage).toBe(3);
    expect(s.plots[1]!.wet).toBe(false);
    expect(s.pens.find((p) => p.id === 'chicken')!.phase).toBe('ready');
    expect(s.pens.some((p) => p.id === 'dragon')).toBe(false);
    expect(s.order).toBeNull();
  });

  it('a save written before versions existed (no v) still loads', () => {
    const s = loadFarm(memory({ [SAVE_KEY]: JSON.stringify({ xp: 10, stock: { milk: 2 } }) }));
    expect(s.xp).toBe(10);
    expect(stockOf(s, 'milk')).toBe(2);
  });
});
