import { describe, it, expect } from 'vitest';
import { FX } from '../../core/audio';
import { mulberry32 } from '../../core/dom';
import {
  BITE,
  EGGS_FOR_STAR,
  GRAIN_PER_FEED,
  LAY_MIN_S,
  MAX_EGGS,
  SPECIES,
  TAPS_FOR_STAR,
  hitsAnimal,
  hitsEgg,
  makeAnimals,
  makeGrain,
  makeScenery,
  makeYard,
  nearestGrain,
  onPond,
  pondY,
  roam,
  scaleAt,
  speciesById,
  stepAnimal,
  stocking,
  tickLaying,
  walkFoot,
  type Grain,
} from './logic';

const YARD = makeYard(420, 620);

describe('the animals of the farm', () => {
  it('all have a name, a voice the synth knows and legs to stand on', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (const s of SPECIES) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(FX).toContain(s.voice);
      expect([2, 4]).toContain(s.legs);
      expect(s.size).toBeGreaterThan(0);
      expect(s.speed).toBeGreaterThan(0);
    }
  });

  it('has somebody to lay the eggs and somebody to swim', () => {
    expect(SPECIES.some((s) => s.lays)).toBe(true);
    expect(SPECIES.some((s) => s.swims)).toBe(true);
    expect(speciesById('cow')?.name).toBe('con bò');
    expect(speciesById('nope')).toBeUndefined();
  });

  it('turns out more animals than kinds, so the yard looks busy', () => {
    expect(stocking().length).toBeGreaterThan(SPECIES.length);
  });
});

describe('the yard', () => {
  it('puts the grass under the sky and the pond on the grass', () => {
    expect(YARD.horizon).toBeLessThan(YARD.near);
    expect(YARD.near).toBeLessThan(YARD.h);
    expect(pondY(YARD)).toBeGreaterThan(YARD.horizon);
    expect(onPond(YARD, YARD.pondX, pondY(YARD))).toBe(true);
    expect(onPond(YARD, 0, YARD.near)).toBe(false);
  });

  it('draws whatever is nearer the child bigger', () => {
    expect(scaleAt(YARD, YARD.near)).toBeGreaterThan(scaleAt(YARD, YARD.horizon));
    expect(scaleAt(YARD, YARD.horizon)).toBeGreaterThan(0.5);
  });

  it('fences the whole width and scatters tufts clear of the water', () => {
    const scenery = makeScenery(YARD, mulberry32(3));
    expect(scenery.posts[0]).toBeLessThan(YARD.unit);
    expect(scenery.posts.at(-1)).toBeGreaterThan(YARD.w - YARD.unit);
    expect(scenery.tufts.length).toBeGreaterThan(8);
    for (const tuft of scenery.tufts) expect(onPond(YARD, tuft.x, tuft.y)).toBe(false);
  });
});

describe('where everybody starts', () => {
  it('stands the land animals on the grass and the ducks on the water', () => {
    for (let seed = 1; seed < 12; seed++) {
      for (const animal of makeAnimals(YARD, mulberry32(seed))) {
        expect(onPond(YARD, animal.x, animal.y)).toBe(animal.species.swims);
        expect(animal.x).toBeGreaterThan(0);
        expect(animal.x).toBeLessThan(YARD.w);
        expect(animal.y).toBeGreaterThan(YARD.horizon);
        expect(animal.y).toBeLessThanOrEqual(YARD.near);
      }
    }
  });

  it('only ever sends a duck to the water and everybody else to the grass', () => {
    const rng = mulberry32(5);
    for (const animal of makeAnimals(YARD, mulberry32(2))) {
      for (let i = 0; i < 30; i++) {
        const goal = roam(animal, YARD, rng);
        expect(onPond(YARD, goal.x, goal.y)).toBe(animal.species.swims);
      }
    }
  });
});

describe('walking', () => {
  it('plants the foot for half the stride and swings it for the other half', () => {
    const planted = walkFoot(0.25, 10, 4);
    expect(planted.y).toBe(0);
    const swinging = walkFoot(0.75, 10, 4);
    expect(swinging.y).toBeLessThan(0);
    // The cycle joins up: the end of the swing is where the plant begins.
    expect(walkFoot(0.999, 10, 4).x).toBeCloseTo(walkFoot(0, 10, 4).x, 1);
    expect(walkFoot(0.4999, 10, 4).x).toBeCloseTo(walkFoot(0.5, 10, 4).x, 1);
  });

  it('keeps everybody inside the yard however long they walk', () => {
    const rng = mulberry32(9);
    const animals = makeAnimals(YARD, mulberry32(4));
    for (let i = 0; i < 2000; i++) {
      for (const animal of animals) stepAnimal(animal, 1 / 60, YARD, [], rng);
    }
    for (const animal of animals) {
      expect(animal.x).toBeGreaterThanOrEqual(0);
      expect(animal.x).toBeLessThanOrEqual(YARD.w);
      expect(animal.y).toBeGreaterThan(YARD.horizon);
      expect(animal.y).toBeLessThanOrEqual(YARD.near);
      expect(Number.isFinite(animal.phase)).toBe(true);
    }
  });

  it('walks to the feed and eats it', () => {
    const rng = mulberry32(11);
    const animal = makeAnimals(YARD, mulberry32(1)).find((a) => !a.species.swims)!;
    const grain: Grain = { x: animal.x + YARD.unit * 2, y: animal.y, drop: 0, eaten: false };
    expect(nearestGrain(animal, [grain], YARD)).toBe(grain);
    let ate: Grain | null = null;
    for (let i = 0; i < 600 && !ate; i++) ate = stepAnimal(animal, 1 / 60, YARD, [grain], rng);
    expect(ate).toBe(grain);
    expect(Math.hypot(animal.x - grain.x, animal.y - grain.y)).toBeLessThan(YARD.unit * BITE * 1.5);
  });

  it('leaves feed that is not for it: a duck will not walk onto the grass for a grain', () => {
    const duck = makeAnimals(YARD, mulberry32(1)).find((a) => a.species.swims)!;
    const grain: Grain = { x: YARD.unit * 0.8, y: YARD.near - 1, drop: 0, eaten: false };
    expect(nearestGrain(duck, [grain], YARD)).toBeNull();
  });

  it('ignores feed still in the air, and feed already eaten', () => {
    const animal = makeAnimals(YARD, mulberry32(1)).find((a) => !a.species.swims)!;
    expect(nearestGrain(animal, [{ x: animal.x, y: animal.y, drop: 1, eaten: false }], YARD)).toBeNull();
    expect(nearestGrain(animal, [{ x: animal.x, y: animal.y, drop: 0, eaten: true }], YARD)).toBeNull();
  });
});

describe('feeding and eggs', () => {
  it('scatters feed on the grass, never in the pond', () => {
    const grains = makeGrain(YARD, GRAIN_PER_FEED, mulberry32(6));
    expect(grains.length).toBeGreaterThan(GRAIN_PER_FEED / 2);
    for (const grain of grains) {
      expect(onPond(YARD, grain.x, grain.y)).toBe(false);
      expect(grain.x).toBeGreaterThan(0);
      expect(grain.x).toBeLessThan(YARD.w);
      expect(grain.drop).toBe(1);
    }
  });

  it('lays an egg on a timer, and only hens lay', () => {
    const rng = mulberry32(8);
    const hen = makeAnimals(YARD, mulberry32(1)).find((a) => a.species.lays)!;
    const other = makeAnimals(YARD, mulberry32(1)).find((a) => !a.species.lays)!;
    let egg = null;
    for (let i = 0; i < 60 * 60 && !egg; i++) {
      egg = tickLaying(hen, 1 / 60, [], rng);
      expect(tickLaying(other, 1 / 60, [], rng)).toBeNull();
    }
    expect(egg).not.toBeNull();
    expect(hen.layIn).toBeGreaterThanOrEqual(LAY_MIN_S);
  });

  it('stops laying once the grass is full of eggs', () => {
    const hen = makeAnimals(YARD, mulberry32(1)).find((a) => a.species.lays)!;
    hen.layIn = 0;
    const full = Array.from({ length: MAX_EGGS }, () => ({ x: 0, y: 0, age: 1 }));
    expect(tickLaying(hen, 1 / 60, full)).toBeNull();
  });

  it('awards on a schedule a toddler can reach', () => {
    expect(EGGS_FOR_STAR).toBeGreaterThan(0);
    expect(TAPS_FOR_STAR).toBeGreaterThan(0);
  });
});

describe('a toddler-sized finger', () => {
  it('lands on an animal it is over, and not on one it is nowhere near', () => {
    const animal = makeAnimals(YARD, mulberry32(1))[0]!;
    expect(hitsAnimal(animal, animal.x, animal.y, YARD)).toBe(true);
    expect(hitsAnimal(animal, animal.x + YARD.w, animal.y, YARD)).toBe(false);
  });

  it('picks up an egg it is over', () => {
    const egg = { x: 100, y: 200, age: 1 };
    expect(hitsEgg(egg, 100, 200, YARD)).toBe(true);
    expect(hitsEgg(egg, 100 + YARD.unit, 200, YARD)).toBe(false);
  });
});
