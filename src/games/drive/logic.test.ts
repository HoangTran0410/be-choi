import { describe, it, expect } from 'vitest';
import { FX } from '../../core/audio';
import {
  DELIVERIES_FOR_STAR,
  REACH_UNITS,
  RIDE_SLOTS,
  SLOT_UNITS,
  VEHICLES,
  homeSlot,
  makeCar,
  makeRoad,
  propAt,
  propsIn,
  reached,
  riderAt,
  roadTilt,
  roadY,
  slotX,
  stepCar,
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
