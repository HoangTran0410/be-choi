import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import {
  Creature,
  FOOD_LIFE,
  FEAR_SECONDS,
  JOINTS,
  MAX_CREATURES,
  MAX_FOOD,
  SPECIES,
  addFood,
  applySave,
  bellySide,
  crowdedOut,
  decorAt,
  footDir,
  makeDecor,
  makeDrops,
  makeFood,
  makePebbles,
  makePlants,
  makeSave,
  makeVivarium,
  nearestShelter,
  plantAt,
  pokeDecor,
  readSave,
  savedStock,
  settleScenery,
  sheltersFrom,
  speciesById,
  stepDrops,
  stepFood,
  stocking,
  trimStock,
  type Creature as Animal,
  type Species,
  type World,
} from './logic';

const viv = makeVivarium(520, 820);

/** A world with nothing in it: no food, no finger, nobody else. */
function empty(over: Partial<World> = {}): World {
  return { foods: [], nudge: null, ...over };
}

/** Run one animal for `seconds` at 60 fps, and hand each frame to `watch`. */
function run(cr: Animal, seconds: number, world: World = empty(), rng: () => number = mulberry32(9), watch?: (cr: Animal) => void): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    cr.update(1 / 60, viv, world, rng);
    watch?.(cr);
  }
}

function species(id: string): Species {
  const found = speciesById(id);
  if (!found) throw new Error(`no species ${id}`);
  return found;
}

describe('terrarium species', () => {
  it('is a dozen animals with distinct ids and drawable bodies', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    for (const s of SPECIES) {
      expect(s.name.length).toBeGreaterThan(2);
      expect(s.profile.length).toBe(JOINTS);
      expect(s.size).toBeGreaterThan(0);
      expect(s.speed).toBeGreaterThan(0);
      expect(Math.abs(s.curious)).toBeLessThanOrEqual(1);
    }
  });

  it('has the two the game is named after, and both of them climb', () => {
    expect(species('gecko').climbs).toBe(true);
    expect(species('gecko').name).toContain('thạch sùng');
    expect(species('lizard').name).toContain('thằn lằn');
  });

  it('never lets an animal that cannot feed itself get hungry', () => {
    for (const s of SPECIES) {
      const cr = new Creature(s, viv);
      if (!cr.forages) {
        run(cr, 40);
        expect(cr.hunger).toBe(0);
      }
    }
  });
});

describe('the box', () => {
  it('stacks the lid, the soil and the front glass in that order', () => {
    expect(viv.top).toBeLessThan(viv.floor);
    expect(viv.floor).toBeLessThan(viv.front);
    expect(viv.front).toBeLessThanOrEqual(viv.h);
    expect(viv.wallL).toBeLessThan(viv.wallR);
    expect(viv.unit).toBeGreaterThan(0);
  });

  it('survives a box with no size at all', () => {
    const flat = makeVivarium(0, 0);
    expect(flat.w).toBe(1);
    expect(flat.unit).toBeGreaterThan(0);
    expect(() => new Creature(species('ant'), flat)).not.toThrow();
  });

  it('starts a fresh box with a handful of different animals', () => {
    const stock = stocking(viv, mulberry32(3));
    expect(stock.length).toBeGreaterThanOrEqual(4);
    expect(new Set(stock.map((s) => s.id)).size).toBe(stock.length);
  });
});

describe('surfaces', () => {
  it('points the feet at whatever they are standing on', () => {
    expect(footDir('ground')).toEqual({ x: 0, y: 1 });
    expect(footDir('ceiling')).toEqual({ x: 0, y: -1 });
    expect(footDir('left')).toEqual({ x: -1, y: 0 });
    expect(footDir('right')).toEqual({ x: 1, y: 0 });
  });

  it('hangs the legs off the correct side however the animal is turned', () => {
    // Walking right along the soil, the legs are below; walking left, above —
    // which is the same thing once the whole body has been mirrored.
    expect(bellySide('ground', 0)).toBe(1);
    expect(bellySide('ground', Math.PI)).toBe(-1);
    // Upside down under the lid, both are the other way round.
    expect(bellySide('ceiling', 0)).toBe(-1);
    expect(bellySide('ceiling', Math.PI)).toBe(1);
    // Going up the left pane, the feet are to the left of the way it faces.
    expect(bellySide('left', -Math.PI / 2)).toBe(-1);
    expect(bellySide('left', Math.PI / 2)).toBe(1);
  });
});

describe('a walking animal', () => {
  it('stands its body clear of the ground and lays its spine out behind it', () => {
    const cr = new Creature(species('gecko'), viv, mulberry32(1));
    expect(cr.bodyY).toBeLessThan(cr.y);
    expect(cr.stand).toBeGreaterThan(0);
    expect(cr.spine.joints.length).toBe(JOINTS);
    // The head leads and the tail trails: the joints are not all in one place.
    const head = cr.spine.joints[0]!;
    const tail = cr.spine.joints[JOINTS - 1]!;
    expect(Math.hypot(head.x - tail.x, head.y - tail.y)).toBeGreaterThan(cr.length * 0.5);
  });

  it('stays inside the box for a solid minute', () => {
    for (const s of SPECIES) {
      const cr = new Creature(s, viv, mulberry32(11));
      run(cr, 60, empty(), mulberry32(5), () => {
        expect(Number.isFinite(cr.bodyX)).toBe(true);
        expect(Number.isFinite(cr.bodyY)).toBe(true);
        expect(cr.bodyX).toBeGreaterThan(-cr.length * 2);
        expect(cr.bodyX).toBeLessThan(viv.w + cr.length * 2);
        expect(cr.bodyY).toBeGreaterThan(-cr.length * 2);
        expect(cr.bodyY).toBeLessThan(viv.h + cr.length * 2);
      });
    }
  });

  it('keeps a ground animal on the soil and never on the glass', () => {
    const cr = new Creature(species('lizard'), viv, mulberry32(4));
    run(cr, 90, empty(), mulberry32(6), () => {
      expect(cr.surface).toBe('ground');
      expect(cr.y).toBeGreaterThanOrEqual(viv.floor - 1);
      expect(cr.y).toBeLessThanOrEqual(viv.front + 1);
    });
  });

  it('takes a gecko up the glass and brings it back down again', () => {
    const cr = new Creature(species('gecko'), viv, mulberry32(2));
    const seen = new Set<string>();
    let changes = 0;
    let last: string = cr.surface;
    run(cr, 180, empty(), mulberry32(8), () => {
      seen.add(cr.surface);
      if (cr.surface !== last) {
        changes++;
        last = cr.surface;
      }
    });
    expect(seen.has('ground')).toBe(true);
    expect(seen.has('left') || seen.has('right')).toBe(true);
    // And it does not simply stick to the first pane it finds: up, along and down
    // again is several changes of surface, not one.
    expect(changes).toBeGreaterThanOrEqual(3);
  });

  it('gets a frog off the ground: it hops rather than walking', () => {
    const cr = new Creature(species('frog'), viv, mulberry32(7));
    let highest = 0;
    run(cr, 30, empty(), mulberry32(12), () => {
      highest = Math.max(highest, cr.lift);
    });
    expect(highest).toBeGreaterThan(cr.length * 0.2);
  });

  it('flies a butterfly, which never stands on anything', () => {
    const cr = new Creature(species('butterfly'), viv, mulberry32(13));
    run(cr, 20);
    expect(cr.surface).toBe('air');
    expect(cr.y).toBeLessThanOrEqual(viv.front);
  });
});

describe('facing', () => {
  /**
   * The bug this pins down: the heading used to be eased towards the direction of
   * travel and then clamped to within a lean of level. An angle that may not
   * leave that band can never reach the other side of it, so an animal kept the
   * facing it was born with for ever and moonwalked whenever its goal was behind
   * it.
   */
  it('can face either way, not just the way it was born facing', () => {
    for (const id of ['gecko', 'lizard', 'turtle', 'snail']) {
      const cr = new Creature(species(id), viv, mulberry32(71));
      let right = false;
      let left = false;
      run(cr, 90, empty(), mulberry32(72), () => {
        if (Math.cos(cr.heading) > 0.5) right = true;
        if (Math.cos(cr.heading) < -0.5) left = true;
      });
      expect(right, `${id} never faced right`).toBe(true);
      expect(left, `${id} never faced left`).toBe(true);
    }
  });

  it('walks the way it is facing', () => {
    const cr = new Creature(species('gecko'), viv, mulberry32(73));
    let frames = 0;
    let backwards = 0;
    run(cr, 120, empty(), mulberry32(74), () => {
      // Only while it is really going somewhere along the ground: an animal
      // standing still or drifting a hair's pace may face where it likes.
      if (cr.surface !== 'ground' || Math.abs(cr.vx) < cr.length * 0.3) return;
      frames++;
      if (Math.sign(cr.vx) !== Math.sign(Math.cos(cr.heading))) backwards++;
    });
    expect(frames).toBeGreaterThan(200);
    // A beat of turning round is fine; a habit of moonwalking is not.
    expect(backwards / frames).toBeLessThan(0.08);
  });

  it('keeps a body on the ground within a lean of level', () => {
    const cr = new Creature(species('chameleon'), viv, mulberry32(75));
    run(cr, 90, empty(), mulberry32(76), () => {
      if (cr.surface !== 'ground' || cr.falling) return;
      // Never standing on its tail: the nose stays near the horizontal.
      expect(Math.abs(Math.sin(cr.heading))).toBeLessThan(0.45);
    });
  });

  it('really bolts when it is frightened, in pixels and not in body units', () => {
    const cr = new Creature(species('lizard'), viv, mulberry32(77));
    const from = { x: cr.bodyX, y: cr.bodyY };
    cr.startle(from.x + cr.length * 0.5, from.y, true);
    run(cr, 0.5);
    expect(Math.hypot(cr.bodyX - from.x, cr.bodyY - from.y)).toBeGreaterThan(cr.length);
  });
});

describe('how an animal feels', () => {
  it('bolts away from a finger and calms down again', () => {
    const cr = new Creature(species('lizard'), viv, mulberry32(21));
    const from = { x: cr.bodyX, y: cr.bodyY };
    cr.startle(from.x, from.y, true);
    expect(cr.mood).toBe('scared');
    run(cr, 1);
    expect(Math.hypot(cr.bodyX - from.x, cr.bodyY - from.y)).toBeGreaterThan(cr.length * 0.4);
    run(cr, FEAR_SECONDS + 1);
    expect(cr.mood).not.toBe('scared');
    expect(cr.hiding).toBe(false);
  });

  it('shuts a frightened turtle into its shell instead of making it run', () => {
    const cr = new Creature(species('turtle'), viv, mulberry32(22));
    expect(cr.tucked).toBe(false);
    cr.startle(cr.bodyX + 10, cr.bodyY, true);
    expect(cr.tucked).toBe(true);
    run(cr, FEAR_SECONDS + 0.5);
    expect(cr.tucked).toBe(false);
  });

  it('gets hungry, then full again when it is fed', () => {
    const cr = new Creature(species('beetle'), viv, mulberry32(23));
    run(cr, 70);
    expect(cr.hunger).toBeGreaterThan(0.5);
    expect(cr.mood).toBe('hungry');
    cr.feed();
    expect(cr.hunger).toBe(0);
    expect(cr.mood).toBe('excited');
  });

  it('dozes through the wrong half of the day, whichever half that is', () => {
    const gecko = new Creature(species('gecko'), viv);
    const lizard = new Creature(species('lizard'), viv);
    expect(gecko.dozing(true)).toBe(false);
    expect(gecko.dozing(false)).toBe(true);
    expect(lizard.dozing(true)).toBe(true);
    expect(lizard.dozing(false)).toBe(false);
  });

  it('goes where the finger goes while it is held, and is giddy when put down', () => {
    const cr = new Creature(species('snail'), viv, mulberry32(24));
    cr.hold(120, 300);
    run(cr, 0.5);
    expect(cr.x).toBe(120);
    expect(cr.y).toBe(300);
    expect(cr.hunger).toBe(0);
    cr.release(viv);
    expect(cr.held).toBe(false);
    expect(cr.dizzy).toBeGreaterThan(0);
    // Let go in mid-air, it falls to the soil rather than being teleported there.
    expect(cr.falling).toBe(true);
    run(cr, 4);
    expect(cr.falling).toBe(false);
    expect(cr.surface).toBe('ground');
  });

  it('hangs the feet under a falling animal instead of leaving them on the floor', () => {
    const cr = new Creature(species('gecko'), viv, mulberry32(26));
    cr.hold(viv.w * 0.5, viv.top + viv.unit);
    // Standing, the feet are on whatever it is standing on.
    expect(cr.footY).toBeCloseTo(cr.y, 6);
    cr.release(viv);
    expect(cr.falling).toBe(true);

    cr.update(1 / 60, viv, empty());
    expect(cr.lift).toBeGreaterThan(0);
    // In mid-air the feet travel with the body, a leg's length under it — not
    // stretched all the way down to a floor that is still a long way below.
    expect(cr.footY).toBeCloseTo(cr.bodyY + cr.stand, 6);
    expect(cr.footY).toBeLessThan(viv.floor);

    run(cr, 4);
    expect(cr.falling).toBe(false);
    expect(cr.footY).toBeCloseTo(cr.y, 6);
  });

  it('has a hit box a toddler can actually land on', () => {
    const cr = new Creature(species('ant'), viv, mulberry32(25));
    const head = cr.spine.joints[0]!;
    expect(cr.hits(head.x, head.y)).toBe(true);
    expect(cr.hits(head.x + 20, head.y + 12)).toBe(true);
    expect(cr.hits(head.x + 400, head.y + 400)).toBe(false);
  });
});

describe('food', () => {
  it('drops from the lid, lands on the soil and then crawls about', () => {
    const foods = makeFood(viv, 4, mulberry32(31));
    for (const food of foods) {
      expect(food.landed).toBe(false);
      expect(food.y).toBeLessThanOrEqual(viv.top);
    }
    for (let i = 0; i < 180; i++) stepFood(foods, 1 / 60, viv);
    for (const food of foods) {
      expect(food.landed).toBe(true);
      expect(food.y).toBeGreaterThanOrEqual(viv.floor);
      expect(food.y).toBeLessThanOrEqual(viv.front);
    }
    const before = foods.map((f) => f.x);
    for (let i = 0; i < 120; i++) stepFood(foods, 1 / 60, viv);
    // Everything but the berries has wandered off from where it landed.
    expect(foods.some((f, i) => f.x !== before[i])).toBe(true);
  });

  it('burrows away if nobody wanted it, so the helping always ends', () => {
    const foods = makeFood(viv, 3, mulberry32(32));
    for (let i = 0; i < Math.round((FOOD_LIFE + 20) * 20); i++) stepFood(foods, 1 / 20, viv);
    expect(foods.every((f) => f.eaten)).toBe(true);
  });

  it('adds another helping without throwing the last one away, up to a ceiling', () => {
    let foods = makeFood(viv, 3, mulberry32(33));
    const first = foods[0]!;
    foods = addFood(foods, viv, mulberry32(34));
    expect(foods.length).toBeGreaterThan(3);
    expect(foods).toContain(first);
    for (let i = 0; i < 40; i++) foods = addFood(foods, viv, mulberry32(35));
    expect(foods.length).toBeLessThanOrEqual(MAX_FOOD);
  });

  it('is eaten by an animal that walks over it', () => {
    const cr = new Creature(species('gecko'), viv, mulberry32(36));
    const food = makeFood(viv, 1, mulberry32(37))[0]!;
    food.landed = true;
    food.x = cr.bodyX;
    food.y = cr.bodyY;
    cr.hunger = 1;
    let ate = false;
    for (let i = 0; i < 10 && !ate; i++) ate = cr.update(1 / 60, viv, empty({ foods: [food] }), mulberry32(38));
    expect(ate).toBe(true);
    expect(food.eaten).toBe(true);
    expect(cr.hunger).toBe(0);
  });
});

describe('scenery', () => {
  it('plants and beds in ornaments that all stand in the soil', () => {
    const plants = makePlants(viv, mulberry32(41));
    const decor = makeDecor(viv, mulberry32(42));
    const pebbles = makePebbles(viv, mulberry32(43));
    expect(plants.length).toBeGreaterThan(3);
    expect(decor.length).toBeGreaterThan(4);
    expect(pebbles.length).toBeGreaterThan(3);
    for (const item of [...plants, ...decor, ...pebbles]) {
      expect(item.y).toBeGreaterThanOrEqual(viv.floor - 1);
      expect(item.y).toBeLessThanOrEqual(viv.front + 1);
    }
  });

  it('makes cover out of the scenery that is already there', () => {
    const plants = makePlants(viv, mulberry32(44));
    const decor = makeDecor(viv, mulberry32(45));
    const shelters = sheltersFrom(viv, plants, decor);
    expect(shelters.length).toBeGreaterThan(plants.length);
    const near = nearestShelter(shelters, shelters[0]!.x, shelters[0]!.y, viv);
    expect(near).not.toBeNull();
    expect(nearestShelter([], 10, 10, viv)).toBeNull();
  });

  it('answers a poke and lets the reaction die away', () => {
    const decor = makeDecor(viv, mulberry32(46));
    const plants = makePlants(viv, mulberry32(47));
    const d = decor[0]!;
    const hit = decorAt(decor, d.x, d.y - d.size * viv.unit * 0.35, viv);
    expect(hit).toBe(d);
    expect(decorAt(decor, -500, -500, viv)).toBeNull();
    pokeDecor(d);
    expect(d.poke).toBeGreaterThan(0);
    const plant = plants[0]!;
    expect(plantAt(plants, plant.x, plant.y, viv)).toBe(plant);
    expect(plantAt(plants, plant.x, plant.y - plant.h * 3, viv)).toBeNull();
    plant.shake = 1;
    settleScenery(plants, decor, 5);
    expect(d.poke).toBe(0);
    expect(plant.shake).toBe(0);
  });

  it('runs the mist down the glass and lets it dry', () => {
    const drops = makeDrops(viv, 12, mulberry32(48));
    expect(drops.length).toBe(12);
    const top = drops[0]!.y;
    stepDrops(drops, 0.5);
    expect(drops[0]!.y).toBeGreaterThan(top);
    stepDrops(drops, 60);
    expect(drops.length).toBe(0);
  });
});

describe('the box the child built', () => {
  it('remembers who lives here and where the furniture ended up', () => {
    const plants = makePlants(viv, mulberry32(51));
    const decor = makeDecor(viv, mulberry32(52));
    const creatures = [species('gecko'), species('snail')].map((s) => new Creature(s, viv));
    const save = makeSave(creatures, decor, plants, viv, true);
    expect(save.pets).toEqual(['gecko', 'snail']);
    expect(save.night).toBe(true);
    for (const at of [...save.decor, ...save.plants]) {
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThanOrEqual(1);
    }

    const back = readSave(JSON.stringify(save))!;
    expect(back.pets).toEqual(['gecko', 'snail']);
    const moved = makeDecor(viv, mulberry32(53));
    const movedPlants = makePlants(viv, mulberry32(54));
    applySave(back, moved, movedPlants, viv);
    expect(moved[0]!.x).toBeCloseTo(decor[0]!.x, 4);
    expect(movedPlants[0]!.x).toBeCloseTo(plants[0]!.x, 4);
  });

  it('ignores a save it cannot read, and drops anything odd inside one it can', () => {
    expect(readSave(null)).toBeNull();
    expect(readSave('not json')).toBeNull();
    expect(readSave('{"v":9}')).toBeNull();
    const messy = readSave('{"v":1,"pets":["gecko","dragon",7],"decor":[0.5,4,"x"],"plants":null}')!;
    expect(messy.pets).toEqual(['gecko']);
    expect(messy.decor).toEqual([0.5]);
    expect(messy.plants).toEqual([]);
    expect(savedStock(messy)!.map((s) => s.id)).toEqual(['gecko']);
    expect(savedStock(null)).toBeNull();
    expect(savedStock({ v: 1, pets: [], decor: [], plants: [] })).toBeNull();
  });

  it('makes room in a full box by dropping one of whatever there are most of', () => {
    const ids = ['ant', 'ant', 'ant', 'gecko'];
    expect(crowdedOut(ids)).toBe(0);
    expect(crowdedOut([])).toBe(-1);
    const many = Array.from({ length: MAX_CREATURES + 6 }, (_, i) => (i === 3 ? 'snake' : 'ant'));
    const kept = trimStock(many);
    expect(kept.length).toBe(MAX_CREATURES);
    // The one there was only one of is the one a child would miss.
    expect(kept).toContain('snake');
  });
});

describe('living together', () => {
  it('spreads a fright from one animal to the one standing next to it', () => {
    const a = new Creature(species('lizard'), viv, mulberry32(61));
    const b = new Creature(species('lizard'), viv, mulberry32(62));
    b.x = a.x;
    b.y = a.y;
    b.spine.replant(b.bodyX, b.bodyY, b.heading);
    a.startle(a.bodyX + 5, a.bodyY, true);
    b.update(1 / 60, viv, empty({ neighbours: [a, b] }), mulberry32(63));
    expect(b.mood).toBe('scared');
  });

  it('keeps two animals from standing in the same place', () => {
    const a = new Creature(species('turtle'), viv, mulberry32(64));
    const b = new Creature(species('turtle'), viv, mulberry32(65));
    b.x = a.x + 2;
    b.y = a.y;
    b.spine.replant(b.bodyX, b.bodyY, b.heading);
    const world = empty({ neighbours: [a, b] });
    for (let i = 0; i < 180; i++) {
      a.update(1 / 60, viv, world, mulberry32(66));
      b.update(1 / 60, viv, world, mulberry32(67));
    }
    expect(Math.hypot(a.bodyX - b.bodyX, a.bodyY - b.bodyY)).toBeGreaterThan(a.length * 0.4);
  });
});
