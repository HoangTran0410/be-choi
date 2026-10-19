/**
 * The aquarium, with no DOM and no canvas in sight: who lives in the tank, how
 * they behave and the water they behave in. `index.ts` only draws what this file
 * has already decided; the bodies themselves come from `core/creature`.
 */
import { Spine, angleDelta } from '../../core/creature';
import { pick } from '../../core/dom';

export * from './species';
import { SPECIES } from './species';
import type { Species } from './species';
import type { Decor, Plant } from './scenery';

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

export * from './scenery';
export * from './save';
