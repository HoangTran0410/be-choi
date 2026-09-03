import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { Creature, makeTank, speciesById } from '../aquarium/logic';
import {
  BITE_REACH,
  CATCHABLE,
  CATCH_FOR_STAR,
  JERK_SPEED,
  LAKE_MAX,
  LAKE_MIN,
  biter,
  isJerking,
  isLanded,
  STEADY_SECONDS,
  cast,
  isOutOfWater,
  lakeStock,
  makeHook,
  moveHook,
  needsCast,
  replacement,
  settleHook,
  tickSteady,
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
