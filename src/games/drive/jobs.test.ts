import { describe, it, expect } from 'vitest';
import { SLOT_UNITS, VEHICLES, homeSlot, riderAt, vehicleById } from './logic';
import { HOP_SECONDS, HOSE_SECONDS, droppedLine, hopAt, jobOf, loadAt, onFire, pickedLine, stepHop, type Hop } from './jobs';

describe('what each vehicle is for', () => {
  it('gives every one of them a job, and a bigger back to the ones that have one', () => {
    for (const v of VEHICLES) {
      const job = jobOf(v);
      expect(job.brief.length).toBeGreaterThan(0);
      expect(job.capacity).toBeGreaterThanOrEqual(0);
    }
    expect(jobOf(vehicleById('car')!).kind).toBe('ride');
    expect(jobOf(vehicleById('bus')!).kind).toBe('ride');
    expect(jobOf(vehicleById('truck')!).kind).toBe('parcel');
    expect(jobOf(vehicleById('tractor')!).kind).toBe('harvest');
    expect(jobOf(vehicleById('fire')!).kind).toBe('fire');
    // The bus is the one that fills up; the fire engine carries nothing at all.
    expect(jobOf(vehicleById('bus')!).capacity).toBeGreaterThan(jobOf(vehicleById('car')!).capacity);
    expect(jobOf(vehicleById('fire')!).capacity).toBe(0);
  });

  it('gives every job something different to carry, always the same thing per stop', () => {
    const seen = new Set<string>();
    for (const kind of ['ride', 'parcel', 'harvest'] as const) {
      for (const slot of [2, 7, 12, 17]) {
        const load = loadAt(kind, slot);
        expect(load.slot).toBe(slot);
        expect(load.home).toBe(homeSlot(slot));
        expect(load.emoji.length).toBeGreaterThan(0);
        expect(load.name.length).toBeGreaterThan(0);
        expect(loadAt(kind, slot)).toEqual(load);
        seen.add(`${kind}:${load.emoji}`);
      }
      // Not every stop holds the same thing.
      expect(new Set([2, 7, 12, 17, 22, 27].map((s) => loadAt(kind, s).emoji)).size).toBeGreaterThan(1);
    }
    expect(loadAt('ride', 7).emoji).toBe(riderAt(7).emoji);
    // A crate is never a passenger.
    expect(loadAt('parcel', 7).emoji).not.toBe(loadAt('harvest', 7).emoji);
  });

  it('says what it is doing, by name, in both directions', () => {
    const load = loadAt('parcel', 7);
    expect(pickedLine('parcel', load)).toContain(load.name);
    expect(droppedLine('parcel', load)).toContain(load.name);
    const rider = loadAt('ride', 7);
    expect(pickedLine('ride', rider)).toContain(rider.name);
    expect(droppedLine('ride', rider)).toContain('về tới nhà');
  });

  it('sets half the houses alight for the fire engine, and takes a moment to put one out', () => {
    const houses = Array.from({ length: 40 }, (_, i) => i * SLOT_UNITS);
    const alight = houses.filter(onFire);
    expect(alight.length).toBeGreaterThan(houses.length * 0.3);
    expect(alight.length).toBeLessThan(houses.length * 0.7);
    expect(onFire(0)).toBe(true);
    expect(onFire(5)).toBe(false);
    expect(HOSE_SECONDS).toBeGreaterThan(0.5);
    expect(HOSE_SECONDS).toBeLessThan(5);
  });
});

describe('getting on and off', () => {
  const hop = (boarding: boolean): Hop => ({
    emoji: '🐰',
    fixedX: 100,
    fixedY: 300,
    carX: 400,
    carY: 280,
    boarding,
    t: 0,
    slot: 2,
    size: 20,
  });

  it('walks the arc along and says when it has landed', () => {
    const h = hop(true);
    expect(stepHop(h, HOP_SECONDS * 0.5)).toBe(false);
    expect(h.t).toBeCloseTo(0.5, 5);
    expect(stepHop(h, HOP_SECONDS)).toBe(true);
    expect(h.t).toBe(1);
    // Landing is announced once, not on every frame after.
    expect(stepHop(h, 1)).toBe(false);
  });

  it('starts at the bus stop and ends on the vehicle when somebody climbs in', () => {
    const h = hop(true);
    const start = hopAt(h, 500, 260, 40);
    expect(start.x).toBeCloseTo(h.fixedX, 5);
    expect(start.y).toBeCloseTo(h.fixedY, 5);
    h.t = 1;
    const end = hopAt(h, 500, 260, 40);
    expect(end.x).toBeCloseTo(500, 5);
    expect(end.y).toBeCloseTo(260, 5);
    // The seat is tracked live: drive on and the arc follows the vehicle.
    h.t = 0.5;
    expect(hopAt(h, 900, 260, 40).x).toBeGreaterThan(hopAt(h, 500, 260, 40).x);
  });

  it('steps down where the vehicle stood and ends at the door when somebody gets out', () => {
    const h = hop(false);
    const start = hopAt(h, 9999, 9999, 40);
    expect(start.x).toBeCloseTo(h.carX, 5);
    expect(start.y).toBeCloseTo(h.carY, 5);
    h.t = 1;
    const end = hopAt(h, 9999, 9999, 40);
    expect(end.x).toBeCloseTo(h.fixedX, 5);
    expect(end.y).toBeCloseTo(h.fixedY, 5);
  });

  it('arcs over the straight line rather than sliding along it, and pops on the way', () => {
    const h = hop(true);
    h.t = 0.5;
    const mid = hopAt(h, 500, 300, 40);
    // Halfway between two points at the same height, but lifted well above them.
    expect(mid.x).toBeCloseTo((h.fixedX + 500) / 2, 5);
    expect(mid.y).toBeLessThan(h.fixedY - 30);
    expect(mid.scale).toBeGreaterThan(1.2);
    h.t = 0;
    expect(hopAt(h, 500, 300, 40).scale).toBeCloseTo(1, 5);
    expect(hopAt(h, 500, 300, 40).spin).toBeCloseTo(0, 5);
    // It turns one way going in and the other way coming out.
    const out = hop(false);
    out.t = 0.5;
    h.t = 0.5;
    expect(Math.sign(hopAt(h, 500, 300, 40).spin)).toBe(-Math.sign(hopAt(out, 500, 300, 40).spin));
  });
});
