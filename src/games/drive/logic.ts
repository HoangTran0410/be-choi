import type { FxKind } from '../../core/audio';
import { ANIMALS, type Item } from '../../core/content';
import { mulberry32 } from '../../core/dom';

/** What the child is driving. Each one is drawn from these numbers and has its own horn. */
export interface Vehicle {
  id: string;
  name: string;
  /** Shown on the picker button. */
  emoji: string;
  /** Body colour and the darker trim under it. */
  body: string;
  trim: string;
  /** Cabin height and wheelbase, both in units. */
  height: number;
  wheelbase: number;
  /** Top speed in units per second. */
  speed: number;
  horn: FxKind;
  /** A box on the back (truck, fire engine), a long cabin (bus), or neither. */
  shape: 'car' | 'bus' | 'truck' | 'tractor';
}

export const VEHICLES: readonly Vehicle[] = [
  { id: 'car', name: 'ô tô', emoji: '🚗', body: '#ef4444', trim: '#b91c1c', height: 0.5, wheelbase: 1.05, speed: 4.6, horn: 'honk', shape: 'car' },
  { id: 'bus', name: 'xe buýt', emoji: '🚌', body: '#f59e0b', trim: '#b45309', height: 0.78, wheelbase: 1.6, speed: 3.6, horn: 'honk', shape: 'bus' },
  { id: 'fire', name: 'xe cứu hoả', emoji: '🚒', body: '#dc2626', trim: '#7f1d1d', height: 0.66, wheelbase: 1.5, speed: 4.2, horn: 'siren', shape: 'truck' },
  { id: 'truck', name: 'xe tải', emoji: '🚚', body: '#3b82f6', trim: '#1d4ed8', height: 0.66, wheelbase: 1.55, speed: 3.8, horn: 'honk', shape: 'truck' },
  { id: 'tractor', name: 'máy cày', emoji: '🚜', body: '#22c55e', trim: '#15803d', height: 0.6, wheelbase: 1.2, speed: 2.6, horn: 'kazoo', shape: 'tractor' },
];

export function vehicleById(id: string): Vehicle | undefined {
  return VEHICLES.find((v) => v.id === id);
}

/** The stretch of world on screen: everything else is measured in `unit`s. */
export interface Road {
  w: number;
  h: number;
  unit: number;
  /** Where the road sits when it is neither climbing nor dropping. */
  ground: number;
}

export function makeRoad(w: number, h: number): Road {
  const unit = Math.min(w, h) / 6.5;
  return { w, h, unit, ground: h * 0.66 };
}

/** Height of the tarmac at world `x`: one long swell with a small ripple on it. */
export function roadY(road: Road, x: number): number {
  return (
    road.ground +
    Math.sin(x / (road.unit * 7)) * road.unit * 0.3 +
    Math.sin(x / (road.unit * 2.9) + 1.7) * road.unit * 0.07
  );
}

/** Slope of the road at world `x`, in radians, so the car leans into the hill. */
export function roadTilt(road: Road, x: number): number {
  const d = road.unit * 0.4;
  return Math.atan2(roadY(road, x + d) - roadY(road, x - d), d * 2);
}

export type PropKind = 'stop' | 'house' | 'tree' | 'bush' | 'light' | 'puddle';

export interface Prop {
  slot: number;
  kind: PropKind;
  /** World x. */
  x: number;
  /** 0 … 1, fixed per slot, so a tree keeps its shape as it scrolls by. */
  seed: number;
}

/** Roadside things stand this many units apart. */
export const SLOT_UNITS = 5;
/** A passenger waits three slots before the house that takes them in. */
export const RIDE_SLOTS = 3;

export function slotX(road: Road, slot: number): number {
  return slot * SLOT_UNITS * road.unit;
}

/**
 * What stands at `slot`. Every fifth slot is a house and the one three before it
 * holds a passenger, so a pick-up always has somewhere to go; the rest is scenery
 * drawn from the slot number, never stored, so the road can run on for ever.
 */
export function propAt(road: Road, slot: number): Prop {
  const rng = mulberry32(slot * 7919 + 13);
  const roll = rng();
  const mod = ((slot % SLOT_UNITS) + SLOT_UNITS) % SLOT_UNITS;
  const kind: PropKind =
    mod === 0
      ? 'house'
      : mod === SLOT_UNITS - RIDE_SLOTS
        ? 'stop'
        : roll < 0.2
          ? 'light'
          : roll < 0.4
            ? 'puddle'
            : roll < 0.72
              ? 'tree'
              : 'bush';
  return { slot, kind, x: slotX(road, slot), seed: rng() };
}

/** Everything standing between world `from` and `to`, in order. */
export function propsIn(road: Road, from: number, to: number): Prop[] {
  const span = SLOT_UNITS * road.unit;
  const first = Math.floor(from / span);
  const last = Math.ceil(to / span);
  const out: Prop[] = [];
  for (let slot = first; slot <= last; slot++) out.push(propAt(road, slot));
  return out;
}

/** The house a passenger picked up at `slot` is going home to. */
export function homeSlot(slot: number): number {
  return slot + RIDE_SLOTS;
}

/** Who is waiting at `slot`. The same animal every time, so the road feels like a place. */
export function riderAt(slot: number): Item {
  const rng = mulberry32(slot * 2654 + 97);
  return ANIMALS[Math.floor(rng() * ANIMALS.length)] ?? ANIMALS[0]!;
}

export interface Car {
  /** World x of the middle of the car. */
  x: number;
  /** Pixels per second, negative when reversing. */
  v: number;
  /** Wheel rotation in radians. */
  spin: number;
}

export function makeCar(road: Road): Car {
  return { x: road.unit * 2, v: 0, spin: 0 };
}

/** How fast the car takes up the speed it wants (per second). */
export const RESPONSE = 3.2;
/** The finger has to be this many units ahead before the car goes flat out. */
export const FULL_THROTTLE = 1.2;
/** Reverse is deliberately slow. */
export const REVERSE_FRACTION = 0.45;
/** Close enough to pick somebody up or drop them off. */
export const REACH_UNITS = 1.1;
/** A red light holds the car for this long, then turns green for good. */
export const RED_MS = 1500;
/** The car is told to stop this far short of a red light. */
export const LIGHT_STOP_UNITS = 1.3;
export const DELIVERIES_FOR_STAR = 2;

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Drive one frame towards `target` (a world x — wherever the finger is). `stopX`
 * is a red light ahead the car may not pass. The road never runs out forwards and
 * ends at 0 going back.
 */
export function stepCar(car: Car, target: number, dt: number, road: Road, vehicle: Vehicle, stopX: number | null = null): void {
  const top = vehicle.speed * road.unit;
  const reach = clamp((target - car.x) / (road.unit * FULL_THROTTLE), -1, 1);
  const want = reach * top * (reach < 0 ? REVERSE_FRACTION : 1);
  car.v += (want - car.v) * Math.min(1, dt * RESPONSE);
  car.x += car.v * dt;
  if (stopX !== null && car.x > stopX) {
    car.x = stopX;
    if (car.v > 0) car.v = 0;
  }
  if (car.x < 0) {
    car.x = 0;
    if (car.v < 0) car.v = 0;
  }
  car.spin += (car.v * dt) / (road.unit * 0.22);
}

/** Is the car level with world `x`? */
export function reached(car: Car, x: number, road: Road): boolean {
  return Math.abs(car.x - x) < road.unit * REACH_UNITS;
}
