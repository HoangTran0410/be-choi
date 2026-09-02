/**
 * Procedural creatures: the maths that makes a drawn animal move like an animal,
 * shared by the little-world games (`aquarium`, `garden`).
 *
 * The technique is argonaut's animal-proc-anim: a head that leads, and behind it
 * a chain of vertebrae where every joint is held at a fixed distance from the one
 * in front and may not bend past a limit. Those two rules alone are what make a
 * swimming fish look swum rather than slid, and the bend limit is what stops a
 * hard turn from dragging the tail through the head.
 *
 * No DOM and no canvas here: it computes points, and the games stroke them.
 */

export interface Point {
  x: number;
  y: number;
}

/** Shortest signed way round from `from` to `to`. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** `angle`, held within `limit` of `anchor`. */
export function constrainAngle(angle: number, anchor: number, limit: number): number {
  const delta = angleDelta(anchor, angle);
  return Math.abs(delta) <= limit ? angle : anchor + (delta > 0 ? limit : -limit);
}

export interface SpineConfig {
  /** Half-width at each vertebra, head first. Its length is the joint count. */
  widths: readonly number[];
  /** Distance between neighbouring joints. */
  spacing: number;
  /** How far one joint may bend from the one ahead of it, radians. */
  bend: number;
}

/** A body that is a chain of vertebrae rather than one blob. */
export class Spine {
  /** Head first. */
  readonly joints: Point[] = [];
  /** Each joint's forward direction — towards the joint ahead of it. */
  readonly angles: number[] = [];

  constructor(readonly config: SpineConfig) {
    for (let i = 0; i < config.widths.length; i++) {
      this.joints.push({ x: 0, y: 0 });
      this.angles.push(0);
    }
  }

  widthAt(index: number): number {
    return this.config.widths[index] ?? 0;
  }

  /** Lay the whole body straight out behind the head, right now. */
  replant(x: number, y: number, angle: number): void {
    for (let i = 0; i < this.joints.length; i++) {
      const joint = this.joints[i]!;
      this.angles[i] = angle;
      joint.x = x - Math.cos(angle) * this.config.spacing * i;
      joint.y = y - Math.sin(angle) * this.config.spacing * i;
    }
  }

  /**
   * Move the head to `(x, y)` facing `angle` and let the body catch up. One
   * pass, head to tail, re-derived every frame: each joint is a function of the
   * joint ahead of it and nothing else, so nothing can drift.
   */
  follow(x: number, y: number, angle: number): void {
    const head = this.joints[0];
    if (!head) return;
    this.angles[0] = angle;
    head.x = x;
    head.y = y;
    for (let i = 1; i < this.joints.length; i++) {
      const ahead = this.joints[i - 1]!;
      const here = this.joints[i]!;
      const towards = Math.atan2(ahead.y - here.y, ahead.x - here.x);
      const forward = constrainAngle(towards, this.angles[i - 1]!, this.config.bend);
      this.angles[i] = forward;
      here.x = ahead.x - Math.cos(forward) * this.config.spacing;
      here.y = ahead.y - Math.sin(forward) * this.config.spacing;
    }
  }

  /** A point on the body's edge at `offset` from this vertebra's forward. */
  edge(index: number, offset: number): Point {
    const joint = this.joints[index];
    if (!joint) return { x: 0, y: 0 };
    const angle = (this.angles[index] ?? 0) + offset;
    const width = this.widthAt(index);
    return { x: joint.x + Math.cos(angle) * width, y: joint.y + Math.sin(angle) * width };
  }

  /** The closed outline: down one flank, round the tail, up the other, round the snout. */
  outline(): Point[] {
    const ring: Point[] = [];
    const last = this.joints.length - 1;
    for (let i = 0; i <= last; i++) ring.push(this.edge(i, Math.PI / 2));
    ring.push(this.edge(last, Math.PI));
    for (let i = last; i >= 0; i--) ring.push(this.edge(i, -Math.PI / 2));
    for (const offset of [-Math.PI / 3, 0, Math.PI / 3]) ring.push(this.edge(0, offset));
    return ring;
  }
}

/**
 * Two-bone inverse kinematics: given where a leg starts and where its foot is,
 * where does the knee go. `bend` (1 or -1) picks which of the two mirror-image
 * knees to take. Every degenerate case returns a finite point, because a NaN
 * coordinate draws nothing and looks like a missing leg rather than a bug.
 */
export function solveTwoBone(
  hipX: number,
  hipY: number,
  footX: number,
  footY: number,
  upper: number,
  lower: number,
  bend: number,
): Point {
  const dx = footX - hipX;
  const dy = footY - hipY;
  const distance = Math.hypot(dx, dy);
  // A foot on its own hip has no direction to extend along: take one rather than divide by zero.
  if (distance < 1e-6) return { x: hipX + upper, y: hipY };
  const ux = dx / distance;
  const uy = dy / distance;
  // Too far to reach or too close to fold around: a straight leg pointing at the target.
  if (distance >= upper + lower || distance <= Math.abs(upper - lower)) {
    return { x: hipX + ux * upper, y: hipY + uy * upper };
  }
  const along = (distance * distance + upper * upper - lower * lower) / (2 * distance);
  const off = Math.sqrt(Math.max(0, upper * upper - along * along));
  return { x: hipX + ux * along - uy * off * bend, y: hipY + uy * along + ux * off * bend };
}
