/**
 * The aquarium, with no DOM and no canvas in sight: bodies, brains and the tank
 * they swim in. `index.ts` only draws what this file has already decided.
 *
 * Bodies use the procedural-animation technique from argonaut's
 * animal-proc-anim: a head that leads, and behind it a chain of vertebrae where
 * every joint is held at a fixed distance from the one in front and may not bend
 * past a limit. Those two rules alone are what make a swimming fish look
 * swum rather than slid, and the bend limit is what stops a hard turn from
 * dragging the tail through the head.
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

// ---- who lives in the tank ----

export type CreatureKind = 'fish' | 'jelly' | 'ray' | 'crab';
export type Pattern = 'none' | 'stripes' | 'spots' | 'patches';

export interface Species {
  id: string;
  /** Vietnamese name, spoken when the child taps it. */
  name: string;
  kind: CreatureKind;
  /** Dark side, light belly, and the colour of the fins. */
  back: string;
  belly: string;
  fin: string;
  pattern: Pattern;
  patternColor: string;
  /** Body length, in tank units (one unit is a seventh of the tank's short side). */
  size: number;
  /** Half-widths head to tail, as a fraction of the body length. */
  profile: readonly number[];
  /** Cruising speed, tank units per second. */
  speed: number;
  /** Where in the tank it likes to be: 0 is the surface, 1 is the sand. */
  depth: number;
  /** Towards a finger (1) or away from it (-1). Shy fish are half the fun. */
  curious: number;
  /** How many are in a full tank. */
  count: number;
}

// Half-widths as a fraction of body length: a fish is far longer than it is deep,
// so these top out around a fifth of the length even on the fat ones.
const SLIM = [0.075, 0.115, 0.125, 0.105, 0.075, 0.045, 0.02];
const ROUND = [0.1, 0.165, 0.185, 0.15, 0.1, 0.055, 0.022];
const TALL = [0.11, 0.2, 0.225, 0.17, 0.1, 0.05, 0.02];
const BALL = [0.155, 0.235, 0.255, 0.2, 0.12, 0.06, 0.025];
const LONG = [0.07, 0.105, 0.115, 0.1, 0.08, 0.05, 0.022];
const SHARK = [0.085, 0.145, 0.155, 0.125, 0.085, 0.05, 0.022];

export const SPECIES: readonly Species[] = [
  {
    id: 'goldfish', name: 'cá vàng', kind: 'fish',
    back: '#f97316', belly: '#fed7aa', fin: '#fb923c', pattern: 'none', patternColor: '#fff',
    size: 1.2, profile: ROUND, speed: 0.85, depth: 0.42, curious: 1, count: 2,
  },
  {
    id: 'clown', name: 'cá hề', kind: 'fish',
    back: '#f97316', belly: '#fdba74', fin: '#ea580c', pattern: 'stripes', patternColor: '#ffffff',
    size: 0.95, profile: ROUND, speed: 1.05, depth: 0.58, curious: 1, count: 3,
  },
  {
    id: 'koi', name: 'cá koi', kind: 'fish',
    back: '#fef3c7', belly: '#ffffff', fin: '#fde68a', pattern: 'patches', patternColor: '#f97316',
    size: 1.7, profile: LONG, speed: 0.7, depth: 0.3, curious: 0.5, count: 1,
  },
  {
    id: 'guppy', name: 'cá bảy màu', kind: 'fish',
    back: '#a855f7', belly: '#f0abfc', fin: '#38bdf8', pattern: 'spots', patternColor: '#fde047',
    size: 0.62, profile: SLIM, speed: 1.4, depth: 0.18, curious: 1, count: 4,
  },
  {
    id: 'angel', name: 'cá thần tiên', kind: 'fish',
    back: '#e2e8f0', belly: '#f8fafc', fin: '#fcd34d', pattern: 'stripes', patternColor: '#1e293b',
    size: 1.1, profile: TALL, speed: 0.6, depth: 0.46, curious: -0.5, count: 2,
  },
  {
    id: 'puffer', name: 'cá nóc', kind: 'fish',
    back: '#fbbf24', belly: '#fef3c7', fin: '#f59e0b', pattern: 'spots', patternColor: '#78350f',
    size: 1, profile: BALL, speed: 0.45, depth: 0.68, curious: -1, count: 1,
  },
  {
    id: 'zebra', name: 'cá ngựa vằn', kind: 'fish',
    back: '#38bdf8', belly: '#e0f2fe', fin: '#7dd3fc', pattern: 'stripes', patternColor: '#0c4a6e',
    size: 0.58, profile: SLIM, speed: 1.6, depth: 0.28, curious: 1, count: 4,
  },
  {
    id: 'tang', name: 'cá xanh', kind: 'fish',
    back: '#2563eb', belly: '#60a5fa', fin: '#facc15', pattern: 'none', patternColor: '#fff',
    size: 1.05, profile: TALL, speed: 0.9, depth: 0.54, curious: 0.5, count: 2,
  },
  {
    id: 'shark', name: 'cá mập con', kind: 'fish',
    back: '#64748b', belly: '#e2e8f0', fin: '#475569', pattern: 'none', patternColor: '#fff',
    size: 1.8, profile: SHARK, speed: 0.65, depth: 0.62, curious: -0.3, count: 1,
  },
  {
    id: 'jelly', name: 'con sứa', kind: 'jelly',
    back: '#f0abfc', belly: '#fae8ff', fin: '#e879f9', pattern: 'none', patternColor: '#fff',
    size: 0.85, profile: ROUND, speed: 0.3, depth: 0.22, curious: 0, count: 2,
  },
  {
    id: 'ray', name: 'cá đuối', kind: 'ray',
    back: '#7c3aed', belly: '#ddd6fe', fin: '#a78bfa', pattern: 'spots', patternColor: '#ede9fe',
    size: 1.3, profile: LONG, speed: 0.55, depth: 0.88, curious: 0, count: 1,
  },
  {
    id: 'crab', name: 'con cua', kind: 'crab',
    back: '#ef4444', belly: '#fca5a5', fin: '#b91c1c', pattern: 'none', patternColor: '#fff',
    size: 0.8, profile: ROUND, speed: 0.35, depth: 1, curious: -1, count: 1,
  },
];

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id);
}

/** Vertebrae per body. Enough to curve, few enough to draw two dozen of them. */
export const JOINTS = 7;
/** How far one vertebra may bend from the one ahead, radians. */
export const BEND = Math.PI / 8;

// ---- the tank ----

export interface Tank {
  w: number;
  h: number;
  /** One body unit in pixels. */
  unit: number;
  /** y of the top of the sand. */
  floor: number;
}

export function makeTank(w: number, h: number): Tank {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  return {
    w: width,
    h: height,
    unit: Math.min(width, height) / 7,
    floor: height * 0.86,
  };
}

/** A small tank holds fewer fish, so a phone is never a soup of them. */
export function stocking(tank: Tank): Species[] {
  const room = (tank.w * tank.h) / (520 * 820);
  const share = Math.max(0.45, Math.min(1, room));
  const out: Species[] = [];
  for (const species of SPECIES) {
    // Always at least one of everything: the point is that there are many kinds.
    const n = Math.max(1, Math.round(species.count * share));
    for (let i = 0; i < n; i++) out.push(species);
  }
  return out;
}

export interface Food {
  x: number;
  y: number;
  /** Sink speed, px per second. */
  fall: number;
  wobble: number;
  eaten: boolean;
}

/** How many flakes one press of the food button drops. */
export const FOOD_PER_FEED = 6;
/** A star after this many fish have been said hello to. */
export const STAR_EVERY_TAP = 10;
/** Flakes further than this from a mouth are not noticed. */
export const SMELL = 3.2;
/** A finger this close is worth swimming to (or away from). */
export const NOTICE = 3.6;

export function makeFood(tank: Tank, n = FOOD_PER_FEED, rng: () => number = Math.random): Food[] {
  return Array.from({ length: n }, () => ({
    x: tank.w * (0.15 + rng() * 0.7),
    y: -tank.unit * 0.3 * rng(),
    fall: tank.unit * (0.8 + rng() * 0.6),
    wobble: rng() * Math.PI * 2,
    eaten: false,
  }));
}

/** Where the finger is, and whether it is still down. */
export interface Nudge {
  x: number;
  y: number;
  held: boolean;
}

const TURN = 3.2;

/** One swimming, drifting or scuttling animal. */
export class Creature {
  readonly spine: Spine;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  heading = 0;
  /** Tail-beat phase. */
  phase = 0;
  /** Seconds left of a startled dart. */
  dart = 0;
  /** Seconds left of a happy wiggle (just been fed, or just been said hello to). */
  happy = 0;
  /** Where it is heading when nothing more interesting is happening. */
  private tx = 0;
  private ty = 0;
  /** Body length in px. */
  readonly length: number;

  constructor(
    readonly species: Species,
    tank: Tank,
    rng: () => number = Math.random,
  ) {
    this.length = species.size * tank.unit;
    const widths = species.profile.map((p) => p * this.length);
    this.spine = new Spine({ widths, spacing: this.length / (JOINTS - 1), bend: BEND });
    this.x = tank.w * (0.1 + rng() * 0.8);
    this.y = this.band(tank, rng);
    this.heading = rng() < 0.5 ? 0 : Math.PI;
    this.phase = rng() * Math.PI * 2;
    this.vx = Math.cos(this.heading) * species.speed * tank.unit;
    this.spine.replant(this.x, this.y, this.heading);
    this.wander(tank, rng);
  }

  /** A y inside this species' favourite slice of the tank. */
  private band(tank: Tank, rng: () => number): number {
    const top = tank.h * 0.08;
    const centre = top + (tank.floor - top) * this.species.depth;
    const spread = tank.h * 0.17;
    return Math.max(top, Math.min(tank.floor - this.length * 0.2, centre + (rng() - 0.5) * 2 * spread));
  }

  private wander(tank: Tank, rng: () => number): void {
    this.tx = tank.w * (0.08 + rng() * 0.84);
    this.ty = this.band(tank, rng);
  }

  /** A generous hit box: toddler fingers, not a mouse. */
  hits(px: number, py: number): boolean {
    for (let i = 0; i < this.spine.joints.length; i++) {
      const joint = this.spine.joints[i]!;
      const reach = Math.max(this.spine.widthAt(i) * 1.9, 24);
      if (Math.hypot(px - joint.x, py - joint.y) < reach) return true;
    }
    return false;
  }

  /** Bolt away from `(px, py)` for a moment. */
  startle(px: number, py: number): void {
    const dx = this.x - px;
    const dy = this.y - py;
    const away = Math.hypot(dx, dy) || 1;
    this.vx = (dx / away) * this.species.speed * 2.4;
    this.vy = (dy / away) * this.species.speed * 2.4;
    this.dart = 0.9;
    this.happy = 0.7;
  }

  /**
   * Advance one frame. Returns `true` on the frame it swallows a flake, so the
   * caller can make a sound about it.
   */
  update(dt: number, tank: Tank, foods: readonly Food[], nudge: Nudge | null, rng: () => number = Math.random): boolean {
    const step = Math.min(0.05, Math.max(0, dt));
    this.dart = Math.max(0, this.dart - step);
    this.happy = Math.max(0, this.happy - step);
    if (this.species.kind === 'crab') return this.walk(step, tank, nudge);

    const cruise = this.species.speed * tank.unit * (this.dart > 0 ? 2.3 : 1);
    let goalX = this.tx;
    let goalY = this.ty;

    // A flake in range beats everything; a finger beats wandering.
    const flake = this.nearestFood(foods, tank);
    if (flake) {
      goalX = flake.x;
      goalY = flake.y;
    } else if (nudge?.held && this.species.curious !== 0) {
      const away = Math.hypot(nudge.x - this.x, nudge.y - this.y);
      if (away < NOTICE * tank.unit) {
        const pull = this.species.curious;
        goalX = pull > 0 ? nudge.x : this.x - (nudge.x - this.x);
        goalY = pull > 0 ? nudge.y : this.y - (nudge.y - this.y);
      }
    } else if (Math.hypot(goalX - this.x, goalY - this.y) < tank.unit * 0.6) {
      this.wander(tank, rng);
    }

    const toX = goalX - this.x;
    const toY = goalY - this.y;
    const far = Math.hypot(toX, toY) || 1;
    let wantX = (toX / far) * cruise;
    // Damped, because a fish that climbs as fast as it swims looks like it is falling.
    let wantY = (toY / far) * cruise * 0.55;

    // A jellyfish does not steer, it pulses: mostly up and down, drifting sideways.
    if (this.species.kind === 'jelly') {
      this.phase += step * 1.6;
      const pulse = Math.max(0, Math.sin(this.phase));
      wantX = Math.cos(this.heading) * cruise * 0.4;
      wantY = -pulse * cruise * 1.6 + cruise * 0.5;
    }

    this.vx += (wantX - this.vx) * Math.min(1, TURN * step);
    this.vy += (wantY - this.vy) * Math.min(1, TURN * step);
    this.x += this.vx * step;
    this.y += this.vy * step;
    this.keepIn(tank);

    if (Math.hypot(this.vx, this.vy) > 1) {
      const want = Math.atan2(this.vy, this.vx);
      this.heading += angleDelta(this.heading, want) * Math.min(1, 6 * step);
    }
    if (this.species.kind !== 'jelly') {
      this.phase += step * (4 + (Math.hypot(this.vx, this.vy) / Math.max(1, tank.unit)) * 3);
    }
    this.spine.follow(this.x, this.y, this.heading);
    return this.swallow(foods, tank);
  }

  /** The crab walks the sand and never leaves it. */
  private walk(step: number, tank: Tank, nudge: Nudge | null): boolean {
    const speed = tank.unit * this.species.speed * (this.dart > 0 ? 2.6 : 1);
    if (nudge?.held && Math.abs(nudge.x - this.x) < NOTICE * tank.unit * 0.7) {
      this.vx = Math.sign(this.x - nudge.x || 1) * speed;
    } else if (Math.abs(this.vx) < speed * 0.5) {
      this.vx = (this.vx >= 0 ? 1 : -1) * speed;
    }
    this.x += this.vx * step;
    const margin = this.length * 0.7;
    if (this.x < margin) {
      this.x = margin;
      this.vx = Math.abs(this.vx);
    }
    if (this.x > tank.w - margin) {
      this.x = tank.w - margin;
      this.vx = -Math.abs(this.vx);
    }
    this.y = tank.floor + this.length * 0.16;
    this.heading = this.vx >= 0 ? 0 : Math.PI;
    this.phase += step * Math.abs(this.vx) * 0.09;
    this.spine.replant(this.x, this.y, this.heading);
    return false;
  }

  private nearestFood(foods: readonly Food[], tank: Tank): Food | null {
    if (this.species.kind === 'jelly' || this.species.kind === 'crab') return null;
    let best: Food | null = null;
    let bestAway = SMELL * tank.unit;
    for (const food of foods) {
      if (food.eaten) continue;
      const away = Math.hypot(food.x - this.x, food.y - this.y);
      if (away < bestAway) {
        bestAway = away;
        best = food;
      }
    }
    return best;
  }

  private swallow(foods: readonly Food[], tank: Tank): boolean {
    if (this.species.kind === 'jelly' || this.species.kind === 'crab') return false;
    const mouthX = this.x + Math.cos(this.heading) * this.length * 0.15;
    const mouthY = this.y + Math.sin(this.heading) * this.length * 0.15;
    for (const food of foods) {
      if (food.eaten) continue;
      if (Math.hypot(food.x - mouthX, food.y - mouthY) < Math.max(tank.unit * 0.3, this.length * 0.25)) {
        food.eaten = true;
        this.happy = 0.8;
        return true;
      }
    }
    return false;
  }

  /** Nose the walls away rather than bouncing off them. */
  private keepIn(tank: Tank): void {
    // Nearly a whole body: the head leads, so at a side wall the tail is what pokes out.
    const margin = this.length * 0.95;
    const top = tank.h * 0.05 + this.length * 0.3;
    const bottom = tank.floor - this.length * 0.2;
    if (this.x < margin) {
      this.x = margin;
      this.vx = Math.abs(this.vx);
    }
    if (this.x > tank.w - margin) {
      this.x = tank.w - margin;
      this.vx = -Math.abs(this.vx);
    }
    if (this.y < top) {
      this.y = top;
      this.vy = Math.abs(this.vy);
    }
    if (this.y > bottom) {
      this.y = bottom;
      this.vy = -Math.abs(this.vy);
    }
  }
}

// ---- scenery ----

export interface Plant {
  x: number;
  /** Height in px. */
  h: number;
  /** Half-width at the base, px. */
  w: number;
  hue: number;
  sway: number;
  phase: number;
  blades: number;
}

export function makePlants(tank: Tank, rng: () => number = Math.random): Plant[] {
  const n = Math.max(4, Math.round(tank.w / 110));
  return Array.from({ length: n }, (_, i) => ({
    x: tank.w * ((i + 0.5 + (rng() - 0.5) * 0.6) / n),
    h: tank.unit * (1.5 + rng() * 2.2),
    w: tank.unit * (0.07 + rng() * 0.06),
    hue: 120 + rng() * 60,
    sway: 0.2 + rng() * 0.35,
    phase: rng() * Math.PI * 2,
    blades: 3 + Math.floor(rng() * 3),
  }));
}

export interface Rock {
  x: number;
  r: number;
  squash: number;
  tint: number;
}

export function makeRocks(tank: Tank, rng: () => number = Math.random): Rock[] {
  const n = Math.max(3, Math.round(tank.w / 190));
  return Array.from({ length: n }, () => ({
    x: tank.w * rng(),
    r: tank.unit * (0.18 + rng() * 0.3),
    squash: 0.45 + rng() * 0.3,
    tint: rng(),
  }));
}

export interface Bubble {
  x: number;
  y: number;
  r: number;
  rise: number;
  wobble: number;
}

export function makeBubble(x: number, y: number, tank: Tank, rng: () => number = Math.random): Bubble {
  return {
    x,
    y,
    r: tank.unit * (0.04 + rng() * 0.07),
    rise: tank.unit * (0.7 + rng() * 0.8),
    wobble: rng() * Math.PI * 2,
  };
}
