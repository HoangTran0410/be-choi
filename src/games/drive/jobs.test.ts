import { describe, it, expect } from 'vitest';
import { SLOT_UNITS, VEHICLES, homeSlot, riderAt, vehicleById } from './logic';
import { HOSE_SECONDS, droppedLine, jobOf, loadAt, onFire, pickedLine } from './jobs';

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
