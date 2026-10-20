import { describe, expect, it } from 'vitest';
import { cropById } from './crops';
import { CHEW_SEC, collect, feed, makePen, pickFood, SPECIES, speciesAt, speciesById, syncPens, tickPen, wantedCrop } from './animals';
import { itemById } from './orders';

const hen = speciesById('chicken')!;

describe('animals', () => {
  it('starts with a hen and a cow, the rest move in as the farm grows', () => {
    expect(speciesAt(1).map((s) => s.id)).toEqual(['chicken', 'cow']);
    expect(speciesAt(7).length).toBe(SPECIES.length);
  });

  it('every animal likes crops that exist, can be fed one it has seeds for, and gives a known item', () => {
    for (const s of SPECIES) {
      expect(
        s.likes.every((id) => !!cropById(id)),
        s.id,
      ).toBe(true);
      expect(cropById(wantedCrop(s, s.level))!.level, s.id).toBeLessThanOrEqual(s.level);
      if (s.product) expect(itemById(s.product), s.id).toBeDefined();
    }
  });

  it('runs hungry -> chewing -> ready -> hungry, and can always be fed again', () => {
    const pen = makePen('chicken');
    expect(feed(pen, hen, 'corn')).toBe('liked');
    expect(pen.phase).toBe('chewing');
    expect(feed(pen, hen, 'corn')).toBe('full');
    expect(tickPen(pen, CHEW_SEC - 1)).toBe(false);
    expect(tickPen(pen, 2)).toBe(true);
    expect(pen.phase).toBe('ready');
    expect(collect(pen, hen)).toBe('egg');
    expect(pen.phase).toBe('hungry');
    expect(collect(pen, hen)).toBeNull();
  });

  it('takes two helpings of something it does not love, and never refuses', () => {
    const pen = makePen('chicken');
    expect(feed(pen, hen, 'carrot')).toBe('ate');
    expect(pen.phase).toBe('hungry');
    expect(feed(pen, hen, 'carrot')).toBe('ate');
    expect(pen.phase).toBe('chewing');
  });

  it('animals with nothing to give give love', () => {
    const pig = speciesById('pig')!;
    const pen = makePen('pig');
    feed(pen, pig, 'tomato');
    tickPen(pen, 100);
    expect(collect(pen, pig)).toBe('love');
  });

  it('picks food they love first, else the most plentiful crop, else nothing', () => {
    expect(pickFood(hen, { carrot: 5, corn: 1 })).toBe('corn');
    expect(pickFood(hen, { carrot: 5, broccoli: 2 })).toBe('carrot');
    expect(pickFood(hen, { egg: 3 })).toBeNull();
    expect(pickFood(hen, {})).toBeNull();
  });

  it('keeps existing pens when new animals move in', () => {
    const pens = syncPens([], 1);
    pens[0]!.phase = 'ready';
    const more = syncPens(pens, 3);
    expect(more.map((p) => p.id)).toEqual(['chicken', 'cow', 'pig', 'duck']);
    expect(more[0]!.phase).toBe('ready');
  });
});
