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
