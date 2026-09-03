import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { makeRoad, roadY } from './logic';
import {
  BARRIER_SECONDS,
  CROSS_GONE,
  CROSS_SECONDS,
  HURRY_SECONDS,
  JAM_SECONDS,
  TAILGATE_UNITS,
  TRAIN_SECONDS,
  barrierDown,
  crossed,
  crosserFade,
  crosserGone,
  crosserScale,
  crosserY,
  lineFor,
  honkAt,
  makeCrosser,
  makeJam,
  makeTraveller,
  railBlocks,
  railPhase,
  stepCrosser,
  stepTraveller,
  tailOf,
  trainAcross,
} from './traffic';

const ROAD = makeRoad(420, 620);
const TOP = ROAD.unit * 4.6;
const rng = (): (() => number) => mulberry32(3);

describe('everybody else on the road', () => {
  it('makes them all slower than the child, and turns the oncoming ones round', () => {
    const seed = rng();
    for (let i = 0; i < 20; i++) {
      const ahead = makeTraveller(0, 'same', TOP, seed);
      const coming = makeTraveller(0, 'opposite', TOP, seed);
      expect(ahead.v).toBeGreaterThan(0);
      expect(ahead.v).toBeLessThan(TOP);
      expect(coming.v).toBeLessThan(0);
      expect(ahead.body).toMatch(/^#/);
    }
  });

  it('rolls them along and turns their wheels', () => {
    const v = makeTraveller(0, 'same', TOP, rng());
    for (let i = 0; i < 60; i++) stepTraveller(v, 1 / 60, ROAD, TOP);
    expect(v.x).toBeGreaterThan(0);
    expect(v.spin).toBeGreaterThan(0);
  });

  it('holds a jam still, then lets it go by itself', () => {
    const jam = makeJam(ROAD.unit * 10, TOP, rng(), ROAD);
    expect(jam.length).toBe(3);
    for (const v of jam) expect(v.stuck).toBe(JAM_SECONDS);
    const first = jam[0]!;
    const wasAt = first.x;
    for (let i = 0; i < 60 * 2; i++) stepTraveller(first, 1 / 60, ROAD, TOP);
    expect(first.x).toBe(wasAt);
    for (let i = 0; i < 60 * 5; i++) stepTraveller(first, 1 / 60, ROAD, TOP);
    expect(first.x).toBeGreaterThan(wasAt);
  });

  it('gets out of the way when the horn goes, jam and all', () => {
    const jam = makeJam(ROAD.unit * 4, TOP, rng(), ROAD);
    const behind = makeTraveller(-ROAD.unit * 8, 'same', TOP, rng());
    const heard = honkAt(0, [...jam, behind], ROAD);
    expect(heard).toBe(3);
    for (const v of jam) {
      expect(v.stuck).toBe(0);
      expect(v.hurry).toBe(HURRY_SECONDS);
    }
    // Somebody far behind never hears it.
    expect(behind.hurry).toBe(0);
    // And a honked-at car really does go faster than one that was left alone.
    const quiet = makeTraveller(ROAD.unit * 4, 'same', TOP, rng());
    const rushed = makeTraveller(ROAD.unit * 4, 'same', TOP, rng());
    honkAt(0, [rushed], ROAD);
    for (let i = 0; i < 60; i++) {
      stepTraveller(quiet, 1 / 60, ROAD, TOP);
      stepTraveller(rushed, 1 / 60, ROAD, TOP);
    }
    expect(rushed.x).toBeGreaterThan(quiet.x);
  });

  it('stops the child behind the car in front and nobody else', () => {
    const ahead = makeTraveller(ROAD.unit * 6, 'same', TOP, rng());
    const further = makeTraveller(ROAD.unit * 12, 'same', TOP, rng());
    const oncoming = makeTraveller(ROAD.unit * 4, 'opposite', TOP, rng());
    const behind = makeTraveller(-ROAD.unit * 3, 'same', TOP, rng());
    const line = tailOf(0, [further, oncoming, behind, ahead], ROAD);
    expect(line).toBeCloseTo(ahead.x - ROAD.unit * TAILGATE_UNITS, 5);
    expect(tailOf(0, [oncoming, behind], ROAD)).toBeNull();
  });
});

describe('the herd crossing the road', () => {
  it('takes its time, and gets a move on when honked at', () => {
    const slow = makeCrosser(0, rng());
    const quick = makeCrosser(0, rng());
    quick.hurried = true;
    expect(slow.count).toBeGreaterThan(1);
    expect(slow.name.length).toBeGreaterThan(0);
    // Big enough to see: never smaller than a wheel, never bigger than the car.
    expect(slow.size).toBeGreaterThan(0.4);
    expect(slow.size).toBeLessThan(1.1);
    for (let i = 0; i < 60 * 2; i++) {
      stepCrosser(slow, 1 / 60);
      stepCrosser(quick, 1 / 60);
    }
    expect(quick.t).toBeGreaterThan(slow.t);
    expect(crossed(slow)).toBe(false);
    for (let i = 0; i < 60 * CROSS_SECONDS; i++) stepCrosser(slow, 1 / 60);
    expect(crossed(slow)).toBe(true);
  });

  it('walks on into the field and fades out instead of blinking away', () => {
    const c = makeCrosser(0, rng());
    expect(crosserFade(c)).toBe(1);
    expect(crosserScale(c)).toBe(1);
    // Clear of the road, but still there to look at.
    for (let i = 0; i < 60 * CROSS_SECONDS; i++) stepCrosser(c, 1 / 60);
    expect(crossed(c)).toBe(true);
    expect(crosserGone(c)).toBe(false);
    const wandering = crosserY(c, ROAD);
    stepCrosser(c, CROSS_SECONDS * 0.2);
    expect(crosserFade(c)).toBeLessThan(1);
    expect(crosserFade(c)).toBeGreaterThan(0);
    expect(crosserScale(c)).toBeLessThan(1);
    expect(crosserY(c, ROAD)).toBeLessThan(wandering);
    // And eventually gone, without ever running past the end of its walk.
    for (let i = 0; i < 60 * CROSS_SECONDS; i++) stepCrosser(c, 1 / 60);
    expect(crosserGone(c)).toBe(true);
    expect(c.t).toBe(CROSS_GONE);
    expect(crosserFade(c)).toBe(0);
  });

  it('walks from the near verge across to the far side', () => {
    const c = makeCrosser(ROAD.unit * 3, rng());
    const near = crosserY(c, ROAD);
    c.t = 1;
    const far = crosserY(c, ROAD);
    expect(near).toBeGreaterThan(roadY(ROAD, c.x));
    expect(far).toBeLessThan(near);
  });

  it('stands a big animal higher than a small one so both have their feet down', () => {
    const cow = { ...makeCrosser(ROAD.unit * 3, rng()), size: 1 };
    const duckling = { ...cow, size: 0.4 };
    expect(crosserY(cow, ROAD)).toBeLessThan(crosserY(duckling, ROAD));
  });
});

describe('the level crossing', () => {
  it('drops the barrier, runs the train through and lifts it again', () => {
    expect(railPhase(0)).toBe('down');
    expect(barrierDown(0)).toBe(0);
    expect(barrierDown(BARRIER_SECONDS)).toBe(1);
    expect(railPhase(BARRIER_SECONDS + 0.1)).toBe('passing');
    expect(barrierDown(BARRIER_SECONDS + TRAIN_SECONDS * 0.5)).toBe(1);
    expect(railPhase(BARRIER_SECONDS + TRAIN_SECONDS + 0.1)).toBe('up');
    expect(railPhase(99)).toBe('clear');
    expect(barrierDown(99)).toBe(0);
  });

  it('runs the train right across and only while the barrier is down', () => {
    expect(trainAcross(0)).toBeNull();
    expect(trainAcross(99)).toBeNull();
    const entering = trainAcross(BARRIER_SECONDS + 0.01)!;
    const leaving = trainAcross(BARRIER_SECONDS + TRAIN_SECONDS - 0.01)!;
    expect(entering).toBeLessThan(-0.9);
    expect(leaving).toBeGreaterThan(1.9);
  });

  it('holds the car back only while the arm is across the road', () => {
    expect(railBlocks(0)).toBe(false);
    expect(railBlocks(BARRIER_SECONDS)).toBe(true);
    expect(railBlocks(BARRIER_SECONDS + TRAIN_SECONDS * 0.5)).toBe(true);
    expect(railBlocks(99)).toBe(false);
  });
});

describe('what stops everybody', () => {
  const halts = [{ x: ROAD.unit * 10, gap: 1.4 }];

  it('stops each direction on its own side of whatever is in the way', () => {
    const forwards = lineFor(0, 1, halts, ROAD);
    const backwards = lineFor(ROAD.unit * 20, -1, halts, ROAD);
    expect(forwards).toBeCloseTo(ROAD.unit * (10 - 1.4), 5);
    expect(backwards).toBeCloseTo(ROAD.unit * (10 + 1.4), 5);
    // Nothing behind you is in your way.
    expect(lineFor(ROAD.unit * 20, 1, halts, ROAD)).toBeNull();
    expect(lineFor(0, -1, halts, ROAD)).toBeNull();
    // Nor is anything half the road away.
    expect(lineFor(-ROAD.unit * 40, 1, halts, ROAD)).toBeNull();
  });

  it('takes the nearest of several', () => {
    const many = [
      { x: ROAD.unit * 10, gap: 1 },
      { x: ROAD.unit * 4, gap: 1 },
      { x: ROAD.unit * 7, gap: 1 },
    ];
    expect(lineFor(0, 1, many, ROAD)).toBeCloseTo(ROAD.unit * 3, 5);
  });

  it('holds the other traffic at it too, in both lanes', () => {
    const ahead = makeTraveller(ROAD.unit * 4, 'same', TOP, rng());
    const coming = makeTraveller(ROAD.unit * 16, 'opposite', TOP, rng());
    for (let i = 0; i < 60 * 6; i++) {
      stepTraveller(ahead, 1 / 60, ROAD, TOP, halts);
      stepTraveller(coming, 1 / 60, ROAD, TOP, halts);
    }
    expect(ahead.x).toBeCloseTo(ROAD.unit * (10 - 1.4), 5);
    expect(ahead.v).toBe(0);
    expect(coming.x).toBeCloseTo(ROAD.unit * (10 + 1.4), 5);
    expect(coming.v).toBe(0);
    // Take the herd away and they both get going again.
    for (let i = 0; i < 60; i++) {
      stepTraveller(ahead, 1 / 60, ROAD, TOP, []);
      stepTraveller(coming, 1 / 60, ROAD, TOP, []);
    }
    expect(ahead.x).toBeGreaterThan(ROAD.unit * (10 - 1.4));
    expect(coming.x).toBeLessThan(ROAD.unit * (10 + 1.4));
  });
});
