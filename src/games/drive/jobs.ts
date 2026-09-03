import { mulberry32 } from '../../core/dom';
import { SLOT_UNITS, homeSlot, riderAt, vehicleById, type Vehicle } from './logic';

/**
 * Every vehicle has its own errand, so picking one up the bottom of the screen
 * changes what the whole road is for: the bus stops are full of parcels when the
 * lorry is out, and the houses are ablaze when the fire engine is.
 */
export type JobKind = 'ride' | 'parcel' | 'harvest' | 'fire';

export interface Job {
  kind: JobKind;
  /** How many things fit in the back at once. */
  capacity: number;
  /** Said when the game opens and when the child swaps to this vehicle. */
  brief: string;
}

const JOBS: Readonly<Record<JobKind, Omit<Job, 'capacity'>>> = {
  ride: { kind: 'ride', brief: 'Đón bạn ở bến rồi chở về nhà nhé!' },
  parcel: { kind: 'parcel', brief: 'Lấy hàng ở kho rồi giao tới từng nhà nhé!' },
  harvest: { kind: 'harvest', brief: 'Gom rau quả ngoài ruộng rồi chở về kho nhé!' },
  fire: { kind: 'fire', brief: 'Nhà nào cháy thì tới xịt nước dập lửa nhé!' },
};

/** The vehicle with this id, for the places that always have one. */
export function vehicleFor(id: string): Vehicle {
  return vehicleById(id) ?? vehicleById('car')!;
}

export function jobOf(vehicle: Vehicle): Job {
  if (vehicle.id === 'fire') return { ...JOBS.fire, capacity: 0 };
  if (vehicle.id === 'truck') return { ...JOBS.parcel, capacity: 3 };
  if (vehicle.id === 'tractor') return { ...JOBS.harvest, capacity: 4 };
  return { ...JOBS.ride, capacity: vehicle.id === 'bus' ? 3 : 1 };
}

/** One thing in the back of the vehicle, on its way somewhere. */
export interface Load {
  /** Where it was picked up. */
  slot: number;
  /** The house it is going to. */
  home: number;
  emoji: string;
  name: string;
}

const PARCELS: readonly { emoji: string; name: string }[] = [
  { emoji: '📦', name: 'thùng hàng' },
  { emoji: '🎁', name: 'hộp quà' },
  { emoji: '🧸', name: 'gấu bông' },
  { emoji: '🪑', name: 'cái ghế' },
  { emoji: '🛏️', name: 'cái giường' },
  { emoji: '📚', name: 'chồng sách' },
];

const CROPS: readonly { emoji: string; name: string }[] = [
  { emoji: '🌾', name: 'bó lúa' },
  { emoji: '🎃', name: 'quả bí' },
  { emoji: '🥕', name: 'củ cà rốt' },
  { emoji: '🌽', name: 'bắp ngô' },
  { emoji: '🍎', name: 'sọt táo' },
  { emoji: '🥬', name: 'bó cải' },
];

/** What is waiting at a pick-up slot for this job. The same thing every time. */
export function loadAt(kind: JobKind, slot: number): Load {
  const home = homeSlot(slot);
  if (kind === 'ride') {
    const rider = riderAt(slot);
    return { slot, home, emoji: rider.emoji, name: rider.name };
  }
  const list = kind === 'parcel' ? PARCELS : CROPS;
  const item = list[Math.floor(mulberry32(slot * 4517 + 61)() * list.length)] ?? list[0]!;
  return { slot, home, emoji: item.emoji, name: item.name };
}

/** Every second house is alight when the fire engine is out. */
export function onFire(slot: number): boolean {
  return slot % (SLOT_UNITS * 2) === 0;
}

/** Holding the hose on a burning house puts it out in this long. */
export const HOSE_SECONDS = 1.8;

/** Said when something is picked up. */
export function pickedLine(kind: JobKind, load: Load): string {
  if (kind === 'ride') return `Chở ${load.name} về nhà nhé!`;
  if (kind === 'parcel') return `Chở ${load.name} đi giao nào!`;
  return `Được ${load.name} rồi, chở về kho thôi!`;
}

/** Said when it is dropped off. */
export function droppedLine(kind: JobKind, load: Load): string {
  if (kind === 'ride') return `${load.name} về tới nhà rồi!`;
  if (kind === 'parcel') return `Giao ${load.name} xong rồi!`;
  return `Cất ${load.name} vào kho rồi!`;
}

// ---- getting on and off ----

/** How long a load takes to hop between the roadside and the back of the vehicle. */
export const HOP_SECONDS = 0.45;
/** How high it arcs on the way, in units. */
export const HOP_LIFT = 0.85;

/**
 * A load in mid-air. One end of the arc never moves — the bus stop it is leaving
 * or the doorway it is going to — and the other is the vehicle: tracked live
 * while something is climbing aboard, frozen where the vehicle stood when
 * something got out, so driving off does not drag the passenger along with it.
 */
export interface Hop {
  emoji: string;
  /** The roadside end, in world x and canvas y. */
  fixedX: number;
  fixedY: number;
  /** Where the vehicle was when somebody stepped down. */
  carX: number;
  carY: number;
  /** Towards the vehicle, or away from it. */
  boarding: boolean;
  /** 0 … 1 along the arc. */
  t: number;
  /** The pick-up point it came from, so the vehicle knows not to draw it yet. */
  slot: number;
  size: number;
}

/** Move a hop on. True on the frame it lands. */
export function stepHop(hop: Hop, dt: number): boolean {
  if (hop.t >= 1) return false;
  hop.t = Math.min(1, hop.t + dt / HOP_SECONDS);
  return hop.t >= 1;
}

/** Where the hop is right now, given where the seat has got to. */
export function hopAt(hop: Hop, seatX: number, seatY: number, lift: number): { x: number; y: number; scale: number; spin: number } {
  const k = hop.t <= 0 ? 0 : hop.t >= 1 ? 1 : hop.t * hop.t * (3 - 2 * hop.t);
  const ax = hop.boarding ? hop.fixedX : hop.carX;
  const ay = hop.boarding ? hop.fixedY : hop.carY;
  const bx = hop.boarding ? seatX : hop.fixedX;
  const by = hop.boarding ? seatY : hop.fixedY;
  const swing = Math.sin(Math.PI * k);
  return {
    x: ax + (bx - ax) * k,
    y: ay + (by - ay) * k - swing * lift,
    scale: 1 + swing * 0.28,
    spin: swing * 0.45 * (hop.boarding ? 1 : -1),
  };
}
