import { describe, it, expect } from 'vitest';
import { Spine, angleDelta, constrainAngle, solveTwoBone } from './creature';

const BEND = Math.PI / 8;
const finite = (n: number): boolean => Number.isFinite(n);

describe('angles', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5);
    expect(angleDelta(0.2, -0.2)).toBeCloseTo(-0.4);
    // Just past π the short way is backwards, not almost all the way round.
    expect(angleDelta(0, Math.PI + 0.2)).toBeCloseTo(-Math.PI + 0.2);
  });
  it('holds an angle within a limit of its anchor', () => {
    expect(constrainAngle(0.1, 0, 0.5)).toBeCloseTo(0.1);
    expect(constrainAngle(2, 0, 0.5)).toBeCloseTo(0.5);
    expect(constrainAngle(-2, 0, 0.5)).toBeCloseTo(-0.5);
  });
});

describe('spine', () => {
  const spine = (): Spine => new Spine({ widths: [6, 9, 10, 8, 5, 3, 1.5], spacing: 12, bend: BEND });

  it('has one joint per width', () => {
    expect(spine().joints.length).toBe(7);
  });

  it('keeps every link exactly one spacing long, however hard the head turns', () => {
    const s = spine();
    s.replant(100, 100, 0);
    for (let i = 0; i < 200; i++) {
      const angle = Math.sin(i * 0.4) * 3;
      s.follow(100 + i * 3, 100 + Math.sin(i * 0.3) * 40, angle);
    }
    for (let i = 1; i < s.joints.length; i++) {
      const a = s.joints[i - 1]!;
      const b = s.joints[i]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(12, 5);
    }
  });

  it('never lets one vertebra bend past the limit from the one ahead', () => {
    const s = spine();
    s.replant(0, 0, 0);
    for (let i = 0; i < 100; i++) s.follow(Math.cos(i) * 50, Math.sin(i * 1.7) * 50, i);
    for (let i = 1; i < s.angles.length; i++) {
      expect(Math.abs(angleDelta(s.angles[i - 1]!, s.angles[i]!))).toBeLessThanOrEqual(BEND + 1e-9);
    }
  });

  it('lays out straight behind the head when replanted', () => {
    const s = spine();
    s.replant(50, 20, 0);
    expect(s.joints[0]).toEqual({ x: 50, y: 20 });
    expect(s.joints[3]?.x).toBeCloseTo(50 - 36);
    expect(s.joints[3]?.y).toBeCloseTo(20);
  });

  it('outlines a closed ring: both flanks, the tail and a rounded snout', () => {
    const s = spine();
    s.replant(0, 0, 0);
    const ring = s.outline();
    expect(ring.length).toBe(7 + 1 + 7 + 3);
    for (const p of ring) expect(finite(p.x) && finite(p.y)).toBe(true);
  });
});

describe('two-bone IK', () => {
  it('puts the knee where both bones reach', () => {
    const knee = solveTwoBone(0, 0, 30, 0, 20, 20, 1);
    expect(Math.hypot(knee.x, knee.y)).toBeCloseTo(20);
    expect(Math.hypot(knee.x - 30, knee.y)).toBeCloseTo(20);
  });
  it('mirrors with the bend flag', () => {
    const a = solveTwoBone(0, 0, 30, 0, 20, 20, 1);
    const b = solveTwoBone(0, 0, 30, 0, 20, 20, -1);
    expect(a.y).toBeCloseTo(-b.y);
    expect(a.y).not.toBeCloseTo(0);
  });
  it('gives a finite point for every leg it cannot fold', () => {
    const cases = [
      solveTwoBone(0, 0, 500, 0, 20, 20, 1), // far out of reach
      solveTwoBone(0, 0, 0, 0, 20, 20, 1), // foot on the hip
      solveTwoBone(0, 0, 1, 0, 20, 5, 1), // folded up inside itself
      solveTwoBone(0, 0, 40, 0, 20, 20, 1), // exactly straight
    ];
    for (const p of cases) expect(finite(p.x) && finite(p.y)).toBe(true);
  });
});
