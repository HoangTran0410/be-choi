import { describe, expect, it } from 'vitest';
import {
  actionFor,
  CROPS,
  cropById,
  cropsAt,
  emptyPlot,
  growthRate,
  harvest,
  isRipe,
  isThirsty,
  plant,
  plotCountFor,
  plotEmoji,
  rain,
  RIPE,
  tickPlot,
  water,
} from './crops';

const carrot = cropById('carrot')!;

/** Water and grow a plot all the way to ripe in full sun. */
function growUp(p = emptyPlot()) {
  plant(p, carrot);
  for (let i = 0; i < RIPE; i++) {
    expect(water(p)).toBe(true);
    expect(tickPlot(p, carrot.stageSec + 0.1, 1)).toBe(true);
  }
  return p;
}

describe('crops', () => {
  it('has unique crops, three to start and more arriving later', () => {
    expect(new Set(CROPS.map((c) => c.id)).size).toBe(CROPS.length);
    expect(cropsAt(1).length).toBe(3);
    expect(cropsAt(7).length).toBe(CROPS.length);
    expect(CROPS.every((c) => c.yield >= 1 && c.stageSec > 0)).toBe(true);
  });

  it('grows seed -> sprout -> plant -> ripe, one drink per step, in that order', () => {
    const p = emptyPlot();
    expect(actionFor(p)).toBe('plant');
    plant(p, carrot);
    const seen = [plotEmoji(p)];
    expect(isThirsty(p)).toBe(true);
    for (let i = 0; i < RIPE; i++) {
      expect(actionFor(p)).toBe('water');
      water(p);
      expect(actionFor(p)).toBe('wait');
      tickPlot(p, 100, 1);
      seen.push(plotEmoji(p));
    }
    expect(seen).toEqual(['🟤', '🌱', '🌿', '🥕']);
    expect(isRipe(p)).toBe(true);
    expect(actionFor(p)).toBe('harvest');
  });

  it('does not grow without water, and never withers however long it waits', () => {
    const p = emptyPlot();
    plant(p, carrot);
    expect(tickPlot(p, 10_000, 1)).toBe(false);
    expect(p.stage).toBe(0);
    expect(p.crop).toBe('carrot');
    expect(water(p)).toBe(true);
    expect(water(p)).toBe(false); // already drunk
  });

  it('harvests the crop yield and leaves bare soil; a ripe plot waits forever', () => {
    const p = growUp();
    tickPlot(p, 10_000, 1);
    expect(isRipe(p)).toBe(true);
    expect(harvest(p)).toEqual({ crop: carrot, n: carrot.yield });
    expect(p).toEqual(emptyPlot());
    expect(harvest(p)).toBeNull();
  });

  it('only plants on bare soil', () => {
    const p = emptyPlot();
    expect(plant(p, carrot)).toBe(true);
    expect(plant(p, cropById('corn')!)).toBe(false);
    expect(p.crop).toBe('carrot');
  });

  it('grows slower at night but never stops, and faster in the rain', () => {
    expect(growthRate(0, false)).toBeGreaterThan(0.3);
    expect(growthRate(1, false)).toBe(1);
    expect(growthRate(0, false)).toBeLessThan(growthRate(1, false));
    expect(growthRate(1, true)).toBeGreaterThan(growthRate(1, false));
    expect(growthRate(5, false)).toBe(1);
    const slow = emptyPlot();
    plant(slow, carrot);
    water(slow);
    tickPlot(slow, carrot.stageSec, growthRate(0, false));
    expect(slow.stage).toBe(0);
    expect(slow.prog).toBeGreaterThan(0.3);
  });

  it('rain waters every thirsty plot and nothing else', () => {
    const a = emptyPlot();
    const b = emptyPlot();
    const c = emptyPlot();
    plant(a, carrot);
    plant(b, carrot);
    water(b);
    expect(rain([a, b, c])).toBe(1);
    expect(a.wet && b.wet).toBe(true);
    expect(c.wet).toBe(false);
    expect(rain([a, b, c])).toBe(0);
  });

  it('adds plots as the farm grows', () => {
    expect(plotCountFor(1)).toBe(6);
    expect(plotCountFor(7)).toBe(12);
    for (let l = 2; l <= 7; l++) expect(plotCountFor(l)).toBeGreaterThanOrEqual(plotCountFor(l - 1));
  });
});
