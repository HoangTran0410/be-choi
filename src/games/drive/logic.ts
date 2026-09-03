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
  {
    id: 'car',
    name: 'ô tô',
    emoji: '🚗',
    body: '#ef4444',
    trim: '#b91c1c',
    height: 0.5,
    wheelbase: 1.05,
    speed: 4.6,
    horn: 'honk',
    shape: 'car',
  },
  {
    id: 'bus',
    name: 'xe buýt',
    emoji: '🚌',
    body: '#f59e0b',
    trim: '#b45309',
    height: 0.78,
    wheelbase: 1.6,
    speed: 3.6,
    horn: 'honk',
    shape: 'bus',
  },
  {
    id: 'fire',
    name: 'xe cứu hoả',
    emoji: '🚒',
    body: '#dc2626',
    trim: '#7f1d1d',
    height: 0.66,
    wheelbase: 1.5,
    speed: 4.2,
    horn: 'siren',
    shape: 'truck',
  },
  {
    id: 'truck',
    name: 'xe tải',
    emoji: '🚚',
    body: '#3b82f6',
    trim: '#1d4ed8',
    height: 0.66,
    wheelbase: 1.55,
    speed: 3.8,
    horn: 'honk',
    shape: 'truck',
  },
  {
    id: 'tractor',
    name: 'máy cày',
    emoji: '🚜',
    body: '#22c55e',
    trim: '#15803d',
    height: 0.6,
    wheelbase: 1.2,
    speed: 2.6,
    horn: 'kazoo',
    shape: 'tractor',
  },
];

export function vehicleById(id: string): Vehicle | undefined {
  return VEHICLES.find((v) => v.id === id);
}

/** Where the vehicle the child last took out, and whether it was dark, is kept. */
export const SAVE_KEY = 'be-choi:drive';

export interface DriveSave {
  v: 1;
  /** Id of the vehicle that was out of the garage. */
  vehicle: string;
  /** Were the lights off? */
  night: boolean;
}

export function makeSave(vehicle: Vehicle, night: boolean): DriveSave {
  return { v: 1, vehicle: vehicle.id, night };
}

/** Read a saved game back, or null if there is nothing usable there. */
export function readSave(raw: string | null): DriveSave | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const save = data as Partial<DriveSave>;
    if (save.v !== 1 || typeof save.vehicle !== 'string') return null;
    if (!vehicleById(save.vehicle)) return null;
    return { v: 1, vehicle: save.vehicle, night: save.night === true };
  } catch {
    return null;
  }
}

// ---- where the road goes ----

/** How the tarmac is shaped along a stretch: flat and easy, or a climb, or a dip. */
export type Terrain = 'flat' | 'hill' | 'mountain' | 'valley';
/** What grows beside it. Changes the colours, the trees and the sky. */
export type Biome = 'meadow' | 'forest' | 'seaside' | 'town' | 'snow' | 'blossom' | 'jungle' | 'autumn';
export type Weather = 'sun' | 'cloud' | 'rain' | 'snow';

/** `lift` moves the whole road up the screen; `amp` is the size of its swells. */
interface Shape {
  lift: number;
  amp: number;
  ripple: number;
}

const SHAPES: Readonly<Record<Terrain, Shape>> = {
  flat: { lift: 0, amp: 0.3, ripple: 0.07 },
  hill: { lift: -0.04, amp: 0.8, ripple: 0.11 },
  mountain: { lift: -0.1, amp: 1.3, ripple: 0.16 },
  valley: { lift: 0.07, amp: 0.45, ripple: 0.05 },
};

/** One stretch of road, from a fork to the next. */
export interface Leg {
  /** Slot the leg starts at. */
  from: number;
  terrain: Terrain;
  biome: Biome;
  weather: Weather;
}

/** The stretch of world on screen: everything else is measured in `unit`s. */
export interface Road {
  w: number;
  h: number;
  unit: number;
  /** Where the road sits when it is neither climbing nor dropping. */
  ground: number;
  /** The legs driven so far, in order, the first one starting at slot 0. */
  legs: Leg[];
}

export const FIRST_LEG: Leg = { from: 0, terrain: 'flat', biome: 'meadow', weather: 'sun' };

export function makeRoad(w: number, h: number, legs: readonly Leg[] = [FIRST_LEG]): Road {
  const unit = Math.min(w, h) / 6.5;
  return { w, h, unit, ground: h * 0.62, legs: legs.length ? legs.map((l) => ({ ...l })) : [{ ...FIRST_LEG }] };
}

/** Roadside things stand this many units apart. */
export const SLOT_UNITS = 5;
/** A passenger waits three slots before the house that takes them in. */
export const RIDE_SLOTS = 3;
/**
 * The road forks every `FORK_SLOTS` slots, `FORK_OFFSET` of them along. The gap
 * is a whole number of houses so a fork can never land on one, or on a stop.
 */
export const FORK_SLOTS = 10;
export const FORK_OFFSET = 4;
/** A new leg eases into its own shape over this many units, so no hill starts with a step. */
export const BLEND_UNITS = 3.5;

export function slotX(road: Road, slot: number): number {
  return slot * SLOT_UNITS * road.unit;
}

/** Index of the leg world `x` falls in. Scans from the end: the car is nearly always on the last one. */
function legIndexAt(road: Road, x: number): number {
  for (let i = road.legs.length - 1; i > 0; i--) {
    if (x >= slotX(road, road.legs[i]!.from)) return i;
  }
  return 0;
}

export function legAt(road: Road, x: number): Leg {
  return road.legs[legIndexAt(road, x)] ?? road.legs[0] ?? FIRST_LEG;
}

/** The leg a slot belongs to, used for dressing the roadside. */
export function legOfSlot(road: Road, slot: number): Leg {
  return legAt(road, slotX(road, slot) + road.unit * 0.01);
}

/**
 * The leg at world `x`, the one before it, and how far the changeover has got:
 * `k` runs 0 → 1 across the first few units of a new leg so nothing — not the
 * hills, not the colours, not the rain — arrives with a step in it.
 */
export interface LegMix {
  leg: Leg;
  before: Leg;
  k: number;
}

export function legMix(road: Road, x: number): LegMix {
  const i = legIndexAt(road, x);
  const leg = road.legs[i] ?? FIRST_LEG;
  const before = road.legs[i - 1] ?? leg;
  if (before === leg) return { leg, before, k: 1 };
  const t = (x - slotX(road, leg.from)) / (road.unit * BLEND_UNITS);
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  return { leg, before, k };
}

/** The shape at world `x`, eased from the previous leg's over the first few units of a new one. */
function shapeAt(road: Road, x: number): Shape {
  const { leg, before, k } = legMix(road, x);
  const here = SHAPES[leg.terrain];
  if (k >= 1) return here;
  const was = SHAPES[before.terrain];
  return {
    lift: was.lift + (here.lift - was.lift) * k,
    amp: was.amp + (here.amp - was.amp) * k,
    ripple: was.ripple + (here.ripple - was.ripple) * k,
  };
}

/** Height of the tarmac at world `x`: one long swell with a small ripple on it. */
export function roadY(road: Road, x: number): number {
  const s = shapeAt(road, x);
  return (
    road.ground +
    s.lift * road.h +
    Math.sin(x / (road.unit * 7)) * road.unit * s.amp +
    Math.sin(x / (road.unit * 2.9) + 1.7) * road.unit * s.ripple
  );
}

/** Slope of the road at world `x`, in radians, so the car leans into the hill. */
export function roadTilt(road: Road, x: number): number {
  const d = road.unit * 0.4;
  return Math.atan2(roadY(road, x + d) - roadY(road, x - d), d * 2);
}

// ---- the fork in the road ----

/** One of the two ways on offer at a fork. */
export interface LegPlan {
  terrain: Terrain;
  biome: Biome;
  weather: Weather;
  /** Big picture on the signpost. */
  emoji: string;
  /** Said out loud when the child picks it. */
  name: string;
  /** Does this way climb or drop? The signs are stacked in that order. */
  up: boolean;
}

const UPHILL: readonly { terrain: Terrain; biome: Biome; emoji: string; name: string }[] = [
  { terrain: 'hill', biome: 'meadow', emoji: '🌄', name: 'lên đồi cỏ' },
  { terrain: 'mountain', biome: 'forest', emoji: '🌲', name: 'lên rừng thông' },
  { terrain: 'mountain', biome: 'snow', emoji: '❄️', name: 'lên núi tuyết' },
  { terrain: 'hill', biome: 'autumn', emoji: '🍁', name: 'lên rừng lá vàng' },
  { terrain: 'mountain', biome: 'jungle', emoji: '🌴', name: 'lên rừng rậm' },
  { terrain: 'hill', biome: 'forest', emoji: '⛰️', name: 'lên đồi cây' },
];

const DOWNHILL: readonly { terrain: Terrain; biome: Biome; emoji: string; name: string }[] = [
  { terrain: 'valley', biome: 'seaside', emoji: '🏖️', name: 'xuống bãi biển' },
  { terrain: 'flat', biome: 'town', emoji: '🏙️', name: 'vào phố' },
  { terrain: 'valley', biome: 'blossom', emoji: '🌸', name: 'xuống cánh đồng hoa' },
  { terrain: 'flat', biome: 'autumn', emoji: '🍂', name: 'ra rừng lá vàng' },
  { terrain: 'valley', biome: 'jungle', emoji: '🦜', name: 'xuống rừng rậm' },
  { terrain: 'flat', biome: 'meadow', emoji: '🛣️', name: 'ra đường cái' },
];

/** Which way the weather goes with a place — a beach is sunny, a snowy peak is not. */
function weatherFor(biome: Biome, roll: number): Weather {
  if (biome === 'snow') return roll < 0.75 ? 'snow' : 'cloud';
  if (biome === 'seaside') return roll < 0.85 ? 'sun' : 'cloud';
  if (biome === 'blossom') return roll < 0.88 ? 'sun' : 'cloud';
  if (biome === 'jungle') return roll < 0.45 ? 'rain' : roll < 0.7 ? 'cloud' : 'sun';
  if (biome === 'autumn') return roll < 0.55 ? 'sun' : roll < 0.85 ? 'cloud' : 'rain';
  if (biome === 'forest') return roll < 0.4 ? 'rain' : roll < 0.75 ? 'cloud' : 'sun';
  if (biome === 'town') return roll < 0.25 ? 'rain' : roll < 0.6 ? 'cloud' : 'sun';
  return roll < 0.7 ? 'sun' : roll < 0.9 ? 'cloud' : 'rain';
}

/** Is there a fork at this slot? Forks never land on a house or a bus stop. */
export function isFork(slot: number): boolean {
  return slot > 0 && (((slot - FORK_OFFSET) % FORK_SLOTS) + FORK_SLOTS) % FORK_SLOTS === 0;
}

/** The first fork strictly after `slot`. */
export function nextFork(slot: number): number {
  return (Math.floor((slot - FORK_OFFSET) / FORK_SLOTS) + 1) * FORK_SLOTS + FORK_OFFSET;
}

/**
 * The two ways on offer at a fork: one always climbs, one always drops, and they
 * never lead to the same sort of place — a choice between two meadows is no
 * choice at all. The same pair every time, so a road driven twice is the same road.
 */
export function forkAt(slot: number): readonly [LegPlan, LegPlan] {
  const rng = mulberry32(slot * 3607 + 41);
  const up = UPHILL[Math.floor(rng() * UPHILL.length)] ?? UPHILL[0]!;
  const others = DOWNHILL.filter((d) => d.biome !== up.biome);
  const down = others[Math.floor(rng() * others.length)] ?? DOWNHILL[0]!;
  return [
    { ...up, up: true, weather: weatherFor(up.biome, rng()) },
    { ...down, up: false, weather: weatherFor(down.biome, rng()) },
  ];
}

/** Take a way at the fork: the road beyond it belongs to the new leg. */
export function takeFork(road: Road, slot: number, plan: LegPlan): void {
  const last = road.legs.at(-1);
  if (last && last.from >= slot) return;
  road.legs.push({ from: slot, terrain: plan.terrain, biome: plan.biome, weather: plan.weather });
}

// ---- what stands beside it ----

export type PropKind = 'stop' | 'house' | 'tree' | 'bush' | 'light' | 'puddle' | 'pump' | 'wash' | 'crossing' | 'fork';

export interface Prop {
  slot: number;
  kind: PropKind;
  /** World x. */
  x: number;
  /** 0 … 1, fixed per slot, so a tree keeps its shape as it scrolls by. */
  seed: number;
  /** Where the slot sits, so a tree in the snow is drawn bare. */
  biome: Biome;
}

/** Services are spread on primes so they never all land together. */
const PUMP_EVERY = 13;
const WASH_EVERY = 17;
const CROSSING_EVERY = 11;

/**
 * What stands at `slot`. Every fifth slot is a house and the one three before it
 * is a pick-up point, so a job always has somewhere to go; every twelfth is a fork.
 * The rest is scenery drawn from the slot number, never stored, so the road can
 * run on for ever.
 */
export function propAt(road: Road, slot: number): Prop {
  const rng = mulberry32(slot * 7919 + 13);
  const roll = rng();
  const mod = ((slot % SLOT_UNITS) + SLOT_UNITS) % SLOT_UNITS;
  const biome = legOfSlot(road, slot).biome;
  // Woods are made of trees: in a forest or a jungle almost every free slot is one.
  const woody = biome === 'jungle' || biome === 'forest';
  const kind: PropKind =
    mod === 0
      ? 'house'
      : mod === SLOT_UNITS - RIDE_SLOTS
        ? 'stop'
        : isFork(slot)
          ? 'fork'
          : slot % PUMP_EVERY === 3
            ? 'pump'
            : slot % WASH_EVERY === 7
              ? 'wash'
              : slot % CROSSING_EVERY === 6
                ? 'crossing'
                : roll < (woody ? 0.07 : 0.16)
                  ? 'light'
                  : roll < (woody ? 0.16 : 0.36)
                    ? 'puddle'
                    : roll < (woody ? 0.88 : 0.72)
                      ? 'tree'
                      : 'bush';
  return { slot, kind, x: slotX(road, slot), seed: rng(), biome };
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

// ---- the car ----

export interface Car {
  /** World x of the middle of the car. */
  x: number;
  /** Pixels per second, negative when reversing. */
  v: number;
  /** Wheel rotation in radians. */
  spin: number;
  /** 1 = brimful, 0 = fumes. It never strands the child, it only crawls. */
  fuel: number;
  /** 0 = shiny, 1 = caked. Puddles add it, the car wash takes it off. */
  mud: number;
}

export function makeCar(road: Road): Car {
  return { x: road.unit * 2, v: 0, spin: 0, fuel: 1, mud: 0 };
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
/** A full tank is this many seconds of flat-out driving. */
export const TANK_SECONDS = 95;
/** On an empty tank the car still goes, at this fraction of its speed. */
export const LIMP_FRACTION = 0.34;
/** A tank fills in about this long, held at the pump. */
export const FILL_SECONDS = 2.6;
/** How dirty one puddle at speed makes the car. */
export const MUD_PER_SPLASH = 0.34;
/** The car wash takes the mud off this fast. */
export const WASH_PER_SECOND = 0.9;

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Drive one frame towards `target` (a world x — wherever the finger is). `stopX`
 * is a red light, a lowered barrier or the back of the car in front, and the car
 * may not pass it. The road never runs out forwards and ends at 0 going back.
 */
export function stepCar(car: Car, target: number, dt: number, road: Road, vehicle: Vehicle, stopX: number | null = null): void {
  const full = vehicle.speed * road.unit;
  const top = full * (car.fuel > 0 ? 1 : LIMP_FRACTION);
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
  car.fuel = Math.max(0, car.fuel - (Math.abs(car.v) / full) * (dt / TANK_SECONDS));
}

/** Hold the nozzle in: the tank comes up, and says so when it is brimful. */
export function fillUp(car: Car, dt: number): boolean {
  const before = car.fuel;
  car.fuel = Math.min(1, car.fuel + dt / FILL_SECONDS);
  return before < 1 && car.fuel >= 1;
}

/** Under the arch: the mud comes off, and says so on the last of it. */
export function rinse(car: Car, dt: number): boolean {
  const before = car.mud;
  car.mud = Math.max(0, car.mud - dt * WASH_PER_SECOND);
  return before > 0 && car.mud <= 0;
}

/** Is the car level with world `x`? */
export function reached(car: Car, x: number, road: Road): boolean {
  return Math.abs(car.x - x) < road.unit * REACH_UNITS;
}
