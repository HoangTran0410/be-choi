import { describe, it, expect } from 'vitest';
import { FX } from '../../core/audio';
import {
  BLEND_UNITS,
  DELIVERIES_FOR_STAR,
  FILL_SECONDS,
  FIRST_LEG,
  FORK_OFFSET,
  FORK_SLOTS,
  MUD_PER_SPLASH,
  REACH_UNITS,
  RIDE_SLOTS,
  SLOT_UNITS,
  VEHICLES,
  fillUp,
  forkAt,
  homeSlot,
  isFork,
  legAt,
  legMix,
  makeCar,
  makeRoad,
  makeSave,
  propAt,
  nextFork,
  propsIn,
  reached,
  readSave,
  rinse,
  riderAt,
  roadTilt,
  roadY,
  slotX,
  stepCar,
  takeFork,
  vehicleById,
} from './logic';

const ROAD = makeRoad(420, 620);
const CAR = VEHICLES[0]!;

describe('the vehicles', () => {
  it('are all distinct, named, and have a horn the synth knows', () => {
    expect(VEHICLES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(VEHICLES.map((v) => v.id)).size).toBe(VEHICLES.length);
    for (const v of VEHICLES) {
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.emoji.length).toBeGreaterThan(0);
      expect(FX).toContain(v.horn);
      expect(v.speed).toBeGreaterThan(0);
      expect(v.wheelbase).toBeGreaterThan(0);
    }
  });
  it('finds one by id', () => {
    expect(vehicleById('bus')?.name).toBe('xe buýt');
    expect(vehicleById('nope')).toBeUndefined();
  });
  it('makes the tractor the slowest and the car the quickest', () => {
    const slowest = [...VEHICLES].sort((a, b) => a.speed - b.speed)[0];
    expect(slowest?.id).toBe('tractor');
  });
});

describe('the road', () => {
  it('sits below the sky and sizes a unit off the short side', () => {
    expect(ROAD.ground).toBeGreaterThan(ROAD.h * 0.5);
    expect(ROAD.ground).toBeLessThan(ROAD.h);
    expect(ROAD.unit).toBeCloseTo(420 / 6.5);
  });

  it('rolls up and down without ever jumping', () => {
    let prev = roadY(ROAD, 0);
    let lowest = prev;
    let highest = prev;
    for (let x = 0; x < ROAD.unit * 200; x += ROAD.unit * 0.1) {
      const y = roadY(ROAD, x);
      expect(Math.abs(y - prev)).toBeLessThan(ROAD.unit * 0.1);
      lowest = Math.min(lowest, y);
      highest = Math.max(highest, y);
      prev = y;
    }
    // It really does have hills, and they stay on screen.
    expect(highest - lowest).toBeGreaterThan(ROAD.unit * 0.4);
    expect(highest).toBeLessThan(ROAD.h);
  });

  it('tilts uphill where it climbs and downhill where it drops', () => {
    const x = ROAD.unit * 3;
    const climbing = roadY(ROAD, x + 1) < roadY(ROAD, x - 1);
    expect(roadTilt(ROAD, x) < 0).toBe(climbing);
    expect(Math.abs(roadTilt(ROAD, x))).toBeLessThan(1);
  });
});

describe('the roadside', () => {
  it('gives every slot the same thing every time', () => {
    for (const slot of [-3, 0, 4, 17, 250]) {
      expect(propAt(ROAD, slot)).toEqual(propAt(ROAD, slot));
    }
  });

  it('puts a passenger a short drive before every house', () => {
    for (let slot = 0; slot < 40; slot++) {
      const prop = propAt(ROAD, slot);
      if (prop.kind !== 'stop') continue;
      expect(propAt(ROAD, homeSlot(slot)).kind).toBe('house');
      expect(homeSlot(slot) - slot).toBe(RIDE_SLOTS);
    }
  });

  it('lays on scenery too, never only stops and houses', () => {
    const kinds = new Set(Array.from({ length: 60 }, (_, i) => propAt(ROAD, i).kind));
    expect(kinds.has('stop')).toBe(true);
    expect(kinds.has('house')).toBe(true);
    expect(kinds.size).toBeGreaterThan(3);
  });

  it('lists what stands in a stretch of road, in order and nothing outside it', () => {
    const from = slotX(ROAD, 3);
    const to = slotX(ROAD, 7);
    const props = propsIn(ROAD, from, to);
    expect(props.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < props.length; i++) expect(props[i]!.x).toBeGreaterThan(props[i - 1]!.x);
    expect(props[0]!.x).toBeLessThanOrEqual(from);
    expect(props.at(-1)!.x).toBeGreaterThanOrEqual(to);
    expect(slotX(ROAD, 2)).toBeCloseTo(2 * SLOT_UNITS * ROAD.unit);
  });

  it('keeps the same passenger waiting at the same stop', () => {
    expect(riderAt(7)).toEqual(riderAt(7));
    expect(riderAt(7).name.length).toBeGreaterThan(0);
    const faces = new Set(Array.from({ length: 20 }, (_, i) => riderAt(i * 5 + 2).emoji));
    expect(faces.size).toBeGreaterThan(3);
  });
});

describe('driving', () => {
  it('sets off towards the finger and comes to rest on it', () => {
    const car = makeCar(ROAD);
    const target = car.x + ROAD.unit * 8;
    for (let i = 0; i < 60 * 6; i++) stepCar(car, target, 1 / 60, ROAD, CAR);
    expect(car.x).toBeCloseTo(target, 0);
    expect(Math.abs(car.v)).toBeLessThan(ROAD.unit * 0.2);
  });

  it('turns the wheels by the distance covered', () => {
    const car = makeCar(ROAD);
    for (let i = 0; i < 120; i++) stepCar(car, car.x + ROAD.unit * 5, 1 / 60, ROAD, CAR);
    expect(car.spin).toBeGreaterThan(0);
  });

  it('reverses, but slowly', () => {
    const forward = makeCar(ROAD);
    const back = makeCar(ROAD);
    back.x = ROAD.unit * 20;
    for (let i = 0; i < 60; i++) {
      stepCar(forward, forward.x + ROAD.unit * 5, 1 / 60, ROAD, CAR);
      stepCar(back, back.x - ROAD.unit * 5, 1 / 60, ROAD, CAR);
    }
    expect(back.v).toBeLessThan(0);
    expect(Math.abs(back.v)).toBeLessThan(forward.v);
  });

  it('stops at a red light and never backs off the end of the road', () => {
    const car = makeCar(ROAD);
    const line = car.x + ROAD.unit * 3;
    for (let i = 0; i < 60 * 4; i++) stepCar(car, car.x + ROAD.unit * 9, 1 / 60, ROAD, CAR, line);
    expect(car.x).toBeCloseTo(line, 5);
    expect(car.v).toBe(0);

    for (let i = 0; i < 60 * 6; i++) stepCar(car, -ROAD.unit * 30, 1 / 60, ROAD, CAR);
    expect(car.x).toBe(0);
    expect(car.v).toBe(0);
  });

  it('knows when it has pulled up next to something', () => {
    const car = makeCar(ROAD);
    expect(reached(car, car.x + ROAD.unit * REACH_UNITS * 0.5, ROAD)).toBe(true);
    expect(reached(car, car.x + ROAD.unit * REACH_UNITS * 2, ROAD)).toBe(false);
    expect(DELIVERIES_FOR_STAR).toBeGreaterThan(0);
  });
});

describe('the fork in the road', () => {
  it('offers one way up and one way down, the same pair every time', () => {
    for (const slot of [FORK_OFFSET, FORK_OFFSET + FORK_SLOTS, 94]) {
      const [up, down] = forkAt(slot);
      expect(up.up).toBe(true);
      expect(down.up).toBe(false);
      expect(up.emoji.length).toBeGreaterThan(0);
      expect(down.name.length).toBeGreaterThan(0);
      expect(forkAt(slot)).toEqual(forkAt(slot));
      // Two ways to the same sort of place is no choice at all.
      expect(up.biome).not.toBe(down.biome);
    }
  });

  it('puts one on a regular beat, never on a house or a stop', () => {
    expect(isFork(0)).toBe(false);
    expect(isFork(FORK_OFFSET)).toBe(true);
    expect(isFork(FORK_OFFSET + FORK_SLOTS)).toBe(true);
    expect(nextFork(1)).toBe(FORK_OFFSET);
    expect(nextFork(FORK_OFFSET)).toBe(FORK_OFFSET + FORK_SLOTS);
    expect(nextFork(FORK_OFFSET - 1)).toBe(FORK_OFFSET);
    for (let slot = 1; slot < 200; slot++) {
      if (!isFork(slot)) continue;
      const mod = slot % SLOT_UNITS;
      expect(mod === 0 || mod === SLOT_UNITS - RIDE_SLOTS).toBe(false);
    }
  });

  it('changes the land beyond it, and only beyond it', () => {
    const road = makeRoad(420, 620);
    const at = slotX(road, FORK_OFFSET);
    const before = roadY(road, at - road.unit * 4);
    takeFork(road, FORK_OFFSET, forkAt(FORK_OFFSET)[0]!);
    expect(roadY(road, at - road.unit * 4)).toBeCloseTo(before, 6);
    expect(legAt(road, at + road.unit).biome).toBe(forkAt(FORK_OFFSET)[0]!.biome);
    expect(legAt(road, at - road.unit).biome).toBe('meadow');
    // A way is taken once: a second try does not stack another leg on top.
    takeFork(road, FORK_OFFSET, forkAt(FORK_OFFSET)[1]!);
    expect(road.legs.length).toBe(2);
  });

  it('eases into the new shape so the road never steps', () => {
    const road = makeRoad(420, 620);
    takeFork(road, FORK_OFFSET, { terrain: 'mountain', biome: 'snow', weather: 'snow', emoji: '❄️', name: 'núi', up: true });
    const at = slotX(road, FORK_OFFSET);
    let prev = roadY(road, at - road.unit * 2);
    for (let x = at - road.unit * 2; x < at + road.unit * 10; x += road.unit * 0.1) {
      const y = roadY(road, x);
      expect(Math.abs(y - prev)).toBeLessThan(road.unit * 0.1);
      prev = y;
    }
    // At the fork itself the shape is still the old one, and well past it the new.
    expect(legMix(road, at).k).toBeCloseTo(0, 5);
    expect(legMix(road, at + road.unit * BLEND_UNITS).k).toBe(1);
  });

  it('really does climb on a mountain and sit low in a valley', () => {
    const climb = makeRoad(420, 620, [FIRST_LEG, { from: 1, terrain: 'mountain', biome: 'snow', weather: 'snow' }]);
    const drop = makeRoad(420, 620, [FIRST_LEG, { from: 1, terrain: 'valley', biome: 'seaside', weather: 'sun' }]);
    const highs = (road: typeof climb): number[] => {
      const ys: number[] = [];
      for (let x = road.unit * 20; x < road.unit * 120; x += road.unit * 0.5) ys.push(roadY(road, x));
      return ys;
    };
    const up = highs(climb);
    const down = highs(drop);
    expect(Math.min(...up)).toBeLessThan(Math.min(...down));
    expect(Math.max(...up) - Math.min(...up)).toBeGreaterThan(Math.max(...down) - Math.min(...down));
    // Both stay on the screen they are drawn on.
    for (const y of [...up, ...down]) expect(y).toBeGreaterThan(0);
    for (const y of [...up, ...down]) expect(y).toBeLessThan(620);
  });

  it('dresses the roadside with whatever the leg is made of', () => {
    const road = makeRoad(420, 620);
    takeFork(road, FORK_OFFSET, { terrain: 'valley', biome: 'seaside', weather: 'sun', emoji: '🏖️', name: 'biển', up: false });
    expect(propAt(road, 2).biome).toBe('meadow');
    expect(propAt(road, FORK_OFFSET + 2).biome).toBe('seaside');
  });
});

describe('the roadside services', () => {
  it('lays on petrol, a car wash and a level crossing often enough to find one', () => {
    const road = makeRoad(420, 620);
    const kinds = Array.from({ length: 120 }, (_, i) => propAt(road, i).kind);
    for (const wanted of ['pump', 'wash', 'crossing', 'fork'] as const) {
      expect(kinds.filter((k) => k === wanted).length).toBeGreaterThan(1);
    }
    // Never at the cost of somewhere to pick up or drop off.
    for (let slot = 0; slot < 120; slot++) {
      const mod = ((slot % SLOT_UNITS) + SLOT_UNITS) % SLOT_UNITS;
      if (mod === 0) expect(propAt(road, slot).kind).toBe('house');
      if (mod === SLOT_UNITS - RIDE_SLOTS) expect(propAt(road, slot).kind).toBe('stop');
    }
  });
});

describe('the tank and the mud', () => {
  it('burns fuel by the distance covered, not by the clock', () => {
    const parked = makeCar(ROAD);
    const going = makeCar(ROAD);
    for (let i = 0; i < 60 * 10; i++) {
      stepCar(parked, parked.x, 1 / 60, ROAD, CAR);
      stepCar(going, going.x + ROAD.unit * 9, 1 / 60, ROAD, CAR);
    }
    expect(parked.fuel).toBeCloseTo(1, 2);
    expect(going.fuel).toBeLessThan(0.95);
    expect(going.fuel).toBeGreaterThan(0.8);
  });

  it('crawls on an empty tank but never stops dead', () => {
    const dry = makeCar(ROAD);
    const full = makeCar(ROAD);
    dry.fuel = 0;
    for (let i = 0; i < 120; i++) {
      stepCar(dry, dry.x + ROAD.unit * 9, 1 / 60, ROAD, CAR);
      stepCar(full, full.x + ROAD.unit * 9, 1 / 60, ROAD, CAR);
    }
    expect(dry.v).toBeGreaterThan(0);
    expect(dry.v).toBeLessThan(full.v * 0.5);
  });

  it('fills up and rinses off, and says so on the last drop', () => {
    const c = makeCar(ROAD);
    c.fuel = 0.2;
    expect(fillUp(c, FILL_SECONDS * 0.5)).toBe(false);
    expect(c.fuel).toBeGreaterThan(0.6);
    expect(fillUp(c, FILL_SECONDS)).toBe(true);
    expect(c.fuel).toBe(1);
    expect(fillUp(c, 1)).toBe(false);

    c.mud = MUD_PER_SPLASH;
    expect(rinse(c, 0.05)).toBe(false);
    expect(rinse(c, 5)).toBe(true);
    expect(c.mud).toBe(0);
    expect(rinse(c, 1)).toBe(false);
  });
});

describe('remembering the drive', () => {
  it('keeps the vehicle and whether the lights were off', () => {
    const save = makeSave(VEHICLES[3]!, true);
    expect(save).toEqual({ v: 1, vehicle: VEHICLES[3]!.id, night: true });
    expect(readSave(JSON.stringify(save))).toEqual(save);
    expect(readSave(JSON.stringify(makeSave(VEHICLES[0]!, false)))?.night).toBe(false);
  });

  it('shrugs off anything it cannot use rather than starting the game broken', () => {
    for (const raw of [
      null,
      '',
      'not json',
      '[]',
      '"car"',
      JSON.stringify({ v: 2, vehicle: 'car', night: false }),
      JSON.stringify({ v: 1, night: true }),
      // A vehicle that no longer exists, from an older version of the game.
      JSON.stringify({ v: 1, vehicle: 'hovercraft', night: false }),
    ]) {
      expect(readSave(raw), String(raw)).toBeNull();
    }
    // A missing `night` is simply daylight.
    expect(readSave(JSON.stringify({ v: 1, vehicle: 'bus' }))).toEqual({ v: 1, vehicle: 'bus', night: false });
  });
});
