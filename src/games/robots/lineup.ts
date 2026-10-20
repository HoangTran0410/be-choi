/**
 * Who stands where on the stage. Pure bookkeeping: eight seats, each empty or holding a robot
 * and the level it plays at. Nothing here can be "wrong" — a move that cannot happen just
 * reports that nothing changed and the robot goes back.
 */
import type { Level } from './groove';

export const CAPACITY = 8;

export interface Seat {
  robot: string;
  level: Level;
}

export interface Lineup {
  readonly capacity: number;
  seat(slot: number): Seat | null;
  /** Robot ids on stage, in seat order. */
  robots(): string[];
  count(): number;
  full(): boolean;
  firstEmpty(): number;
  slotOf(robot: string): number;
  /** Put a robot in an empty seat. False if the seat is taken, out of range, or the robot is already on stage. */
  place(slot: number, robot: string, level?: Level): boolean;
  /** Take whoever is in the seat off the stage. */
  remove(slot: number): Seat | null;
  /** Move a robot to another seat; if that seat is taken they swap. Returns what happened. */
  move(from: number, to: number): 'moved' | 'swapped' | 'none';
  /** Next level for the seat: 1 → 2 → 3 → 1. Returns the new level (0 for an empty seat). */
  cycle(slot: number): Level | 0;
  clear(): void;
  /** A copy for saving. */
  snapshot(): (Seat | null)[];
}

const NEXT: Record<Level, Level> = { 1: 2, 2: 3, 3: 1 };

export function createLineup(capacity = CAPACITY): Lineup {
  const seats: (Seat | null)[] = Array.from({ length: capacity }, () => null);
  const inRange = (n: number): boolean => Number.isInteger(n) && n >= 0 && n < capacity;

  return {
    capacity,
    seat: (slot) => (inRange(slot) ? (seats[slot] ?? null) : null),
    robots: () => seats.flatMap((s) => (s ? [s.robot] : [])),
    count: () => seats.filter(Boolean).length,
    full: () => seats.every(Boolean),
    firstEmpty: () => seats.findIndex((s) => !s),
    slotOf: (robot) => seats.findIndex((s) => s?.robot === robot),
    place(slot, robot, level = 2) {
      if (!inRange(slot) || seats[slot] || seats.some((s) => s?.robot === robot)) return false;
      seats[slot] = { robot, level };
      return true;
    },
    remove(slot) {
      if (!inRange(slot)) return null;
      const was = seats[slot] ?? null;
      seats[slot] = null;
      return was;
    },
    move(from, to) {
      if (!inRange(from) || !inRange(to) || from === to || !seats[from]) return 'none';
      const a = seats[from] as Seat;
      const b = seats[to] ?? null;
      seats[to] = a;
      seats[from] = b;
      return b ? 'swapped' : 'moved';
    },
    cycle(slot) {
      const s = inRange(slot) ? seats[slot] : null;
      if (!s) return 0;
      s.level = NEXT[s.level];
      return s.level;
    },
    clear() {
      seats.fill(null);
    },
    snapshot: () => seats.map((s) => (s ? { ...s } : null)),
  };
}
