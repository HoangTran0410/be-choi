import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { Creature, makeTank, speciesById } from '../aquarium/logic';
import {
  BITE_REACH,
  CATCHABLE,
  CATCH_FOR_STAR,
  HAZARD_IDS,
  MONSTERS,
  VISIT_MAX_GAP,
  VISIT_MIN_GAP,
  CAST_MAX_DEPTH,
  CAST_MIN_DEPTH,
  JERK_SPEED,
  JUNK,
  LAKE_MAX,
  LAKE_MIN,
  PULL_SECONDS,
  ROD_X,
  ROPE_KNOTS,
  STEADY_SECONDS,
  aimCast,
  biter,
  cast,
  castHere,
  isHazard,
  isJerking,
  isLanded,
  isOutOfWater,
  isSlipping,
  lakeStock,
  makeDrifters,
  makeHook,
  makeRope,
  moveHook,
  needsCast,
  nextVisit,
  planVisit,
  pullOf,
  reel,
  replacement,
  settleHook,
  slip,
  snaggedOn,
  stepDrifter,
  stepRope,
  tickSteady,
  tug,
  visitOver,
} from './logic';

const LAKE = makeTank(520, 820);

/** A hungry fish, facing right, put exactly where it is wanted. */
function hungryFish(x: number, y: number, id = 'goldfish'): Creature {
  const cr = new Creature(speciesById(id)!, LAKE, mulberry32(3));
  cr.x = x;
  cr.y = y;
  cr.heading = 0;
  cr.hunger = 1;
  cr.spine.replant(cr.x, cr.y, cr.heading);
  return cr;
}

describe('the lake', () => {
  it('holds a handful of fish, and only ones that would chase a bait', () => {
    for (const tank of [makeTank(320, 480), makeTank(1400, 900)]) {
      const stock = lakeStock(tank, mulberry32(1));
      expect(stock.length).toBeGreaterThanOrEqual(LAKE_MIN);
      expect(stock.length).toBeLessThanOrEqual(LAKE_MAX);
      for (const species of stock) {
        expect(CATCHABLE).toContain(species);
        // A jellyfish cannot steer towards a bait, so it could never be caught.
        expect(species.kind).not.toBe('jelly');
      }
    }
  });

  it('always has another fish to send in', () => {
    for (let seed = 1; seed < 20; seed++) {
      expect(CATCHABLE).toContain(replacement(mulberry32(seed)));
    }
  });

  it('puts a crab in the lake, so the bottom is worth visiting', () => {
    // A crab walks the sand for what has landed on it: lower the bait and it comes.
    expect(CATCHABLE.some((s) => s.kind === 'crab')).toBe(true);
  });

  it('gives a star often enough to feel like progress', () => {
    expect(CATCH_FOR_STAR).toBeGreaterThan(1);
    expect(CATCH_FOR_STAR).toBeLessThanOrEqual(5);
  });
});

describe('the line', () => {
  it('starts in the water, under the rod', () => {
    const hook = makeHook(LAKE);
    expect(hook.x).toBeCloseTo(LAKE.w / 2, 0);
    expect(hook.y).toBeGreaterThan(0);
    expect(hook.y).toBeLessThan(LAKE.floor);
    expect(hook.caught).toBeNull();
  });

  it('never leaves the water, however far the finger goes', () => {
    const hook = makeHook(LAKE);
    for (const [x, y] of [
      [-500, -500],
      [LAKE.w + 500, LAKE.h + 500],
    ]) {
      moveHook(hook, x!, y!, 1 / 60, LAKE);
      expect(hook.x).toBeGreaterThanOrEqual(0);
      expect(hook.x).toBeLessThanOrEqual(LAKE.w);
      expect(hook.y).toBeGreaterThanOrEqual(0);
      expect(hook.y).toBeLessThanOrEqual(LAKE.floor);
    }
  });

  it('knows the difference between easing the bait along and yanking it', () => {
    const gentle = makeHook(LAKE);
    for (let i = 0; i < 30; i++) moveHook(gentle, gentle.x + LAKE.unit * 0.01, gentle.y, 1 / 60, LAKE);
    expect(isJerking(gentle, LAKE)).toBe(false);

    const yanked = makeHook(LAKE);
    for (let i = 0; i < 30; i++) {
      moveHook(yanked, yanked.x + (i % 2 ? LAKE.unit : -LAKE.unit), yanked.y, 1 / 60, LAKE);
    }
    expect(isJerking(yanked, LAKE)).toBe(true);
    expect(yanked.speed).toBeGreaterThan(JERK_SPEED * LAKE.unit);
  });

  it('calms down again once the finger comes off', () => {
    const hook = makeHook(LAKE);
    for (let i = 0; i < 30; i++) {
      moveHook(hook, hook.x + (i % 2 ? LAKE.unit : -LAKE.unit), hook.y, 1 / 60, LAKE);
    }
    expect(isJerking(hook, LAKE)).toBe(true);
    for (let i = 0; i < 120; i++) settleHook(hook, 1 / 60);
    expect(isJerking(hook, LAKE)).toBe(false);
  });
});

describe('taking the bait', () => {
  /** A bait that has been sitting quietly long enough to be worth a try. */
  const settled = () => {
    const hook = makeHook(LAKE);
    for (let i = 0; i < STEADY_SECONDS * 60 + 6; i++) tickSteady(hook, 1 / 60, LAKE);
    return hook;
  };

  it('is taken by a hungry fish whose mouth reaches a bait held still', () => {
    const hook = settled();
    const fish = hungryFish(hook.x - LAKE.unit * 0.1, hook.y);
    expect(biter(hook, [fish], LAKE)).toBe(fish);
  });

  it('is left alone until the bait has settled', () => {
    const hook = makeHook(LAKE);
    const fish = hungryFish(hook.x - LAKE.unit * 0.1, hook.y);
    expect(hook.steady).toBe(0);
    expect(biter(hook, [fish], LAKE)).toBeNull();
    tickSteady(hook, STEADY_SECONDS * 0.5, LAKE);
    expect(biter(hook, [fish], LAKE)).toBeNull();
    tickSteady(hook, STEADY_SECONDS, LAKE);
    expect(biter(hook, [fish], LAKE)).toBe(fish);
  });

  it('starts settling again from nothing after a snatch', () => {
    const hook = settled();
    for (let i = 0; i < 30; i++) {
      moveHook(hook, hook.x + (i % 2 ? LAKE.unit : -LAKE.unit), hook.y, 1 / 60, LAKE);
      tickSteady(hook, 1 / 60, LAKE);
    }
    expect(hook.steady).toBe(0);
  });

  it('catches nothing at all on an empty hook', () => {
    const hook = settled();
    const fish = hungryFish(hook.x, hook.y);
    hook.baited = false;
    expect(biter(hook, [fish], LAKE)).toBeNull();
    expect(needsCast(hook, LAKE)).toBe(true);
    // Casting puts a fresh bait on, which then has to settle like any other.
    while (!cast(hook, 1 / 60, LAKE)) {
      /* winding out */
    }
    expect(hook.baited).toBe(true);
    expect(hook.steady).toBe(0);
  });

  it('catches nothing while it dangles in the air', () => {
    const hook = settled();
    hook.y = LAKE.h * 0.05;
    const fish = hungryFish(hook.x, hook.y);
    expect(isOutOfWater(hook, LAKE)).toBe(true);
    expect(biter(hook, [fish], LAKE)).toBeNull();
  });

  it('is left alone by a fish that has just eaten', () => {
    const hook = settled();
    const full = hungryFish(hook.x - LAKE.unit * 0.1, hook.y);
    full.feed();
    expect(full.mood).not.toBe('hungry');
    expect(biter(hook, [full], LAKE)).toBeNull();
  });

  it('is left alone by a frightened fish, however hungry it is', () => {
    const hook = settled();
    const scared = hungryFish(hook.x - LAKE.unit * 0.1, hook.y);
    scared.startle(hook.x, hook.y, true);
    expect(biter(hook, [scared], LAKE)).toBeNull();
  });

  it('is left alone while the bait is being snatched about', () => {
    const hook = makeHook(LAKE);
    const fish = hungryFish(hook.x, hook.y);
    for (let i = 0; i < 30; i++) {
      moveHook(hook, hook.x + (i % 2 ? LAKE.unit : -LAKE.unit), hook.y, 1 / 60, LAKE);
    }
    fish.x = hook.x;
    fish.y = hook.y;
    fish.spine.replant(fish.x, fish.y, 0);
    expect(biter(hook, [fish], LAKE)).toBeNull();
  });

  it('is out of reach for a fish across the lake', () => {
    const hook = settled();
    const far = hungryFish(hook.x + BITE_REACH * LAKE.unit * 6, hook.y);
    expect(biter(hook, [far], LAKE)).toBeNull();
  });

  it('takes one fish at a time', () => {
    const hook = settled();
    const first = hungryFish(hook.x, hook.y);
    const second = hungryFish(hook.x, hook.y, 'clown');
    hook.caught = first;
    expect(biter(hook, [first, second], LAKE)).toBeNull();
  });
});

describe('what else is down there', () => {
  const settledHook = () => {
    const hook = makeHook(LAKE);
    for (let i = 0; i < STEADY_SECONDS * 60 + 6; i++) tickSteady(hook, 1 / 60, LAKE);
    return hook;
  };

  it('offers boots and bottles as well as treasure, and says something about each', () => {
    expect(JUNK.length).toBeGreaterThan(4);
    for (const item of JUNK) {
      expect(item.emoji.length).toBeGreaterThan(0);
      expect(item.say.length).toBeGreaterThan(0);
    }
    expect(JUNK.some((j) => j.treasure)).toBe(true);
    expect(JUNK.some((j) => !j.treasure)).toBe(true);
  });

  it('fills the water with things to steer around, and the odd treasure', () => {
    const drifting = makeDrifters(LAKE, 40, mulberry32(4));
    expect(drifting.length).toBe(40);
    for (const d of drifting) {
      expect(JUNK).toContain(d.junk);
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeGreaterThan(0);
      expect(d.y).toBeLessThan(LAKE.floor);
    }
    expect(drifting.some((d) => d.junk.treasure)).toBe(true);
    expect(drifting.some((d) => !d.junk.treasure)).toBe(true);
  });

  it('drifts on and stays in the water, however long it goes', () => {
    const drifting = makeDrifters(LAKE, 12, mulberry32(5));
    for (let i = 0; i < 60 * 120; i++) for (const d of drifting) stepDrifter(d, 1 / 60, LAKE);
    for (const d of drifting) {
      expect(d.y).toBeGreaterThan(0);
      expect(d.y).toBeLessThan(LAKE.floor);
      expect(Number.isFinite(d.x)).toBe(true);
    }
  });

  it('fouls the bait that is steered into it, and not one kept clear', () => {
    const hook = settledHook();
    const near = makeDrifters(LAKE, 1, mulberry32(6));
    near[0]!.x = hook.x;
    near[0]!.y = hook.y;
    expect(snaggedOn(hook, near, LAKE)).toBe(near[0]);

    near[0]!.x = hook.x + LAKE.unit * 4;
    expect(snaggedOn(hook, near, LAKE)).toBeNull();
  });

  it('fouls nothing on an empty hook, or one out of the water', () => {
    const under = makeDrifters(LAKE, 1, mulberry32(7));
    const bare = settledHook();
    under[0]!.x = bare.x;
    under[0]!.y = bare.y;
    bare.baited = false;
    expect(snaggedOn(bare, under, LAKE)).toBeNull();

    const dry = settledHook();
    dry.y = LAKE.h * 0.05;
    under[0]!.x = dry.x;
    under[0]!.y = dry.y;
    expect(snaggedOn(dry, under, LAKE)).toBeNull();
  });

  it('keeps the shark in the lake and out of the bucket', () => {
    const shark = hungryFish(0, 0, 'shark');
    expect(isHazard(shark)).toBe(true);
    expect(CATCHABLE.some((sp) => sp.id === 'shark')).toBe(false);
    // However hungry it is and however still the bait, it is not a catch.
    const hook = settledHook();
    shark.x = hook.x;
    shark.y = hook.y;
    shark.spine.replant(shark.x, shark.y, 0);
    expect(biter(hook, [shark], LAKE)).toBeNull();
  });

  it('leaves the fish alone while something is already on the hook', () => {
    const hook = settledHook();
    hook.junk = JUNK[0]!;
    const fish = hungryFish(hook.x, hook.y);
    expect(biter(hook, [fish], LAKE)).toBeNull();
    // It still has to be hauled out like anything else.
    hook.y = LAKE.h * 0.05;
    expect(isLanded(hook, LAKE)).toBe(true);
    expect(needsCast(hook, LAKE)).toBe(false);
  });
});

describe('the weight on the line', () => {
  it('is nothing at all on a bare hook', () => {
    expect(pullOf(makeHook(LAKE))).toBe(1);
  });

  it('makes a big fish far harder to lift than a little one', () => {
    const little = makeHook(LAKE);
    little.caught = hungryFish(0, 0, 'guppy');
    const big = makeHook(LAKE);
    big.caught = hungryFish(0, 0, 'shark');
    expect(pullOf(big)).toBeLessThan(pullOf(little));
    expect(pullOf(little)).toBeLessThan(1);
  });

  it('brings everything home to the rod, whichever side it was hooked on', () => {
    const hook = makeHook(LAKE);
    hook.x = LAKE.w * 0.1;
    hook.y = LAKE.h * 0.6;
    hook.caught = hungryFish(hook.x, hook.y, 'guppy');
    for (let i = 0; i < 600; i++) reel(hook, 1 / 60, LAKE, i / 60);
    expect(hook.x).toBeCloseTo(LAKE.w * ROD_X, -1);
    expect(hook.y).toBeLessThan(LAKE.h * 0.12);
  });

  it('brings a big fish up slower than a small one, and never off the sides', () => {
    const rise = (id: string): number => {
      const hook = makeHook(LAKE);
      hook.caught = hungryFish(LAKE.w / 2, LAKE.h * 0.6, id);
      hook.y = LAKE.h * 0.6;
      for (let i = 0; i < 30; i++) reel(hook, 1 / 60, LAKE, i / 60);
      expect(hook.x).toBeGreaterThan(0);
      expect(hook.x).toBeLessThan(LAKE.w);
      return LAKE.h * 0.6 - hook.y;
    };
    expect(rise('shark')).toBeLessThan(rise('guppy'));
  });
});

describe('casting again', () => {
  it('lands somewhere new every time, always in the lower half of the water', () => {
    const spots = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const hook = makeHook(LAKE);
      aimCast(hook, LAKE, mulberry32(seed));
      expect(hook.aimY).toBeGreaterThan(LAKE.h * CAST_MIN_DEPTH - 1);
      expect(hook.aimY).toBeLessThan(LAKE.h * CAST_MAX_DEPTH + 1);
      expect(hook.aimX).toBeGreaterThan(0);
      expect(hook.aimX).toBeLessThan(LAKE.w);
      spots.add(`${Math.round(hook.aimX)},${Math.round(hook.aimY)}`);
    }
    // Not the same spot over and over: that is the point of aiming at all.
    expect(spots.size).toBeGreaterThan(20);
  });

  it('lets the child drop the line in by hand, wherever they touch', () => {
    const hook = makeHook(LAKE);
    hook.baited = false;
    hook.y = LAKE.h * 0.05;
    for (let i = 0; i < STEADY_SECONDS * 60; i++) tickSteady(hook, 1 / 60, LAKE);
    castHere(hook, LAKE.w * 0.7, LAKE.h * 0.6, LAKE);
    expect(hook.x).toBeCloseTo(LAKE.w * 0.7, 0);
    expect(hook.y).toBeCloseTo(LAKE.h * 0.6, 0);
    expect(hook.baited).toBe(true);
    // A hand-dropped bait has to settle like any other: no free catch.
    expect(hook.steady).toBe(0);
    expect(hook.speed).toBe(0);
  });

  it('keeps a hand-dropped line inside the water', () => {
    const hook = makeHook(LAKE);
    hook.baited = false;
    castHere(hook, -900, LAKE.h * 9, LAKE);
    expect(hook.x).toBeGreaterThan(0);
    expect(hook.y).toBeLessThanOrEqual(LAKE.floor);
  });

  it('flies out to where it was aimed and puts a fresh bait on', () => {
    const hook = makeHook(LAKE);
    hook.x = LAKE.w * ROD_X;
    hook.y = LAKE.h * 0.05;
    hook.baited = false;
    aimCast(hook, LAKE, mulberry32(2));
    let done = false;
    for (let i = 0; i < 600 && !done; i++) done = cast(hook, 1 / 60, LAKE);
    expect(done).toBe(true);
    expect(hook.x).toBeCloseTo(hook.aimX, 0);
    expect(hook.y).toBeCloseTo(hook.aimY, 0);
    expect(hook.baited).toBe(true);
    expect(hook.steady).toBe(0);
  });
});

describe('the fight', () => {
  it('comes up while the child keeps tugging, and goes back down when they stop', () => {
    const hook = makeHook(LAKE);
    hook.y = LAKE.h * 0.6;
    hook.fightFrom = hook.y;
    hook.caught = hungryFish(hook.x, hook.y, 'guppy');

    tug(hook);
    expect(isSlipping(hook)).toBe(false);
    const start = hook.y;
    for (let i = 0; i < 20; i++) reel(hook, 1 / 60, LAKE, i / 60);
    expect(hook.y).toBeLessThan(start);

    // Stop tugging: the pull runs out and the fish starts taking line.
    for (let i = 0; i < PULL_SECONDS * 60 + 5; i++) reel(hook, 1 / 60, LAKE, i / 60);
    expect(hook.pull).toBe(0);
    expect(isSlipping(hook)).toBe(true);
    const held = hook.y;
    slip(hook, 1 / 60, LAKE);
    expect(hook.y).toBeGreaterThan(held);
  });

  it('lets the fish off once it has taken back enough line', () => {
    const hook = makeHook(LAKE);
    hook.y = LAKE.h * 0.4;
    hook.fightFrom = hook.y;
    hook.caught = hungryFish(hook.x, hook.y, 'shark');
    let off = false;
    for (let i = 0; i < 600 && !off; i++) off = slip(hook, 1 / 60, LAKE);
    expect(off).toBe(true);
    expect(hook.y).toBeGreaterThan(hook.fightFrom);
  });

  it('holds on as long as the child keeps tapping', () => {
    const hook = makeHook(LAKE);
    hook.y = LAKE.h * 0.6;
    hook.fightFrom = hook.y;
    hook.caught = hungryFish(hook.x, hook.y, 'shark');
    let off = false;
    for (let i = 0; i < 900 && !off; i++) {
      // A tap every third of a second, which is what a child manages.
      if (i % 20 === 0) tug(hook);
      if (hook.pull > 0) reel(hook, 1 / 60, LAKE, i / 60);
      else off = slip(hook, 1 / 60, LAKE);
      if (isLanded(hook, LAKE)) break;
    }
    expect(off).toBe(false);
    expect(isLanded(hook, LAKE)).toBe(true);
  });
});

describe('what passes through', () => {
  it('offers a shark, a crocodile and a snake, and none of them in the fish tank', () => {
    expect(MONSTERS.length).toBeGreaterThanOrEqual(3);
    for (const m of MONSTERS) {
      expect(HAZARD_IDS).toContain(m.id);
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.profile.length).toBe(7);
      // Far bigger than anything the child can land.
      expect(m.size).toBeGreaterThan(2.5);
      // And never offered as something to put in the aquarium.
      expect(CATCHABLE.some((sp) => sp.id === m.id)).toBe(false);
    }
  });

  it('cannot be caught, however hungry it is or however still the bait', () => {
    for (const m of MONSTERS) {
      const beast = new Creature(m, LAKE, mulberry32(2));
      beast.hunger = 1;
      const hook = makeHook(LAKE);
      for (let i = 0; i < STEADY_SECONDS * 60 + 6; i++) tickSteady(hook, 1 / 60, LAKE);
      beast.x = hook.x;
      beast.y = hook.y;
      beast.spine.replant(beast.x, beast.y, 0);
      expect(isHazard(beast)).toBe(true);
      expect(biter(hook, [beast], LAKE)).toBeNull();
    }
  });

  it('comes rarely, from either side, and somewhere in the water', () => {
    const sides = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      const plan = planVisit(LAKE, mulberry32(seed));
      expect(MONSTERS).toContain(plan.species);
      expect(plan.y).toBeGreaterThan(0);
      expect(plan.y).toBeLessThan(LAKE.floor);
      sides.add(plan.dir);
      const gap = nextVisit(mulberry32(seed));
      expect(gap).toBeGreaterThanOrEqual(VISIT_MIN_GAP);
      expect(gap).toBeLessThanOrEqual(VISIT_MAX_GAP);
    }
    expect(sides.size).toBe(2);
  });

  it('is over once it has crossed the water and left', () => {
    const beast = new Creature(MONSTERS[0]!, LAKE, mulberry32(3));
    beast.x = LAKE.w / 2;
    expect(visitOver(beast, LAKE)).toBe(false);
    beast.x = LAKE.w + beast.length * 2;
    expect(visitOver(beast, LAKE)).toBe(true);
    beast.x = -beast.length * 2;
    expect(visitOver(beast, LAKE)).toBe(true);
  });
});

describe('the line itself', () => {
  const rod = { x: LAKE.w * ROD_X, y: 0 };
  const settle = (rope: ReturnType<typeof makeRope>, hook: ReturnType<typeof makeHook>, frames = 240): void => {
    for (let i = 0; i < frames; i++) stepRope(rope, 1 / 60, rod, hook, LAKE);
  };

  it('runs from the rod to the bait, and stays joined to both', () => {
    const hook = makeHook(LAKE);
    hook.x = LAKE.w * 0.7;
    hook.y = LAKE.h * 0.6;
    const rope = makeRope(rod.x, rod.y, hook.x, hook.y);
    expect(rope.length).toBe(ROPE_KNOTS);
    settle(rope, hook);
    expect(rope[0]!.x).toBe(rod.x);
    expect(rope[0]!.y).toBe(rod.y);
    expect(rope[rope.length - 1]!.x).toBe(hook.x);
    expect(rope[rope.length - 1]!.y).toBe(hook.y);
    for (const knot of rope) expect(Number.isFinite(knot.x) && Number.isFinite(knot.y)).toBe(true);
  });

  it('sags below the straight line between its ends', () => {
    const hook = makeHook(LAKE);
    hook.x = LAKE.w * 0.8;
    hook.y = LAKE.h * 0.4;
    const rope = makeRope(rod.x, rod.y, hook.x, hook.y);
    settle(rope, hook);
    // Every knot is measured against where a taut string would have put it.
    let below = 0;
    rope.forEach((knot, i) => {
      const along = i / (ROPE_KNOTS - 1);
      const straight = rod.y + (hook.y - rod.y) * along;
      if (knot.y > straight + 0.5) below++;
    });
    expect(below).toBeGreaterThan(ROPE_KNOTS / 3);
  });

  it('lags behind a bait that is moved, and catches up when it stops', () => {
    const hook = makeHook(LAKE);
    hook.x = LAKE.w * 0.5;
    hook.y = LAKE.h * 0.5;
    const rope = makeRope(rod.x, rod.y, hook.x, hook.y);
    settle(rope, hook);
    const middle = () => rope[Math.floor(ROPE_KNOTS / 2)]!;
    const before = middle().x;

    // Swing the bait across: the middle of the line trails behind it.
    for (let i = 0; i < 12; i++) {
      hook.x += LAKE.unit * 0.5;
      stepRope(rope, 1 / 60, rod, hook, LAKE);
    }
    const trailing = middle().x;
    const taut = (rod.x + hook.x) / 2;
    expect(trailing).toBeGreaterThan(before);
    expect(trailing).toBeLessThan(taut);

    // Let it hang: it settles back under the straight line.
    settle(rope, hook, 600);
    expect(Math.abs(middle().x - taut)).toBeLessThan(LAKE.unit * 0.7);
  });

  it('does not fly apart however hard the bait is thrown about', () => {
    const hook = makeHook(LAKE);
    const rope = makeRope(rod.x, rod.y, hook.x, hook.y);
    for (let i = 0; i < 2000; i++) {
      hook.x = LAKE.w * (i % 2 === 0 ? 0.05 : 0.95);
      hook.y = LAKE.h * (i % 3 === 0 ? 0.1 : 0.8);
      stepRope(rope, 1 / 60, rod, hook, LAKE);
    }
    for (const knot of rope) {
      expect(Number.isFinite(knot.x) && Number.isFinite(knot.y)).toBe(true);
      // Still somewhere near the water rather than off in space.
      expect(Math.abs(knot.x)).toBeLessThan(LAKE.w * 4);
      expect(Math.abs(knot.y)).toBeLessThan(LAKE.h * 4);
    }
  });
});

describe('landing it', () => {
  it('counts only once the fish is clear of the water', () => {
    const hook = makeHook(LAKE);
    hook.caught = hungryFish(hook.x, hook.y);
    hook.y = LAKE.h * 0.5;
    expect(isLanded(hook, LAKE)).toBe(false);
    hook.y = LAKE.h * 0.05;
    expect(isLanded(hook, LAKE)).toBe(true);
  });

  it('is nothing at all with an empty hook', () => {
    const hook = makeHook(LAKE);
    hook.y = 0;
    expect(isLanded(hook, LAKE)).toBe(false);
  });
});
