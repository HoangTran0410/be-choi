import { describe, it, expect } from 'vitest';
import {
  BUG_NAMES,
  DAY_SECONDS,
  GROW_RATE,
  HARVEST_FOR_STAR,
  SEEDS,
  WATER_STEPS,
  actionFor,
  harvest,
  isEmpty,
  isRipe,
  makeBugs,
  makeClouds,
  makeField,
  makePlots,
  makeTufts,
  plant,
  plotCount,
  seedById,
  settle,
  stepBug,
  water,
  daylight,
  dayPhase,
  hitsBug,
  shooBug,
  skyBody,
  skyStops,
} from './logic';
import { mulberry32 } from '../../core/dom';

const FIELD = makeField(420, 620);
const first = (): ReturnType<typeof makePlots>[number] => makePlots(4, mulberry32(1))[0]!;

describe('seeds', () => {
  it('are all distinct, named and drawable', () => {
    expect(SEEDS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(SEEDS.map((s) => s.id)).size).toBe(SEEDS.length);
    for (const seed of SEEDS) {
      expect(seed.name.length).toBeGreaterThan(0);
      expect(seed.ripe.length).toBeGreaterThan(0);
      expect(seed.height).toBeGreaterThan(0);
      // A flower needs petals to open; a fruit needs fruit to hang.
      if (seed.kind === 'flower') expect(seed.petals).toBeGreaterThan(2);
      else expect(seed.fruits).toBeGreaterThan(0);
    }
  });
  it('cover flowers, fruit and roots', () => {
    expect(new Set(SEEDS.map((s) => s.kind))).toEqual(new Set(['flower', 'fruit', 'root']));
  });
  it('finds one by id', () => {
    expect(seedById('sunflower')?.name).toBe('hoa hướng dương');
    expect(seedById('nope')).toBeUndefined();
  });
});

describe('a plot', () => {
  it('goes plant, water, water… harvest and back to bare soil', () => {
    const plot = first();
    const seed = SEEDS[0]!;
    expect(isEmpty(plot)).toBe(true);
    expect(actionFor(plot)).toBe('plant');

    plant(plot, seed);
    expect(isEmpty(plot)).toBe(false);
    expect(actionFor(plot)).toBe('water');

    for (let i = 1; i < WATER_STEPS; i++) {
      expect(water(plot)).toBe(false);
      expect(actionFor(plot)).toBe('water');
    }
    // The last drink is the one that finishes it.
    expect(water(plot)).toBe(true);
    expect(isRipe(plot)).toBe(true);
    expect(actionFor(plot)).toBe('harvest');

    expect(harvest(plot)).toBe(seed);
    expect(isEmpty(plot)).toBe(true);
    expect(plot.water).toBe(0);
  });

  it('cannot be watered when there is nothing in it, or once it is ready', () => {
    const plot = first();
    expect(water(plot)).toBe(false);
    plant(plot, SEEDS[1]!);
    for (let i = 0; i < WATER_STEPS; i++) water(plot);
    expect(water(plot)).toBe(false);
    expect(plot.water).toBe(WATER_STEPS);
  });

  it('gives nothing up before it is ready', () => {
    const plot = first();
    expect(harvest(plot)).toBeNull();
    plant(plot, SEEDS[2]!);
    water(plot);
    expect(harvest(plot)).toBeNull();
    expect(isEmpty(plot)).toBe(false);
  });

  it('grows towards the drinks it has had rather than jumping', () => {
    const plot = first();
    plant(plot, SEEDS[0]!);
    water(plot);
    expect(plot.grown).toBe(0);
    settle(plot, 1 / 60);
    expect(plot.grown).toBeGreaterThan(0);
    expect(plot.grown).toBeLessThan(1 / WATER_STEPS);
    for (let i = 0; i < 600; i++) settle(plot, 1 / 60);
    expect(plot.grown).toBeCloseTo(1 / WATER_STEPS, 2);
    expect(GROW_RATE).toBeGreaterThan(0);
  });

  it('runs the watering can down and stops', () => {
    const plot = first();
    plant(plot, SEEDS[0]!);
    water(plot);
    expect(plot.watering).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) settle(plot, 1 / 60);
    expect(plot.watering).toBe(0);
  });

  it('lays the beds out across the field, inside it and apart', () => {
    for (const n of [3, 4, 6]) {
      const plots = makePlots(n, mulberry32(2));
      expect(plots.length).toBe(n);
      for (const plot of plots) {
        expect(plot.at).toBeGreaterThan(0.05);
        expect(plot.at).toBeLessThan(0.95);
      }
      for (let i = 1; i < n; i++) expect(plots[i]!.at).toBeGreaterThan(plots[i - 1]!.at);
    }
  });

  it('fits fewer beds on a narrow screen, and never fewer than three', () => {
    expect(plotCount(320, 49)).toBeLessThan(plotCount(1200, 95));
    expect(plotCount(200, 60)).toBe(3);
    expect(plotCount(4000, 60)).toBe(6);
  });

  it('awards on a schedule the child can reach', () => {
    expect(HARVEST_FOR_STAR).toBeGreaterThan(0);
    expect(WATER_STEPS).toBeGreaterThan(1);
  });
});

describe('the insects', () => {
  it('brings a butterfly, a bee and a ladybug', () => {
    const kinds = makeBugs(FIELD, mulberry32(1)).map((b) => b.kind);
    expect(new Set(kinds)).toEqual(new Set(['butterfly', 'bee', 'ladybug']));
  });

  it('keeps the ladybug on the ground and walking', () => {
    const bug = makeBugs(FIELD, mulberry32(1)).find((b) => b.kind === 'ladybug')!;
    const rng = mulberry32(3);
    for (let i = 0; i < 600; i++) stepBug(bug, 1 / 60, FIELD, [], rng);
    expect(bug.y).toBeGreaterThan(FIELD.ground);
    expect(bug.x).toBeGreaterThan(0);
    expect(bug.x).toBeLessThan(FIELD.w);
    expect(Math.abs(bug.vx)).toBeGreaterThan(0);
  });

  it('keeps the fliers in the air above the soil', () => {
    const rng = mulberry32(4);
    for (const bug of makeBugs(FIELD, mulberry32(2)).filter((b) => b.kind !== 'ladybug')) {
      for (let i = 0; i < 900; i++) stepBug(bug, 1 / 60, FIELD, [], rng);
      expect(bug.x).toBeGreaterThanOrEqual(0);
      expect(bug.x).toBeLessThanOrEqual(FIELD.w);
      expect(bug.y).toBeLessThan(FIELD.ground);
      expect(Number.isFinite(bug.y)).toBe(true);
    }
  });

  it('works an open flower when there is one', () => {
    const bug = makeBugs(FIELD, mulberry32(5)).find((b) => b.kind === 'bee')!;
    const flower = { x: FIELD.w * 0.5, y: FIELD.ground - FIELD.unit * 2 };
    const rng = mulberry32(6);
    let closest = Infinity;
    for (let i = 0; i < 900; i++) {
      stepBug(bug, 1 / 60, FIELD, [flower], rng);
      closest = Math.min(closest, Math.hypot(bug.x - flower.x, bug.y - flower.y));
    }
    expect(closest).toBeLessThan(FIELD.unit);
  });
});

describe('scenery', () => {
  it('scales with the field', () => {
    expect(makeClouds(FIELD, mulberry32(1)).length).toBeGreaterThanOrEqual(2);
    expect(makeTufts(FIELD, mulberry32(1)).length).toBeGreaterThanOrEqual(8);
    expect(makeTufts(makeField(1600, 900), mulberry32(1)).length).toBeGreaterThan(makeTufts(FIELD, mulberry32(1)).length);
  });
  it('puts the soil below the sky and sizes a unit off the short side', () => {
    expect(FIELD.ground).toBeGreaterThan(FIELD.h * 0.5);
    expect(FIELD.ground).toBeLessThan(FIELD.h);
    expect(FIELD.unit).toBeCloseTo(420 / 6.5);
  });
});

describe('the day going round', () => {
  it('is light in the middle of the day and dark in the middle of the night', () => {
    const noon = DAY_SECONDS * 0.15;
    const midnight = DAY_SECONDS * 0.6;
    expect(daylight(noon)).toBe(1);
    expect(daylight(midnight)).toBe(0);
  });

  it('fades between the two rather than switching', () => {
    let sawDusk = false;
    for (let t = 0; t < DAY_SECONDS; t += DAY_SECONDS / 400) {
      const light = daylight(t);
      expect(light).toBeGreaterThanOrEqual(0);
      expect(light).toBeLessThanOrEqual(1);
      if (light > 0.15 && light < 0.85) sawDusk = true;
    }
    expect(sawDusk).toBe(true);
  });

  it('comes back round to where it started', () => {
    expect(dayPhase(0)).toBeCloseTo(dayPhase(DAY_SECONDS), 5);
    expect(daylight(0)).toBeCloseTo(daylight(DAY_SECONDS), 5);
  });

  it('always has three sky colours to draw with', () => {
    for (let t = 0; t < DAY_SECONDS; t += DAY_SECONDS / 60) {
      const stops = skyStops(t);
      expect(stops.length).toBe(3);
      for (const colour of stops) expect(colour).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    }
  });

  it('walks the sun and then the moon across the sky, above the ground', () => {
    let sun = 0;
    let moon = 0;
    for (let t = 0; t < DAY_SECONDS; t += DAY_SECONDS / 120) {
      const body = skyBody(t, FIELD);
      expect(body.y).toBeLessThan(FIELD.ground);
      expect(body.x).toBeGreaterThan(0);
      expect(body.x).toBeLessThan(FIELD.w);
      if (body.moon) moon++;
      else sun++;
    }
    expect(sun).toBeGreaterThan(10);
    expect(moon).toBeGreaterThan(10);
  });
});

describe('shooing an insect', () => {
  it('names every kind', () => {
    for (const bug of makeBugs(FIELD, mulberry32(1))) expect(BUG_NAMES[bug.kind].length).toBeGreaterThan(0);
  });

  it('has a hit box a toddler can land on, and only over itself', () => {
    const bug = makeBugs(FIELD, mulberry32(1))[0]!;
    expect(hitsBug(bug, bug.x, bug.y, FIELD)).toBe(true);
    expect(hitsBug(bug, bug.x + FIELD.w, bug.y, FIELD)).toBe(false);
  });

  it('sends a flier away from the finger, and hurries it along', () => {
    const bug = makeBugs(FIELD, mulberry32(2)).find((b) => b.kind === 'butterfly')!;
    bug.x = FIELD.w / 2;
    bug.y = FIELD.ground * 0.5;
    const finger = { x: bug.x + FIELD.unit * 0.2, y: bug.y };
    const before = Math.hypot(bug.x - finger.x, bug.y - finger.y);
    shooBug(bug, finger.x, finger.y, FIELD);
    expect(bug.dash).toBeGreaterThan(0);
    const rng = mulberry32(3);
    for (let i = 0; i < 40; i++) stepBug(bug, 1 / 60, FIELD, [], rng);
    expect(Math.hypot(bug.x - finger.x, bug.y - finger.y)).toBeGreaterThan(before);
  });

  it('sends the ladybug scuttling the other way', () => {
    const bug = makeBugs(FIELD, mulberry32(4)).find((b) => b.kind === 'ladybug')!;
    bug.x = FIELD.w / 2;
    shooBug(bug, bug.x + 10, bug.y, FIELD);
    expect(bug.vx).toBeLessThan(0);
    expect(bug.dash).toBeGreaterThan(0);
  });
});
