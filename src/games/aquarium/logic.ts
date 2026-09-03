/**
 * The aquarium, with no DOM and no canvas in sight: who lives in the tank, how
 * they behave and the water they behave in. `index.ts` only draws what this file
 * has already decided; the bodies themselves come from `core/creature`.
 */
import { Spine, angleDelta } from '../../core/creature';
import { pick } from '../../core/dom';

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
    size: 1.3, profile: LONG, speed: 0.55, depth: 0.78, curious: 0, count: 1,
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

/** How many animals a fresh tank starts with. A small tank starts with fewer. */
export const STARTER_MIN = 4;
export const STARTER_MAX = 7;

/**
 * What is already swimming when the child arrives: a handful of different
 * animals, no two the same. The tank used to open with one of every species and
 * a soup of them at that — which left nothing to add and nowhere to put it.
 * Filling it up is the child's job now.
 */
export function stocking(tank: Tank, rng: () => number = Math.random): Species[] {
  const room = (tank.w * tank.h) / (520 * 820);
  const n = Math.round(Math.max(STARTER_MIN, Math.min(STARTER_MAX, STARTER_MIN + room * 2)));
  return pick(SPECIES, Math.min(n, SPECIES.length), rng);
}

export interface Food {
  x: number;
  y: number;
  /** Sink speed, px per second. */
  fall: number;
  wobble: number;
  eaten: boolean;
  /**
   * Bait on a hook. Fish come to it exactly as they come to a flake, and then
   * nothing happens: swallowing it is not theirs to decide, it is the hook's.
   */
  bait?: boolean;
}

/** How many flakes one press of the food button drops. */
export const FOOD_PER_FEED = 6;
/**
 * The most flakes the water holds at once. The button may be pressed as often
 * as a child likes, and a child likes often; without a ceiling a minute of
 * happy pressing is several hundred flakes falling through the tank.
 */
export const MAX_FOOD = 36;
/** A star after this many fish have been said hello to. */
export const STAR_EVERY_TAP = 10;
/** Flakes further than this from a mouth are not noticed. */
export const SMELL = 3.2;
/** A finger this close is worth swimming to (or away from). */
export const NOTICE = 3.6;

/**
 * Another handful on top of what is already falling, up to what the water will
 * hold. Adding rather than replacing: the flakes a fish is already swimming
 * towards should not vanish because the button was pressed again.
 */
export function addFood(foods: readonly Food[], tank: Tank, rng: () => number = Math.random): Food[] {
  const room = Math.max(0, MAX_FOOD - foods.length);
  return [...foods, ...makeFood(tank, Math.min(FOOD_PER_FEED, room), rng)];
}

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

// ---- how a fish feels ----

/**
 * A fish is never just "swimming". It is frightened, or it wants feeding, or it
 * has just been made a fuss of — and a two-year-old can read all three off the
 * screen long before they can read a word. The strongest feeling wins.
 */
export type Mood = 'scared' | 'excited' | 'hungry' | 'calm';

/** Seconds from a full belly to a fish that wants feeding. */
export const FULL_FOR = 70;
/** Hunger past this shows: the fish rises towards the surface and eats faster. */
export const HUNGRY_AT = 0.55;
/** How long a fright lasts. Long enough to reach cover, short enough to come back out. */
export const FEAR_SECONDS = 3.6;
/** How long the fuss after being fed, greeted or put down lasts. */
export const JOY_SECONDS = 1.4;
/** With the lights out a fish drifts at about this much of its usual pace. */
export const NIGHT_PACE = 0.45;
/** …and gets hungry at about this much of its usual rate. */
export const NIGHT_APPETITE = 0.3;
/** A frightened fish looks for cover no further away than this, in tank units. */
export const SHELTER_REACH = 5;
/**
 * More than this many animals and a phone starts dropping frames: every one of
 * them is a spine, a gradient and a look at everybody else, every frame.
 */
export const MAX_CREATURES = 30;

/**
 * Which one goes, when a full tank has to make room. The commonest kind loses a
 * member — six clownfish will not miss one — and of those the one that has been
 * in longest. Never the only one of its kind: what a child would notice missing
 * is the fish there was just one of.
 */
export function crowdedOut(ids: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  let worst = -1;
  let most = 0;
  ids.forEach((id, i) => {
    const n = counts.get(id) ?? 0;
    if (n > most) {
      most = n;
      worst = i;
    }
  });
  return worst;
}

/**
 * Keep a tank down to what a phone can draw, making room rather than turning
 * arrivals away: a child who has just caught a fish should find it swimming.
 */
export function trimStock<T>(fish: readonly T[], idOf: (item: T) => string = String): T[] {
  const out = [...fish];
  while (out.length > MAX_CREATURES) {
    const goes = crowdedOut(out.map(idOf));
    out.splice(goes >= 0 ? goes : 0, 1);
  }
  return out;
}
/** A poked plant or ornament is worth a look for this long. */
export const INTEREST_SECONDS = 2.6;

// ---- how they get on with each other ----

/** Fish up to this body length shoal; the big ones travel alone. */
export const SHOAL_MAX_SIZE = 1.05;
/** How far a fish looks for company, in tank units. */
export const SHOAL_RANGE = 2.8;
/** Body lengths of elbow room every animal wants, whatever it is. */
export const PERSONAL_SPACE = 1.1;
/** A neighbour this many times longer is worth keeping clear of. */
export const BIG_RATIO = 1.7;
/** How hard shoaling pulls, against the fish's own errand. */
export const SHOAL_WEIGHT = 0.55;

/** Somewhere a frightened fish can tuck itself out of sight. */
export interface Shelter {
  x: number;
  y: number;
  /** Close enough to count as hidden. */
  r: number;
}

/**
 * Every plant and every ornament big enough to get behind. Cover comes out of
 * the scenery that is already there, so hiding always looks like hiding
 * *somewhere* rather than stopping in open water.
 */
export function sheltersFrom(tank: Tank, plants: readonly Plant[], decor: readonly Decor[]): Shelter[] {
  const out: Shelter[] = plants.map((plant) => ({
    x: plant.x,
    y: tank.floor - plant.h * 0.55,
    r: Math.max(tank.unit * 0.5, plant.h * 0.4),
  }));
  for (const d of decor) {
    if (d.kind === 'chest' || d.kind === 'hoop') continue;
    out.push({ x: d.x, y: tank.floor - d.size * tank.unit * 0.45, r: d.size * tank.unit * 0.55 });
  }
  return out;
}

/** The nearest cover within `SHELTER_REACH`, or null when there is none. */
export function nearestShelter(shelters: readonly Shelter[], x: number, y: number, tank: Tank): Shelter | null {
  let best: Shelter | null = null;
  let bestAway = SHELTER_REACH * tank.unit;
  for (const shelter of shelters) {
    const away = Math.hypot(shelter.x - x, shelter.y - y);
    if (away < bestAway) {
      bestAway = away;
      best = shelter;
    }
  }
  return best;
}

/** Something that just happened and is worth swimming over to look at. */
export interface Interest {
  x: number;
  y: number;
  /** Seconds left before the fish lose interest. */
  life: number;
}

/** Everything outside a fish that it might react to on a given frame. */
export interface World {
  foods: readonly Food[];
  nudge: Nudge | null;
  shelters?: readonly Shelter[];
  /** A plant that was just rustled, an ornament that was just poked. */
  interest?: Interest | null;
  /** Everybody else in the tank, so they can shoal, keep apart and take fright together. */
  neighbours?: readonly Creature[];
  /**
   * How far the food carries, against a flake's usual reach. Bait on a hook is
   * worth crossing a lake for; a flake is not.
   */
  smell?: number;
  /** Lights out: everybody slows down, and nobody gets hungry very fast. */
  night?: boolean;
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
  /** Seconds left of a fright: darting, then hiding. */
  fear = 0;
  /** Seconds left of a fuss — just fed, just greeted, just put back down. */
  joy = 0;
  /** 0 after a meal, 1 when it really wants feeding. */
  hunger = 0;
  /** Held in the child's fingers: it goes where the finger goes. */
  held = false;
  /** Tucked into cover and keeping still. */
  hiding = false;
  /** Seconds of giddy spinning after being put down. */
  dizzy = 0;
  /** The cover it is making for, while frightened. */
  private den: Shelter | null = null;
  /** What frightened it, so it (and its neighbours) can keep away from it. */
  frightX = 0;
  frightY = 0;
  /** Where it is heading when nothing more interesting is happening. */
  private tx = 0;
  private ty = 0;
  /** Body length in px. */
  readonly length: number;

  constructor(
    readonly species: Species,
    tank: Tank,
    rng: () => number = Math.random,
    spawn?: { x: number; y: number },
  ) {
    this.length = species.size * tank.unit;
    const widths = species.profile.map((p) => p * this.length);
    this.spine = new Spine({ widths, spacing: this.length / (JOINTS - 1), bend: BEND });
    this.x = spawn ? spawn.x : tank.w * (0.1 + rng() * 0.8);
    this.y = spawn ? spawn.y : this.band(tank, rng);
    this.heading = rng() < 0.5 ? 0 : Math.PI;
    this.phase = rng() * Math.PI * 2;
    this.vx = Math.cos(this.heading) * species.speed * tank.unit;
    this.spine.replant(this.x, this.y, this.heading);
    this.wander(tank, rng);
  }

  /**
   * What this fish is feeling, strongest first. Fright beats everything, then a
   * fuss, then an empty stomach.
   */
  get mood(): Mood {
    if (this.fear > 0) return 'scared';
    if (this.joy > 0) return 'excited';
    if (this.hunger >= HUNGRY_AT) return 'hungry';
    return 'calm';
  }

  /**
   * Can it go and get a flake? A fish or a ray swims to one and a crab walks to
   * one; a jellyfish has no say in where it goes and only eats what drifts into
   * it. Anything that cannot feed itself must not get hungry either, or it wears
   * an empty-stomach face for ever.
   */
  get forages(): boolean {
    return this.species.kind !== 'jelly';
  }

  /** Small fish travel together; a shark, a ray or a jellyfish does not. */
  get shoals(): boolean {
    return this.species.kind === 'fish' && this.species.size <= SHOAL_MAX_SIZE;
  }

  /**
   * A y inside this species' favourite slice of the tank. A hungry fish drifts
   * up towards where food comes from, which is what a hungry tank looks like:
   * everyone at the top, waiting.
   */
  private band(tank: Tank, rng: () => number): number {
    const top = tank.h * 0.08;
    const pull = this.hunger >= HUNGRY_AT ? 0.45 : 1;
    const centre = top + (tank.floor - top) * this.species.depth * pull;
    const spread = tank.h * 0.17;
    return Math.max(top, Math.min(tank.floor - this.length * 0.2, centre + (rng() - 0.5) * 2 * spread));
  }

  /** Picked up. It stops swimming and simply goes where the finger goes. */
  hold(px: number, py: number): void {
    this.held = true;
    this.hiding = false;
    this.den = null;
    this.x = px;
    this.y = py;
  }

  /** Put back in the water: a giddy moment, then off it goes. */
  release(): void {
    if (!this.held) return;
    this.held = false;
    this.dizzy = 1.1;
    this.joy = JOY_SECONDS;
  }

  /** Fed. A full fish is a happy fish, and stops crowding the surface. */
  feed(): void {
    this.hunger = 0;
    this.joy = JOY_SECONDS;
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

  /**
   * Bolt away from `(px, py)`, then go and hide. `hard` is a real fright — a
   * neighbour being lifted out of the water — rather than a friendly prod.
   */
  startle(px: number, py: number, hard = false): void {
    if (this.held) return;
    const dx = this.x - px;
    const dy = this.y - py;
    const away = Math.hypot(dx, dy) || 1;
    this.vx = (dx / away) * this.species.speed * 2.4;
    this.vy = (dy / away) * this.species.speed * 2.4;
    this.frightX = px;
    this.frightY = py;
    this.fear = hard ? FEAR_SECONDS : FEAR_SECONDS * 0.35;
    // A prod from a child it knows is half a fright and half a game.
    if (!hard) this.joy = JOY_SECONDS * 0.5;
    this.den = null;
  }

  /**
   * Advance one frame. Returns `true` on the frame it swallows a flake, so the
   * caller can make a sound about it.
   */
  update(dt: number, tank: Tank, world: World, rng: () => number = Math.random): boolean {
    const step = Math.min(0.05, Math.max(0, dt));
    this.fear = Math.max(0, this.fear - step);
    this.joy = Math.max(0, this.joy - step);
    this.dizzy = Math.max(0, this.dizzy - step);
    // Asleep, more or less: a resting fish burns very little.
    const resting = world.night === true;
    if (!this.held && this.forages) {
      this.hunger = Math.min(1, this.hunger + (step / FULL_FOR) * (resting ? NIGHT_APPETITE : 1));
    }
    if (this.fear === 0) {
      this.hiding = false;
      this.den = null;
    }
    this.catchFright(tank, world.neighbours ?? []);

    // Held: it goes where the finger goes. index.ts has already moved it there,
    // so all that is left is to keep the body alive in the child's hand.
    if (this.held) {
      this.phase += step * 9;
      this.heading += angleDelta(this.heading, -Math.PI / 2) * Math.min(1, 4 * step);
      this.spine.follow(this.x, this.y, this.heading);
      return false;
    }

    if (this.species.kind === 'crab') return this.walk(step, tank, world.nudge, world.foods, resting);

    const goal = this.aim(tank, world, rng);
    const cruise = this.cruise(tank) * (resting ? NIGHT_PACE : 1);

    const toX = goal.x - this.x;
    const toY = goal.y - this.y;
    const far = Math.hypot(toX, toY) || 1;
    // Tucked in: keep low and let the fright pass — but keep moving, because a
    // fish frozen mid-water reads as a broken game, not as a frightened animal.
    const ease = this.hiding ? 0.45 : 1;
    let wantX = (toX / far) * cruise * ease;
    // Damped, because a fish that climbs as fast as it swims looks like it is falling.
    let wantY = (toY / far) * cruise * 0.55 * ease;

    // A jellyfish does not steer, it pulses: mostly up and down, drifting sideways.
    if (this.species.kind === 'jelly') {
      this.phase += step * 1.6;
      const pulse = Math.max(0, Math.sin(this.phase));
      wantX = Math.cos(this.heading) * cruise * 0.4;
      wantY = -pulse * cruise * 1.6 + cruise * 0.5;
    }

    // What the neighbours are doing, on top of wherever this fish was going.
    const crowd = this.neighbours(tank, world.neighbours ?? []);
    wantX += crowd.x * cruise;
    wantY += crowd.y * cruise * 0.55;

    this.vx += (wantX - this.vx) * Math.min(1, TURN * step);
    this.vy += (wantY - this.vy) * Math.min(1, TURN * step);
    this.x += this.vx * step;
    this.y += this.vy * step;
    this.keepIn(tank);

    if (Math.hypot(this.vx, this.vy) > 1) {
      const want = Math.atan2(this.vy, this.vx);
      this.heading += angleDelta(this.heading, want) * Math.min(1, 6 * step);
    }
    // Just put down: one giddy loop before it remembers which way is forward.
    if (this.dizzy > 0) this.heading += step * 6 * this.dizzy;
    if (this.species.kind !== 'jelly') {
      const beat = this.mood === 'excited' ? 8 : this.hiding ? 1.5 : resting ? 1.8 : 4;
      this.phase += step * (beat + (Math.hypot(this.vx, this.vy) / Math.max(1, tank.unit)) * 3);
    }
    this.spine.follow(this.x, this.y, this.heading);
    return this.swallow(world.foods, tank);
  }

  /**
   * Everything the other animals in the tank do to this one, as one nudge:
   *
   * - nobody crowds anybody, whatever species they are;
   * - anything much bigger gets a wide berth;
   * - small fish of a kind keep together, face the same way and close the gap.
   *
   * The three shoaling rules are the usual ones, and out of them comes a shoal
   * that turns as a body — the thing that makes a tank look alive rather than
   * like a dozen fish who happen to share a room.
   */
  private neighbours(tank: Tank, others: readonly Creature[]): { x: number; y: number } {
    if (this.held || this.species.kind === 'jelly') return { x: 0, y: 0 };
    const range = SHOAL_RANGE * tank.unit;
    let sepX = 0;
    let sepY = 0;
    let alignX = 0;
    let alignY = 0;
    let towardX = 0;
    let towardY = 0;
    let mates = 0;

    for (const other of others) {
      if (other === this || other.held) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const away = Math.hypot(dx, dy);
      if (away < 0.001 || away > range) continue;
      const ux = dx / away;
      const uy = dy / away;

      const elbow = PERSONAL_SPACE * (this.length + other.length) * 0.5;
      if (away < elbow) {
        const push = 1 - away / elbow;
        sepX -= ux * push;
        sepY -= uy * push;
      }

      if (other.length > this.length * BIG_RATIO) {
        // Give the big one room. Not a fright, just good sense.
        const wary = 1 - away / range;
        sepX -= ux * wary * 1.4;
        sepY -= uy * wary * 1.4;
        continue;
      }

      if (this.shoals && other.shoals && other.species.id === this.species.id) {
        mates++;
        alignX += other.vx;
        alignY += other.vy;
        towardX += dx;
        towardY += dy;
      }
    }

    let x = sepX * 1.5;
    let y = sepY * 1.5;
    if (mates > 0) {
      const speed = Math.hypot(alignX, alignY) || 1;
      x += (alignX / speed) * SHOAL_WEIGHT;
      y += (alignY / speed) * SHOAL_WEIGHT;
      const pull = Math.hypot(towardX, towardY) || 1;
      x += (towardX / pull) * SHOAL_WEIGHT * 0.8;
      y += (towardY / pull) * SHOAL_WEIGHT * 0.8;
    }
    // Cap it: the shoal is a suggestion, never a tow rope.
    const size = Math.hypot(x, y);
    const cap = 1.2;
    return size > cap ? { x: (x / size) * cap, y: (y / size) * cap } : { x, y };
  }

  /**
   * One neighbour bolting is reason enough. Only a fresh fright spreads, and it
   * spreads weaker than it arrived, so a tank never panics itself empty.
   */
  private catchFright(tank: Tank, others: readonly Creature[]): void {
    if (this.held || this.fear > 0) return;
    for (const other of others) {
      if (other === this || other.fear < FEAR_SECONDS * 0.8) continue;
      if (Math.hypot(other.x - this.x, other.y - this.y) > tank.unit * 1.8) continue;
      this.startle(other.frightX, other.frightY);
      return;
    }
  }

  /** How fast it is going right now, mood included. */
  private cruise(tank: Tank): number {
    let speed = this.species.speed * tank.unit;
    if (this.fear > 0 && !this.hiding) speed *= 2.3;
    else if (this.mood === 'excited') speed *= 1.35;
    else if (this.mood === 'hungry') speed *= 1.2;
    return speed;
  }

  /**
   * Where it wants to be this frame. Fright first — nothing is worth eating
   * while something enormous is in the water — then food, then whatever the
   * child is doing, then simply somewhere else.
   */
  private aim(tank: Tank, world: World, rng: () => number): { x: number; y: number } {
    if (this.fear > 0) {
      this.den ??= nearestShelter(world.shelters ?? [], this.x, this.y, tank);
      if (this.den) {
        this.hiding = Math.hypot(this.den.x - this.x, this.den.y - this.y) < this.den.r;
        return this.den;
      }
      // Nowhere to hide: keep swimming away from whatever it was. Heading for the
      // old wander target instead would leave it sitting still the moment it
      // arrived, which looks like the tank has stopped rather than like fear.
      const dx = this.x - this.frightX;
      const dy = this.y - this.frightY;
      const away = Math.hypot(dx, dy) || 1;
      return { x: this.x + (dx / away) * tank.unit * 4, y: this.y + (dy / away) * tank.unit * 2 };
    }

    // A hungry fish smells further and will cross the tank for a flake.
    const flake = this.nearestFood(world.foods, tank, world.smell ?? 1);
    if (flake) return { x: flake.x, y: flake.y };

    const nudge = world.nudge;
    if (nudge?.held && this.species.curious !== 0) {
      const away = Math.hypot(nudge.x - this.x, nudge.y - this.y);
      if (away < NOTICE * tank.unit) {
        // Shy fish swim the other way; hungry ones come to anything, hoping it is food.
        const pull = this.hunger >= HUNGRY_AT ? 1 : this.species.curious;
        if (pull > 0) return { x: nudge.x, y: nudge.y };
        return { x: this.x - (nudge.x - this.x), y: this.y - (nudge.y - this.y) };
      }
    }

    // Something was just poked: the nosy ones go and have a look.
    const interest = world.interest;
    if (interest && interest.life > 0 && this.species.curious > 0) {
      const away = Math.hypot(interest.x - this.x, interest.y - this.y);
      if (away < NOTICE * tank.unit * 2.2) return { x: interest.x, y: interest.y };
    }

    if (Math.hypot(this.tx - this.x, this.ty - this.y) < tank.unit * 0.6) this.wander(tank, rng);
    return { x: this.tx, y: this.ty };
  }

  /** The crab walks the sand and never leaves it. */
  private walk(step: number, tank: Tank, nudge: Nudge | null, foods: readonly Food[], resting = false): boolean {
    const speed = tank.unit * this.species.speed * (this.fear > 0 ? 2.6 : resting ? NIGHT_PACE : 1);
    // A crab is a scavenger: it goes along the sand for whatever landed there.
    const crumb = this.fear > 0 ? null : this.crumbOnSand(foods, tank);
    if (nudge?.held && Math.abs(nudge.x - this.x) < NOTICE * tank.unit * 0.7) {
      this.vx = Math.sign(this.x - nudge.x || 1) * speed;
    } else if (crumb) {
      this.vx = Math.sign(crumb.x - this.x || 1) * speed * 1.4;
    } else if (Math.abs(this.vx) < speed * 0.5) {
      this.vx = (this.vx >= 0 ? 1 : -1) * speed;
    }
    // Never faster than it means to go: bouncing off a wall used to keep the
    // speed it had, so a crab that should be dozing carried on at its day pace.
    if (Math.abs(this.vx) > speed) this.vx = Math.sign(this.vx) * speed;
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
    // Stood a little clear of the sand, so its legs have somewhere to come down to.
    const stand = tank.floor - this.length * 0.06;
    if (this.y < stand - 0.5) {
      // Put down in mid-water: a crab sinks. Snapping it to the sand the instant
      // the finger lets go looks like the game took it away again.
      this.vy = Math.min(tank.unit * 3.2, this.vy + tank.unit * 7 * step);
      this.y = Math.min(stand, this.y + this.vy * step);
    } else {
      this.y = stand;
      this.vy = 0;
    }
    this.heading = this.vx >= 0 ? 0 : Math.PI;
    this.phase += step * Math.abs(this.vx) * 0.09;
    this.spine.replant(this.x, this.y, this.heading);
    return this.pickUp(foods, tank);
  }

  /** The nearest flake that has settled within a claw's reach along the sand. */
  private crumbOnSand(foods: readonly Food[], tank: Tank): Food | null {
    let best: Food | null = null;
    let bestAway = SMELL * tank.unit * 1.6;
    for (const food of foods) {
      if (food.eaten || food.y < tank.floor - this.length * 0.9) continue;
      const away = Math.abs(food.x - this.x);
      if (away < bestAway) {
        bestAway = away;
        best = food;
      }
    }
    return best;
  }

  /** A crab eats what it walks over; a jellyfish eats what drifts into it. */
  private pickUp(foods: readonly Food[], tank: Tank): boolean {
    const reach = Math.max(tank.unit * 0.4, this.length * 0.45);
    for (const food of foods) {
      if (food.eaten || food.bait) continue;
      if (Math.hypot(food.x - this.x, food.y - this.y) < reach) {
        food.eaten = true;
        this.feed();
        return true;
      }
    }
    return false;
  }

  private nearestFood(foods: readonly Food[], tank: Tank, carry = 1): Food | null {
    // A jellyfish does not steer, so it cannot go to a flake; the crab has its
    // own way along the sand.
    if (this.species.kind === 'jelly' || this.species.kind === 'crab') return null;
    let best: Food | null = null;
    // An empty stomach carries a long way.
    let bestAway = SMELL * tank.unit * (this.hunger >= HUNGRY_AT ? 2.2 : 1) * carry;
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
    // Drifting into a flake still counts: a jellyfish catches what touches it.
    if (this.species.kind === 'jelly') return this.pickUp(foods, tank);
    if (this.species.kind === 'crab') return false;
    const mouthX = this.x + Math.cos(this.heading) * this.length * 0.15;
    const mouthY = this.y + Math.sin(this.heading) * this.length * 0.15;
    for (const food of foods) {
      if (food.eaten || food.bait) continue;
      if (Math.hypot(food.x - mouthX, food.y - mouthY) < Math.max(tank.unit * 0.3, this.length * 0.25)) {
        food.eaten = true;
        this.feed();
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
  /** Seconds left of being thrashed about by a finger or a passing fish. */
  shake: number;
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
    shake: 0,
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

/** Things that sit in the tank and never move: the furniture. */
export type DecorKind = 'boulder' | 'castle' | 'arch' | 'chest' | 'hoop' | 'anemone' | 'weed';

export interface Decor {
  kind: DecorKind;
  x: number;
  /** Size in tank units. */
  size: number;
  /** Which parallax layer it belongs to. */
  layer: 'far' | 'mid' | 'near';
  phase: number;
  hue: number;
  /** Seconds left of reacting to being poked: a wobble, a curl, a puff of bubbles. */
  poke: number;
  /** The chest is the one that stays how the child left it. */
  open: boolean;
}

/** Ornaments, laid out in slots across the sand so nothing lands on anything else. */
export function makeDecor(tank: Tank, rng: () => number = Math.random): Decor[] {
  const roomy = tank.w > 640;
  const plan: { kind: DecorKind; size: number; layer: Decor['layer'] }[] = [
    { kind: 'boulder', size: 1.1, layer: 'far' },
    { kind: 'castle', size: 2.4, layer: 'far' },
    { kind: 'arch', size: 1.9, layer: 'far' },
    { kind: 'anemone', size: 0.8, layer: 'mid' },
    { kind: 'chest', size: 0.95, layer: 'mid' },
    ...(roomy
      ? ([
          { kind: 'hoop', size: 1.3, layer: 'mid' },
          { kind: 'anemone', size: 0.7, layer: 'mid' },
        ] as const)
      : []),
    { kind: 'boulder', size: 1.5, layer: 'near' },
    { kind: 'weed', size: 2.6, layer: 'near' },
  ];
  // A narrow tank gets smaller ornaments rather than fewer of them, and every one
  // is pulled far enough from the glass to stand there whole.
  const shrink = Math.max(0.55, Math.min(1, tank.w / 720));
  const slot = tank.w / plan.length;
  let corner = 0;
  return plan.map((item, i) => {
    const size = item.size * shrink;
    const half = size * tank.unit * 0.8;
    // Foreground pieces frame the picture from the corners; in the middle they
    // would spend their time standing in front of whichever fish the child wants.
    const want =
      item.layer === 'near'
        ? tank.w * (corner++ % 2 === 0 ? 0.97 : 0.03)
        : slot * (i + 0.5) + (rng() - 0.5) * slot * 0.35;
    return {
      kind: item.kind,
      size,
      layer: item.layer,
      x: item.layer === 'near' ? want : Math.max(half, Math.min(tank.w - half, want)),
      phase: rng() * Math.PI * 2,
      hue: rng(),
      poke: 0,
      open: false,
    };
  });
}

/** How long an ornament keeps reacting after it is touched. */
export const POKE_SECONDS = 1.1;
/** How long a plant keeps waving after it is brushed. */
export const SHAKE_SECONDS = 1.6;

/** Radius, in px, within which a tap counts as touching this ornament. */
export function decorReach(d: Decor, tank: Tank): number {
  return Math.max(tank.unit * 0.6, d.size * tank.unit * 0.7);
}

/** The ornament under `(x, y)`, if any. Nearest first, so overlapping pieces behave. */
export function decorAt(decor: readonly Decor[], x: number, y: number, tank: Tank): Decor | null {
  let best: Decor | null = null;
  let bestAway = Infinity;
  for (const d of decor) {
    const base = tank.floor - d.size * tank.unit * 0.4;
    const away = Math.hypot(d.x - x, base - y);
    if (away < decorReach(d, tank) && away < bestAway) {
      bestAway = away;
      best = d;
    }
  }
  return best;
}

/** The plant under `(x, y)`, if any. */
export function plantAt(plants: readonly Plant[], x: number, y: number, tank: Tank): Plant | null {
  let best: Plant | null = null;
  let bestAway = Infinity;
  for (const plant of plants) {
    if (y < tank.floor - plant.h * 1.1) continue;
    const away = Math.abs(plant.x - x);
    if (away < Math.max(tank.unit * 0.45, plant.w * 3) && away < bestAway) {
      bestAway = away;
      best = plant;
    }
  }
  return best;
}

/** What a poke does, so `index.ts` only has to draw the result. */
export function pokeDecor(d: Decor): void {
  d.poke = POKE_SECONDS;
  if (d.kind === 'chest') d.open = !d.open;
}

/** Let every reaction die away by `dt`. */
export function settleScenery(plants: readonly Plant[], decor: readonly Decor[], dt: number): void {
  for (const plant of plants) plant.shake = Math.max(0, plant.shake - dt);
  for (const d of decor) d.poke = Math.max(0, d.poke - dt);
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

// ---- the tank the child built ----

/** The key the tank is kept under. */
export const SAVE_KEY = 'be-choi:aquarium';

/**
 * What is worth remembering between visits: who lives here, and where the child
 * put the furniture. Positions are fractions of the tank's width, so the castle
 * stays where it was put when the tablet is turned on its side.
 */
export interface TankSave {
  v: 1;
  /** Species ids, one per animal. */
  fish: string[];
  /** Fraction of the tank width, one per ornament, in `makeDecor` order. */
  decor: number[];
  /** Fraction of the tank width, one per plant, in `makePlants` order. */
  plants: number[];
  /** Lights out: the child left the tank on its night setting. */
  night?: boolean;
}

const EMPTY_SAVE: TankSave = { v: 1, fish: [], decor: [], plants: [], night: false };

/** Anything unreadable, from an older version or another app, is simply ignored. */
export function readSave(raw: string | null): TankSave | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const save = parsed as Partial<TankSave>;
    if (save.v !== 1) return null;
    const fractions = (list: unknown): number[] =>
      Array.isArray(list) ? list.filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 1) : [];
    const fish = Array.isArray(save.fish)
      ? save.fish.filter((id): id is string => typeof id === 'string' && speciesById(id) !== undefined)
      : [];
    return {
      v: 1,
      fish: trimStock(fish),
      decor: fractions(save.decor),
      plants: fractions(save.plants),
      night: save.night === true,
    };
  } catch {
    return null;
  }
}

export function makeSave(
  creatures: readonly { species: Species }[],
  decor: readonly Decor[],
  plants: readonly Plant[],
  tank: Tank,
  night = false,
): TankSave {
  const across = (x: number): number => Math.min(1, Math.max(0, tank.w > 0 ? x / tank.w : 0));
  return {
    v: 1,
    fish: trimStock(creatures, (cr) => cr.species.id).map((cr) => cr.species.id),
    decor: decor.map((d) => across(d.x)),
    plants: plants.map((plant) => across(plant.x)),
    night,
  };
}

/**
 * Put the saved positions back. A different screen can hold a different number
 * of plants, so anything the save does not cover keeps where it was generated.
 */
export function applySave(save: TankSave, decor: Decor[], plants: Plant[], tank: Tank): void {
  save.decor.forEach((fraction, i) => {
    const d = decor[i];
    if (d) d.x = fraction * tank.w;
  });
  save.plants.forEach((fraction, i) => {
    const plant = plants[i];
    if (plant) plant.x = fraction * tank.w;
  });
}

/** The animals a saved tank asks for, or `null` when there is no usable save. */
export function savedStock(save: TankSave | null): Species[] | null {
  if (!save || save.fish.length === 0) return null;
  const out: Species[] = [];
  for (const id of save.fish) {
    const species = speciesById(id);
    if (species) out.push(species);
  }
  return out.length > 0 ? out : null;
}

export { EMPTY_SAVE };
