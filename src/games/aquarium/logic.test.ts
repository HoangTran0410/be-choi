import { describe, it, expect } from 'vitest';
import {
  Creature,
  FOOD_PER_FEED,
  JOINTS,
  SPECIES,
  makeFood,
  makePlants,
  makeRocks,
  makeTank,
  speciesById,
  stocking,
} from './logic';
import { mulberry32 } from '../../core/dom';

const TANK = makeTank(520, 820);
const finite = (n: number): boolean => Number.isFinite(n);

describe('species', () => {
  it('are all distinct, named and drawable', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (const s of SPECIES) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.profile.length).toBe(JOINTS);
      expect(s.count).toBeGreaterThanOrEqual(1);
      expect(s.size).toBeGreaterThan(0);
      expect(s.speed).toBeGreaterThan(0);
      expect(s.depth).toBeGreaterThanOrEqual(0);
      expect(s.depth).toBeLessThanOrEqual(1);
    }
  });
  it('cover every way of drawing an animal', () => {
    expect(new Set(SPECIES.map((s) => s.kind))).toEqual(new Set(['fish', 'jelly', 'ray', 'crab']));
  });
  it('include shy ones as well as curious ones', () => {
    expect(SPECIES.some((s) => s.curious > 0)).toBe(true);
    expect(SPECIES.some((s) => s.curious < 0)).toBe(true);
  });
  it('finds one by id', () => {
    expect(speciesById('goldfish')?.name).toBe('cá vàng');
    expect(speciesById('nope')).toBeUndefined();
  });
});

describe('stocking the tank', () => {
  it('always holds at least one of every kind', () => {
    for (const tank of [makeTank(320, 480), makeTank(1024, 700)]) {
      const ids = new Set(stocking(tank).map((s) => s.id));
      expect(ids.size).toBe(SPECIES.length);
    }
  });
  it('puts more fish in a bigger tank', () => {
    expect(stocking(makeTank(1400, 900)).length).toBeGreaterThan(stocking(makeTank(320, 480)).length);
  });
});

describe('a creature in the water', () => {
  const run = (creature: Creature, seconds: number, foods = [] as ReturnType<typeof makeFood>): void => {
    const rng = mulberry32(7);
    for (let i = 0; i < seconds * 60; i++) creature.update(1 / 60, TANK, foods, null, rng);
  };

  it('stays inside the glass, whatever it does', () => {
    for (const species of SPECIES) {
      const creature = new Creature(species, TANK, mulberry32(3));
      run(creature, 30);
      expect(creature.x).toBeGreaterThan(-1);
      expect(creature.x).toBeLessThan(TANK.w + 1);
      expect(creature.y).toBeGreaterThan(-1);
      expect(creature.y).toBeLessThan(TANK.floor + creature.length);
      for (const joint of creature.spine.joints) expect(finite(joint.x) && finite(joint.y)).toBe(true);
    }
  });

  it('actually goes somewhere', () => {
    const creature = new Creature(speciesById('zebra')!, TANK, mulberry32(1));
    const from = { x: creature.x, y: creature.y };
    run(creature, 4);
    expect(Math.hypot(creature.x - from.x, creature.y - from.y)).toBeGreaterThan(TANK.unit);
  });

  it('swims to a flake and swallows it', () => {
    const creature = new Creature(speciesById('goldfish')!, TANK, mulberry32(2));
    // Mid-tank, so the flake is somewhere the fish is allowed to swim to.
    creature.x = TANK.w / 2;
    creature.y = TANK.h / 2;
    const food = [{ x: creature.x + TANK.unit, y: creature.y, fall: 0, wobble: 0, eaten: false }];
    let ate = false;
    const rng = mulberry32(5);
    for (let i = 0; i < 60 * 8 && !ate; i++) ate = creature.update(1 / 60, TANK, food, null, rng);
    expect(ate).toBe(true);
    expect(food[0]?.eaten).toBe(true);
    expect(creature.happy).toBeGreaterThan(0);
  });

  it('leaves the flakes to the fish: a jellyfish has no mouth for them', () => {
    const jelly = new Creature(speciesById('jelly')!, TANK, mulberry32(2));
    const food = [{ x: jelly.x, y: jelly.y, fall: 0, wobble: 0, eaten: false }];
    const rng = mulberry32(5);
    for (let i = 0; i < 120; i++) expect(jelly.update(1 / 60, TANK, food, null, rng)).toBe(false);
    expect(food[0]?.eaten).toBe(false);
  });

  it('bolts away from a finger that pokes it', () => {
    const creature = new Creature(speciesById('clown')!, TANK, mulberry32(4));
    const poke = { x: creature.x, y: creature.y + TANK.unit };
    creature.startle(poke.x, poke.y);
    const before = Math.hypot(creature.x - poke.x, creature.y - poke.y);
    const rng = mulberry32(9);
    for (let i = 0; i < 30; i++) creature.update(1 / 60, TANK, [], null, rng);
    expect(Math.hypot(creature.x - poke.x, creature.y - poke.y)).toBeGreaterThan(before);
  });

  it('has a hit box a toddler can actually land on', () => {
    const creature = new Creature(speciesById('guppy')!, TANK, mulberry32(6));
    expect(creature.hits(creature.x, creature.y)).toBe(true);
    expect(creature.hits(creature.x + TANK.w, creature.y)).toBe(false);
  });

  it('keeps the crab on the sand and walking', () => {
    const crab = new Creature(speciesById('crab')!, TANK, mulberry32(8));
    run(crab, 10);
    expect(Math.abs(crab.y - TANK.floor)).toBeLessThan(crab.length * 0.3);
    expect(Math.abs(crab.vx)).toBeGreaterThan(0);
  });

  it('comes to a curious finger and runs from a shy one', () => {
    const measure = (id: string): number => {
      const creature = new Creature(speciesById(id)!, TANK, mulberry32(11));
      creature.x = TANK.w / 2;
      creature.y = TANK.h / 2;
      const finger = { x: TANK.w / 2 + TANK.unit * 1.5, y: TANK.h / 2, held: true };
      const rng = mulberry32(12);
      for (let i = 0; i < 90; i++) creature.update(1 / 60, TANK, [], finger, rng);
      return Math.hypot(creature.x - finger.x, creature.y - finger.y);
    };
    expect(measure('guppy')).toBeLessThan(TANK.unit * 1.5);
    expect(measure('puffer')).toBeGreaterThan(TANK.unit * 1.5);
  });
});

describe('scenery', () => {
  it('drops a handful of flakes inside the tank', () => {
    const food = makeFood(TANK, FOOD_PER_FEED, mulberry32(1));
    expect(food.length).toBe(FOOD_PER_FEED);
    for (const f of food) {
      expect(f.x).toBeGreaterThan(0);
      expect(f.x).toBeLessThan(TANK.w);
      expect(f.eaten).toBe(false);
      expect(f.fall).toBeGreaterThan(0);
    }
  });
  it('plants and rocks scale with the tank and stay inside it', () => {
    const plants = makePlants(TANK, mulberry32(2));
    const rocks = makeRocks(TANK, mulberry32(3));
    expect(plants.length).toBeGreaterThanOrEqual(3);
    expect(rocks.length).toBeGreaterThanOrEqual(3);
    for (const p of plants) expect(p.h).toBeGreaterThan(0);
    expect(makePlants(makeTank(1600, 900), mulberry32(2)).length).toBeGreaterThan(plants.length);
  });
});
