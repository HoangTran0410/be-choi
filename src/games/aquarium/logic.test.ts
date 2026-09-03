import { describe, it, expect } from 'vitest';
import {
  Creature,
  FOOD_PER_FEED,
  FULL_FOR,
  JOINTS,
  SPECIES,
  decorAt,
  makeDecor,
  makeFood,
  makePlants,
  makeRocks,
  makeTank,
  nearestShelter,
  plantAt,
  pokeDecor,
  settleScenery,
  sheltersFrom,
  speciesById,
  stocking,
  type World,
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
  const run = (creature: Creature, seconds: number, world: World = { foods: [], nudge: null }): void => {
    const rng = mulberry32(7);
    for (let i = 0; i < seconds * 60; i++) creature.update(1 / 60, TANK, world, rng);
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
    for (let i = 0; i < 60 * 8 && !ate; i++) ate = creature.update(1 / 60, TANK, { foods: food, nudge: null }, rng);
    expect(ate).toBe(true);
    expect(food[0]?.eaten).toBe(true);
    expect(creature.joy).toBeGreaterThan(0);
    expect(creature.mood).toBe('excited');
  });

  it('leaves the flakes to the fish: a jellyfish has no mouth for them', () => {
    const jelly = new Creature(speciesById('jelly')!, TANK, mulberry32(2));
    const food = [{ x: jelly.x, y: jelly.y, fall: 0, wobble: 0, eaten: false }];
    const rng = mulberry32(5);
    for (let i = 0; i < 120; i++) expect(jelly.update(1 / 60, TANK, { foods: food, nudge: null }, rng)).toBe(false);
    expect(food[0]?.eaten).toBe(false);
  });

  it('bolts away from a finger that pokes it', () => {
    const creature = new Creature(speciesById('clown')!, TANK, mulberry32(4));
    const poke = { x: creature.x, y: creature.y + TANK.unit };
    creature.startle(poke.x, poke.y);
    const before = Math.hypot(creature.x - poke.x, creature.y - poke.y);
    const rng = mulberry32(9);
    for (let i = 0; i < 30; i++) creature.update(1 / 60, TANK, { foods: [], nudge: null }, rng);
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
      for (let i = 0; i < 90; i++) creature.update(1 / 60, TANK, { foods: [], nudge: finger }, rng);
      return Math.hypot(creature.x - finger.x, creature.y - finger.y);
    };
    expect(measure('guppy')).toBeLessThan(TANK.unit * 1.5);
    expect(measure('puffer')).toBeGreaterThan(TANK.unit * 1.5);
  });
});

describe('how a fish feels', () => {
  const world = (over: Partial<World> = {}): World => ({ foods: [], nudge: null, ...over });

  it('is calm until something happens to it', () => {
    const fish = new Creature(speciesById('goldfish')!, TANK, mulberry32(1));
    expect(fish.mood).toBe('calm');
    expect(fish.hunger).toBe(0);
  });

  it('gets hungry on its own, and a meal settles it again', () => {
    const fish = new Creature(speciesById('goldfish')!, TANK, mulberry32(1));
    const rng = mulberry32(2);
    for (let i = 0; i < FULL_FOR * 60; i++) fish.update(1 / 60, TANK, world(), rng);
    expect(fish.hunger).toBeCloseTo(1, 1);
    expect(fish.mood).toBe('hungry');
    fish.feed();
    expect(fish.hunger).toBe(0);
    expect(fish.mood).toBe('excited');
  });

  it('rises towards the surface when it is hungry, and spreads out again when it is fed', () => {
    const depth = (hunger: number): number => {
      const fish = new Creature(speciesById('goldfish')!, TANK, mulberry32(3));
      fish.hunger = hunger;
      const rng = mulberry32(4);
      let sum = 0;
      let n = 0;
      for (let i = 0; i < 60 * 30; i++) {
        fish.update(1 / 60, TANK, world(), rng);
        // Let it settle before averaging, so the starting position does not count.
        if (i > 60 * 5) {
          sum += fish.y;
          n++;
        }
      }
      return sum / n;
    };
    expect(depth(1)).toBeLessThan(depth(0));
  });

  it('smells a flake from further away when it is hungry', () => {
    const reaches = (hunger: number): boolean => {
      const fish = new Creature(speciesById('goldfish')!, TANK, mulberry32(5));
      fish.x = TANK.w * 0.25;
      fish.y = TANK.h * 0.5;
      fish.hunger = hunger;
      const food = [{ x: TANK.w * 0.25 + TANK.unit * 4.5, y: TANK.h * 0.5, fall: 0, wobble: 0, eaten: false }];
      const rng = mulberry32(6);
      for (let i = 0; i < 60 * 8; i++) if (fish.update(1 / 60, TANK, world({ foods: food }), rng)) return true;
      return false;
    };
    expect(reaches(1)).toBe(true);
    expect(reaches(0)).toBe(false);
  });

  it('hides in the nearest cover when it is badly frightened', () => {
    const plants = makePlants(TANK, mulberry32(7));
    const decor = makeDecor(TANK, mulberry32(8));
    const shelters = sheltersFrom(TANK, plants, decor);
    expect(shelters.length).toBeGreaterThan(4);

    const fish = new Creature(speciesById('clown')!, TANK, mulberry32(9));
    const den = shelters[0]!;
    fish.x = den.x + TANK.unit * 2;
    fish.y = den.y;
    fish.startle(fish.x, fish.y - TANK.unit, true);
    expect(fish.mood).toBe('scared');

    const rng = mulberry32(10);
    for (let i = 0; i < 60 * 2; i++) fish.update(1 / 60, TANK, world({ shelters }), rng);
    const near = nearestShelter(shelters, fish.x, fish.y, TANK);
    expect(near).not.toBeNull();
    expect(Math.hypot(near!.x - fish.x, near!.y - fish.y)).toBeLessThan(near!.r);
    expect(fish.hiding).toBe(true);
  });

  it('comes back out once the fright has passed', () => {
    const shelters = sheltersFrom(TANK, makePlants(TANK, mulberry32(7)), makeDecor(TANK, mulberry32(8)));
    const fish = new Creature(speciesById('clown')!, TANK, mulberry32(9));
    fish.startle(fish.x, fish.y - TANK.unit, true);
    const rng = mulberry32(11);
    for (let i = 0; i < 60 * 8; i++) fish.update(1 / 60, TANK, world({ shelters }), rng);
    expect(fish.fear).toBe(0);
    expect(fish.hiding).toBe(false);
    expect(fish.mood).not.toBe('scared');
  });

  it('goes where the finger goes while it is held, and swims off when it is let go', () => {
    const fish = new Creature(speciesById('goldfish')!, TANK, mulberry32(12));
    const rng = mulberry32(13);
    fish.hold(TANK.w * 0.3, TANK.h * 0.3);
    expect(fish.held).toBe(true);
    for (let i = 0; i < 30; i++) fish.update(1 / 60, TANK, world(), rng);
    // It has not wandered off on its own.
    expect(fish.x).toBe(TANK.w * 0.3);
    expect(fish.y).toBe(TANK.h * 0.3);
    // The body still moves in the child's hand.
    for (const joint of fish.spine.joints) expect(finite(joint.x) && finite(joint.y)).toBe(true);

    fish.release();
    expect(fish.held).toBe(false);
    expect(fish.mood).toBe('excited');
    for (let i = 0; i < 60; i++) fish.update(1 / 60, TANK, world(), rng);
    expect(Math.hypot(fish.x - TANK.w * 0.3, fish.y - TANK.h * 0.3)).toBeGreaterThan(0);
  });

  it('cannot be frightened out of the child\u2019s hand', () => {
    const fish = new Creature(speciesById('goldfish')!, TANK, mulberry32(14));
    fish.hold(TANK.w * 0.5, TANK.h * 0.5);
    fish.startle(TANK.w * 0.5, TANK.h * 0.5, true);
    expect(fish.fear).toBe(0);
    expect(fish.held).toBe(true);
  });

  it('does not get hungry while it is out of the water', () => {
    const fish = new Creature(speciesById('goldfish')!, TANK, mulberry32(15));
    fish.hold(TANK.w * 0.5, TANK.h * 0.5);
    const rng = mulberry32(16);
    for (let i = 0; i < 60 * 30; i++) fish.update(1 / 60, TANK, world(), rng);
    expect(fish.hunger).toBe(0);
  });

  it('sends the nosy ones over to look at whatever was just poked', () => {
    const away = (id: string): number => {
      const fish = new Creature(speciesById(id)!, TANK, mulberry32(17));
      fish.x = TANK.w * 0.2;
      fish.y = TANK.h * 0.5;
      const interest = { x: TANK.w * 0.2 + TANK.unit * 3, y: TANK.h * 0.5, life: 99 };
      const rng = mulberry32(18);
      for (let i = 0; i < 60 * 3; i++) fish.update(1 / 60, TANK, world({ interest }), rng);
      return Math.hypot(fish.x - interest.x, fish.y - interest.y);
    };
    expect(away('guppy')).toBeLessThan(TANK.unit * 2);
  });
});

describe('touching the tank', () => {
  it('finds the ornament and the plant under a finger, and nothing in open water', () => {
    const decor = makeDecor(TANK, mulberry32(1));
    const plants = makePlants(TANK, mulberry32(2));
    const d = decor[0]!;
    expect(decorAt(decor, d.x, TANK.floor - d.size * TANK.unit * 0.4, TANK)).toBe(d);
    expect(decorAt(decor, -TANK.w, 0, TANK)).toBeNull();
    const plant = plants[0]!;
    expect(plantAt(plants, plant.x, TANK.floor - plant.h * 0.3, TANK)).toBe(plant);
    // Well above the tallest blade is water, not weed.
    expect(plantAt(plants, plant.x, 0, TANK)).toBeNull();
  });

  it('makes an ornament react, and the chest stay how it was left', () => {
    const decor = makeDecor(TANK, mulberry32(3));
    const chest = decor.find((d) => d.kind === 'chest')!;
    expect(chest.open).toBe(false);
    pokeDecor(chest);
    expect(chest.poke).toBeGreaterThan(0);
    expect(chest.open).toBe(true);
    pokeDecor(chest);
    expect(chest.open).toBe(false);

    const castle = decor.find((d) => d.kind === 'castle')!;
    pokeDecor(castle);
    expect(castle.poke).toBeGreaterThan(0);
    expect(castle.open).toBe(false);
  });

  it('lets every reaction die away again', () => {
    const decor = makeDecor(TANK, mulberry32(4));
    const plants = makePlants(TANK, mulberry32(5));
    pokeDecor(decor[0]!);
    plants[0]!.shake = 1;
    settleScenery(plants, decor, 99);
    expect(decor[0]!.poke).toBe(0);
    expect(plants[0]!.shake).toBe(0);
    // A chest that was opened stays open: that is the child's doing, not a wobble.
    const chest = decor.find((d) => d.kind === 'chest')!;
    pokeDecor(chest);
    settleScenery(plants, decor, 99);
    expect(chest.open).toBe(true);
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
