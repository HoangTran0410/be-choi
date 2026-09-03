import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { FORK_OFFSET, forkAt, makeRoad, propAt, type Prop } from './logic';
import { jobOf, vehicleFor } from './jobs';
import { POKE_MS, lampsFor, pokeReply, signBoxes, wobble, type Dressing } from './props';

const ROAD = makeRoad(420, 620);

function dressing(clock = 0, pokes = new Map<number, number>()): Dressing {
  return {
    scene: { road: ROAD, camX: 0, clock, dusk: 0 },
    job: jobOf(vehicleFor('car')),
    loads: [],
    served: new Set(),
    doused: new Set(),
    hosing: null,
    pokes,
    lights: new Map(),
    crossings: new Map(),
    chosen: new Map(),
    waved: -9,
    carX: 0,
  };
}

const prop = (kind: Prop['kind'], slot = 1): Prop => ({ slot, kind, x: slot * 5 * ROAD.unit, seed: 0.5, biome: 'meadow' });

describe('prodding the roadside', () => {
  it('gets something back off everything a child would poke', () => {
    const job = jobOf(vehicleFor('car'));
    const kinds = ['tree', 'bush', 'house', 'light', 'puddle', 'pump', 'wash', 'crossing', 'stop'] as const;
    for (const kind of kinds) {
      const reply = pokeReply(prop(kind), job, mulberry32(2));
      expect(reply, kind).not.toBeNull();
      expect(reply!.emoji.length).toBeGreaterThan(0);
      expect(reply!.count).toBeGreaterThan(0);
    }
    // The signpost is for choosing with, not for prodding.
    expect(pokeReply(prop('fork'), job, mulberry32(2))).toBeNull();
  });

  it('drops what actually grows there: coconuts at the coast, snow in the cold', () => {
    const job = jobOf(vehicleFor('car'));
    const at = (biome: Prop['biome']): string => pokeReply({ ...prop('tree'), biome }, job, mulberry32(2))!.emoji;
    expect(at('seaside')).toBe('🥥');
    expect(at('snow')).toBe('❄️');
    expect(['🍎', '🍐', '🍊', '🍃', '🌰']).toContain(at('meadow'));
  });

  it('shows the job at the pick-up point, not always a passenger', () => {
    const seed = (): (() => number) => mulberry32(2);
    expect(pokeReply(prop('stop'), jobOf(vehicleFor('car')), seed())!.emoji).toBe('❤️');
    expect(pokeReply(prop('stop'), jobOf(vehicleFor('truck')), seed())!.emoji).toBe('📦');
    expect(pokeReply(prop('stop'), jobOf(vehicleFor('tractor')), seed())!.emoji).toBe('🌾');
  });

  it('wobbles what was just prodded, and only for a moment', () => {
    const pokes = new Map([[3, 10]]);
    expect(wobble(dressing(10, pokes), 3)).toBeCloseTo(0, 5);
    expect(Math.abs(wobble(dressing(10.1, pokes), 3))).toBeGreaterThan(0);
    expect(wobble(dressing(10 + POKE_MS / 1000 + 0.1, pokes), 3)).toBe(0);
    expect(wobble(dressing(10, pokes), 4)).toBe(0);
  });
});

describe('the signposts at the fork', () => {
  it('puts the two boards apart, high one up and low one down, big enough for a finger', () => {
    const fork = propAt(ROAD, FORK_OFFSET);
    expect(fork.kind).toBe('fork');
    const [up, down] = signBoxes(dressing(), fork, 200, 400) as [ReturnType<typeof signBoxes>[0], ReturnType<typeof signBoxes>[0]];
    expect(up.plan).toEqual(forkAt(FORK_OFFSET)[0]);
    expect(down.plan).toEqual(forkAt(FORK_OFFSET)[1]);
    expect(up.y).toBeLessThan(down.y);
    expect(Math.hypot(up.x - down.x, up.y - down.y)).toBeGreaterThan(up.r + down.r);
    expect(up.r).toBeGreaterThan(ROAD.unit * 0.4);
  });
});

describe('the lights left on at night', () => {
  it('lights the windows, the pump and the car wash, and nothing that has no bulb', () => {
    for (const kind of ['house', 'pump', 'wash'] as const) {
      const lamps = lampsFor(prop(kind), 100, 400, ROAD.unit);
      expect(lamps.length, kind).toBeGreaterThan(0);
      for (const lamp of lamps) expect(lamp.r).toBeGreaterThan(0);
    }
    for (const kind of ['tree', 'bush', 'puddle'] as const) {
      expect(lampsFor(prop(kind), 100, 400, ROAD.unit)).toEqual([]);
    }
  });
});
