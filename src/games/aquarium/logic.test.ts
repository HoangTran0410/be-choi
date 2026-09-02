import { describe, it, expect } from 'vitest';
import {
  BEND,
  Creature,
  FOOD_PER_FEED,
  JOINTS,
  SPECIES,
  Spine,
  angleDelta,
  constrainAngle,
  makeFood,
  makePlants,
  makeRocks,
  makeTank,
  solveTwoBone,
  speciesById,
  stocking,
} from './logic';
import { mulberry32 } from '../../core/dom';

const TANK = makeTank(520, 820);
const finite = (n: number): boolean => Number.isFinite(n);

describe('angles', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5);
    expect(angleDelta(0.2, -0.2)).toBeCloseTo(-0.4);
    // Just past π the short way is backwards, not almost all the way round.
    expect(angleDelta(0, Math.PI + 0.2)).toBeCloseTo(-Math.PI + 0.2);
  });
  it('holds an angle within a limit of its anchor', () => {
    expect(constrainAngle(0.1, 0, 0.5)).toBeCloseTo(0.1);
    expect(constrainAngle(2, 0, 0.5)).toBeCloseTo(0.5);
    expect(constrainAngle(-2, 0, 0.5)).toBeCloseTo(-0.5);
  });
});

describe('spine', () => {
  const spine = (): Spine => new Spine({ widths: [6, 9, 10, 8, 5, 3, 1.5], spacing: 12, bend: BEND });

  it('has one joint per width', () => {
    expect(spine().joints.length).toBe(7);
  });

  it('keeps every link exactly one spacing long, however hard the head turns', () => {
    const s = spine();
    s.replant(100, 100, 0);
    for (let i = 0; i < 200; i++) {
      const angle = Math.sin(i * 0.4) * 3;
      s.follow(100 + i * 3, 100 + Math.sin(i * 0.3) * 40, angle);
    }
    for (let i = 1; i < s.joints.length; i++) {
      const a = s.joints[i - 1]!;
      const b = s.joints[i]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(12, 5);
    }
  });

  it('never lets one vertebra bend past the limit from the one ahead', () => {
    const s = spine();
    s.replant(0, 0, 0);
    for (let i = 0; i < 100; i++) s.follow(Math.cos(i) * 50, Math.sin(i * 1.7) * 50, i);
    for (let i = 1; i < s.angles.length; i++) {
      expect(Math.abs(angleDelta(s.angles[i - 1]!, s.angles[i]!))).toBeLessThanOrEqual(BEND + 1e-9);
    }
  });

  it('lays out straight behind the head when replanted', () => {
    const s = spine();
    s.replant(50, 20, 0);
    expect(s.joints[0]).toEqual({ x: 50, y: 20 });
    expect(s.joints[3]?.x).toBeCloseTo(50 - 36);
    expect(s.joints[3]?.y).toBeCloseTo(20);
  });

  it('outlines a closed ring: both flanks, the tail and a rounded snout', () => {
    const s = spine();
    s.replant(0, 0, 0);
    const ring = s.outline();
    expect(ring.length).toBe(7 + 1 + 7 + 3);
    for (const p of ring) expect(finite(p.x) && finite(p.y)).toBe(true);
  });
});

describe('two-bone IK', () => {
  it('puts the knee where both bones reach', () => {
    const knee = solveTwoBone(0, 0, 30, 0, 20, 20, 1);
    expect(Math.hypot(knee.x, knee.y)).toBeCloseTo(20);
    expect(Math.hypot(knee.x - 30, knee.y)).toBeCloseTo(20);
  });
  it('mirrors with the bend flag', () => {
    const a = solveTwoBone(0, 0, 30, 0, 20, 20, 1);
    const b = solveTwoBone(0, 0, 30, 0, 20, 20, -1);
    expect(a.y).toBeCloseTo(-b.y);
    expect(a.y).not.toBeCloseTo(0);
  });
  it('gives a finite point for every leg it cannot fold', () => {
    const cases = [
      solveTwoBone(0, 0, 500, 0, 20, 20, 1), // far out of reach
      solveTwoBone(0, 0, 0, 0, 20, 20, 1), // foot on the hip
      solveTwoBone(0, 0, 1, 0, 20, 5, 1), // folded up inside itself
      solveTwoBone(0, 0, 40, 0, 20, 20, 1), // exactly straight
    ];
    for (const p of cases) expect(finite(p.x) && finite(p.y)).toBe(true);
  });
});

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
    expect(crab.y).toBeGreaterThan(TANK.floor);
    expect(crab.y).toBeLessThan(TANK.floor + crab.length);
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
