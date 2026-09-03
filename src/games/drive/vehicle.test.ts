import { describe, it, expect } from 'vitest';
import { VEHICLES } from './logic';
import { TRAFFIC, drawRig, type Rig, type Shape } from './vehicle';

/** A canvas that refuses nothing and remembers the circles and colours asked for. */
function recorder(): { g: CanvasRenderingContext2D; arcs: { x: number; y: number; r: number }[]; inks: string[] } {
  const arcs: { x: number; y: number; r: number }[] = [];
  const inks: string[] = [];
  const store: Record<string, unknown> = {};
  const g = new Proxy(store, {
    get(target, prop: string) {
      if (prop === 'arc')
        return (x: number, y: number, r: number) => {
          arcs.push({ x, y, r });
        };
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value) {
      if (prop === 'fillStyle' && typeof value === 'string') inks.push(value);
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { g, arcs, inks };
}

const U = 64;
const rig = (shape: Shape, extra: Partial<Rig> = {}): Rig => ({
  shape,
  wheelbase: TRAFFIC[shape].wheelbase,
  height: TRAFFIC[shape].height,
  body: '#ef4444',
  trim: '#b91c1c',
  spin: 0.4,
  dusk: 0,
  clock: 1,
  ...extra,
});

describe('drawing something on wheels', () => {
  it('draws every shape, and every vehicle the child can pick', () => {
    for (const shape of ['car', 'bus', 'truck', 'tractor'] as const) {
      const { g } = recorder();
      expect(() => drawRig(g, U, rig(shape)), shape).not.toThrow();
    }
    for (const v of VEHICLES) {
      const { g } = recorder();
      const ride = drawRig(g, U, {
        shape: v.shape,
        wheelbase: v.wheelbase,
        height: v.height,
        body: v.body,
        trim: v.trim,
        spin: 0,
        dusk: 0.8,
        clock: 0,
        emergency: v.id === 'fire',
      });
      // Somewhere to sit and somewhere to stack, both above the tarmac.
      expect(ride.cabinY, v.id).toBeLessThan(0);
      expect(ride.deckY, v.id).toBeLessThan(0);
      expect(ride.deckW, v.id).toBeGreaterThan(0);
      expect(ride.half, v.id).toBeCloseTo((U * v.wheelbase) / 2, 5);
    }
  });

  it('stands the tractor on one big back wheel, and everything else on a matched pair', () => {
    const wheelsOf = (shape: Shape): number[] => {
      const { g, arcs } = recorder();
      drawRig(g, U, rig(shape));
      // The hubs and spokes share the centre; the tyre is the biggest circle at each x.
      const left = arcs.filter((a) => a.x < 0).map((a) => a.r);
      const right = arcs.filter((a) => a.x > 0).map((a) => a.r);
      return [Math.max(...left), Math.max(...right)];
    };
    const [backCar, frontCar] = wheelsOf('car');
    expect(backCar).toBeCloseTo(frontCar!, 5);
    const [backTractor, frontTractor] = wheelsOf('tractor');
    expect(backTractor).toBeGreaterThan(frontTractor! * 1.5);
    // And it sits on the road with both tyres, not with the big one buried.
    const { g, arcs } = recorder();
    drawRig(g, U, rig('tractor'));
    const tyre = (side: number): { y: number; r: number } => arcs.filter((a) => Math.sign(a.x) === side).sort((a, b) => b.r - a.r)[0]!;
    const back = tyre(-1);
    const front = tyre(1);
    expect(back.y + back.r).toBeCloseTo(front.y + front.r, 5);
  });

  it('lights the glass once it is dark', () => {
    const day = recorder();
    const night = recorder();
    drawRig(day.g, U, rig('bus', { dusk: 0 }));
    drawRig(night.g, U, rig('bus', { dusk: 1 }));
    // Pale blue windows by day; the same windows lit from inside after dark.
    expect(day.inks).toContain('#bae6fd');
    expect(day.inks).not.toContain('#fde68a');
    expect(night.inks).toContain('#fde68a');
    expect(night.inks).not.toContain('#bae6fd');
  });

  it('gives the fire engine its ladder and a beacon that blinks', () => {
    const plain = recorder();
    const engine = recorder();
    drawRig(plain.g, U, rig('truck'));
    drawRig(engine.g, U, rig('truck', { emergency: true, clock: 0.2 }));
    expect(engine.inks).toContain('#ef4444');
    expect(engine.inks).toContain('#fff');
    expect(plain.inks).not.toContain('#fff');
    // Half a beat later the beacon is on its other colour.
    const later = recorder();
    drawRig(later.g, U, rig('truck', { emergency: true, clock: 0.2 + Math.PI / 9 }));
    expect(later.inks).toContain('#fca5a5');
  });
});
