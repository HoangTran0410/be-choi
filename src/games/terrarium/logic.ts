/**
 * The terrarium, with no DOM and no canvas in sight: who lives in the box, how
 * they behave and the ground they behave on. `index.ts` only draws what this file
 * has already decided; the bodies themselves come from `core/creature`.
 *
 * The tank next door (`aquarium`) has it easy: water is one big room and a fish
 * may be anywhere in it. On land everything has to be *on* something, and the
 * whole game is in that difference — a gecko walks up the glass and hangs upside
 * down from the lid, a frog can only get anywhere by jumping, and a snail takes
 * a minute to cross what a lizard darts over in three seconds.
 */
import { Spine, angleDelta } from '../../core/creature';
import { pick } from '../../core/dom';

export * from './species';
import { SPECIES } from './species';
import type { CreatureKind, Species } from './species';
import type { Decor, Plant } from './scenery';
/** Vertebrae per body. Enough to curve, few enough to draw two dozen of them. */
export const JOINTS = 7;
/**
 * How far one vertebra may bend from the one ahead, radians. Far less than a
 * fish: a swimming body curls through a turn and it reads as swimming, but a
 * lizard that curls like that reads as a comma with legs. Only the snake, which
 * has nothing else to move with, is allowed a real bend.
 */
export const BEND = Math.PI / 15;
export const SNAKE_BEND = Math.PI / 6;

// ---- the box ----

export interface Vivarium {
  w: number;
  h: number;
  /** One body unit in pixels. */
  unit: number;
  /** y of the back of the soil: the highest an animal on the ground may stand. */
  floor: number;
  /** y of the front of the soil, right against the glass. */
  front: number;
  /** y of the underside of the lid: as high as a climber can get. */
  top: number;
  /** x of the inside of the left and right glass. */
  wallL: number;
  wallR: number;
}

export function makeVivarium(w: number, h: number): Vivarium {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  // A seventh of the short side, but never thinner than a fifth-and-a-half of the
  // width: on a phone held upright the short side is the width, and sizing off it
  // leaves a deep bank with animals too small to see the legs on.
  const unit = Math.min(width / 5.5, height / 7);
  // How much of the screen is soil. A phone held upright is nearly all glass at
  // a fixed fraction, and the animals end up crammed into a letterbox at the
  // bottom; a tall screen gets a deep bank and still has a wall to climb.
  const tall = height / width;
  const bank = tall > 1.4 ? 0.5 : tall > 1 ? 0.58 : 0.63;
  return {
    w: width,
    h: height,
    unit,
    floor: height * bank,
    front: height * 0.95,
    top: height * 0.07,
    wallL: unit * 0.3,
    wallR: width - unit * 0.3,
  };
}

/**
 * What an animal is standing on.
 *
 * All but one of these are seen from the side, and the animal is drawn as a
 * silhouette with its feet pointing at whatever it is on. `back` is the cork wall
 * at the back of the box, and it is the odd one out: it faces the child, so an
 * animal on it is seen from *above*, back towards us, legs out to both sides.
 * That is a different picture of the same animal, and the reason to have it is
 * that from above you can watch the body itself bend through the walk.
 */
export type Surface = 'ground' | 'left' | 'right' | 'ceiling' | 'back' | 'air';

/**
 * Which way this animal's feet point on screen. On the back wall they point away
 * from the child — straight into the screen — which is no direction at all here,
 * so the body sits exactly where its feet are and the legs go out to both sides.
 */
export function footDir(surface: Surface): { x: number; y: number } {
  switch (surface) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'ceiling':
      return { x: 0, y: -1 };
    case 'back':
      return { x: 0, y: 0 };
    default:
      return { x: 0, y: 1 };
  }
}

/** Seen from above rather than from the side. */
export function isTopDown(surface: Surface): boolean {
  return surface === 'back';
}

/**
 * How big an animal draws for where it is standing: smaller against the back
 * wall, bigger against the front glass.
 *
 * A quarter either side of life size and no more. The box is one shallow bank
 * seen almost square on, so this is not perspective, it is the *hint* of it —
 * enough that the eye reads the soil as having a front and a back, little enough
 * that a gecko at the front is not a different animal from the same gecko at the
 * back.
 */
export const DEPTH_BACK = 0.86;
export const DEPTH_FRONT = 1.14;

/** How far into the box a pane of glass or the lid counts as being. */
export const WALL_BANK = 0.3;

/**
 * How deep in the box a thing is, 0 against the cork at the back and 1 against
 * the front glass. This is the one depth coordinate in the game: how big a thing
 * draws and who it is drawn in front of both come out of it, so the two can
 * never disagree.
 *
 * Only something standing on the soil can be read off its `y` — for everything
 * else, how high up the screen it is says nothing at all about how far back it
 * is. A butterfly up by the lamp is still halfway into the box.
 */
export function bankOf(surface: Surface, y: number, viv: Vivarium, aloft = 0.5): number {
  if (surface === 'left' || surface === 'right' || surface === 'ceiling') return WALL_BANK;
  if (surface === 'back') return 0;
  if (surface === 'air') return aloft;
  return bankAt(y, viv);
}

export function depthAt(surface: Surface, y: number, viv: Vivarium, aloft = 0.5): number {
  return DEPTH_BACK + (DEPTH_FRONT - DEPTH_BACK) * bankOf(surface, y, viv, aloft);
}

/**
 * The same rule for a piece of scenery: a fern at the front of the bank is a
 * touch bigger than the same fern at the back. Scenery is never anywhere but the
 * soil, so where it stands is all there is to ask.
 */
export function bankScale(y: number, viv: Vivarium): number {
  return depthAt('ground', y, viv);
}

/**
 * Which side of the body its feet are on, seen on screen: +1 when they are a
 * quarter turn clockwise of the way it is facing, -1 when anticlockwise. That one
 * number is all the drawing code needs to hang legs off a creature walking up a
 * wall or hanging from the lid.
 */
export function bellySide(surface: Surface, heading: number): number {
  const foot = footDir(surface);
  const cross = Math.cos(heading) * foot.y - Math.sin(heading) * foot.x;
  return cross < 0 ? -1 : 1;
}

/** How many animals a fresh box starts with. A small box starts with fewer. */
export const STARTER_MIN = 4;
export const STARTER_MAX = 7;

/**
 * What is already crawling about when the child arrives: a handful of different
 * animals, no two the same. Filling the rest of the box up is the child's job.
 */
export function stocking(viv: Vivarium, rng: () => number = Math.random): Species[] {
  const room = (viv.w * viv.h) / (520 * 820);
  const n = Math.round(Math.max(STARTER_MIN, Math.min(STARTER_MAX, STARTER_MIN + room * 2)));
  return pick(SPECIES, Math.min(n, SPECIES.length), rng);
}

// ---- what they eat ----

export type FoodKind = 'cricket' | 'worm' | 'berry';

export interface Food {
  x: number;
  y: number;
  kind: FoodKind;
  /** Falling speed while it is still dropping from the lid, px per second. */
  fall: number;
  /** Once it has landed: which way it is crawling off, px per second. */
  vx: number;
  wobble: number;
  eaten: boolean;
  /** It has reached the soil and is now something to chase. */
  landed: boolean;
  /** How far down the soil bank it comes to rest, 0 at the back and 1 at the glass. */
  restAt: number;
  /**
   * Seconds before it burrows away. Without this a helping nobody is hungry for
   * would crawl about the box for ever, and the feed would never finish.
   */
  life: number;
}

/** How many bugs one press of the food button drops in. */
export const FOOD_PER_FEED = 5;
/**
 * The most food the soil holds at once. The button may be pressed as often as a
 * child likes, and a child likes often.
 */
export const MAX_FOOD = 26;
/** A star after this many animals have been said hello to. */
export const STAR_EVERY_TAP = 10;
/** Food further than this from a mouth is not noticed, in box units. */
export const SMELL = 3.4;
/** A finger this close is worth walking to (or away from). */
export const NOTICE = 3.4;
/** About how long a cricket stays out on the soil before it burrows away. */
export const FOOD_LIFE = 24;

const FOOD_KINDS: readonly FoodKind[] = ['cricket', 'worm', 'berry'];

export function makeFood(viv: Vivarium, n = FOOD_PER_FEED, rng: () => number = Math.random): Food[] {
  return Array.from({ length: n }, () => ({
    x: viv.w * (0.15 + rng() * 0.7),
    y: viv.top - viv.unit * 0.3 * rng(),
    kind: FOOD_KINDS[Math.floor(rng() * FOOD_KINDS.length)] ?? 'cricket',
    // Down in a second or so. Any slower and a child who has just pressed the
    // button is watching an empty box wondering whether it worked.
    fall: viv.unit * (5 + rng() * 3),
    vx: (rng() < 0.5 ? -1 : 1) * viv.unit * (0.12 + rng() * 0.3),
    wobble: rng() * Math.PI * 2,
    eaten: false,
    landed: false,
    restAt: 0.15 + rng() * 0.7,
    life: FOOD_LIFE * (0.75 + rng() * 0.5),
  }));
}

/**
 * Another handful on top of whatever is still crawling about, up to what the
 * soil will hold. Adding rather than replacing: the cricket a gecko is already
 * stalking should not vanish because the button was pressed again.
 */
export function addFood(foods: readonly Food[], viv: Vivarium, rng: () => number = Math.random): Food[] {
  const room = Math.max(0, MAX_FOOD - foods.length);
  return [...foods, ...makeFood(viv, Math.min(FOOD_PER_FEED, room), rng)];
}

/**
 * Move the food on by `dt`: it drops from the lid, lands on the soil, then
 * crawls about until something eats it. A berry does not crawl, which is exactly
 * why a slow animal ever gets one.
 */
export function stepFood(foods: readonly Food[], dt: number, viv: Vivarium): void {
  for (const food of foods) {
    if (food.eaten) continue;
    food.wobble += dt * (food.kind === 'berry' ? 1 : 5);
    if (!food.landed) {
      food.y += food.fall * dt;
      // It lands somewhere across the soil bank rather than all on one line.
      const rest = viv.floor + (viv.front - viv.floor) * food.restAt;
      if (food.y >= rest) {
        food.y = rest;
        food.landed = true;
      }
      continue;
    }
    // Down among the roots it goes, if nobody wanted it.
    food.life -= dt;
    if (food.life <= 0) {
      food.eaten = true;
      continue;
    }
    if (food.kind === 'berry') continue;
    food.x += food.vx * dt;
    food.y += Math.sin(food.wobble * 0.4) * viv.unit * 0.1 * dt;
    if (food.x < viv.wallL + viv.unit * 0.2) food.vx = Math.abs(food.vx);
    if (food.x > viv.wallR - viv.unit * 0.2) food.vx = -Math.abs(food.vx);
    food.y = Math.min(viv.front, Math.max(viv.floor, food.y));
  }
}

/** Where the finger is, and whether it is still down. */
export interface Nudge {
  x: number;
  y: number;
  held: boolean;
}

// ---- how an animal feels ----

/**
 * An animal is never just "walking". It is frightened, or it wants feeding, or
 * it has just been made a fuss of — and a two-year-old can read all three off the
 * screen long before they can read a word. The strongest feeling wins.
 */
export type Mood = 'scared' | 'excited' | 'hungry' | 'calm';

/** Seconds from a full belly to an animal that wants feeding. */
export const FULL_FOR = 75;
/** Hunger past this shows: it comes down off the glass and hunts. */
export const HUNGRY_AT = 0.55;
/** How long a fright lasts. Long enough to reach cover, short enough to come back out. */
export const FEAR_SECONDS = 3.6;
/** How long the fuss after being fed, greeted, misted or put down lasts. */
export const JOY_SECONDS = 1.4;
/** Dozing — the wrong half of the day for this animal — it moves at about this pace. */
export const NIGHT_PACE = 0.35;
/** …and gets hungry at about this rate. */
export const NIGHT_APPETITE = 0.3;
/** A frightened animal looks for cover no further away than this, in box units. */
export const SHELTER_REACH = 5;
/**
 * More than this many animals and a phone starts dropping frames: every one of
 * them is a spine, a set of legs and a look at everybody else, every frame.
 */
export const MAX_CREATURES = 26;
/** A poked plant or ornament is worth a look for this long. */
export const INTEREST_SECONDS = 2.6;
/** How long the flight at the glass takes, from take-off to the bonk. */
export const FLIGHT_SECONDS = 1.3;
/** How much bigger it is at the child's nose than on the soil. */
export const FLIGHT_ZOOM = 1.9;
/** Roughly how often the one that flies takes off, in seconds. */
export const FLIGHT_MIN_REST = 26;
export const FLIGHT_MAX_REST = 70;

/**
 * Which one goes, when a full box has to make room. The commonest kind loses a
 * member — six ants will not miss one — and of those the one that has been in
 * longest. Never the only one of its kind: what a child would notice missing is
 * the animal there was just one of.
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
 * Keep a box down to what a phone can draw, making room rather than turning
 * arrivals away: a child who has just chosen an animal should find it walking.
 */
export function trimStock<T>(pets: readonly T[], idOf: (item: T) => string = String): T[] {
  const out = [...pets];
  while (out.length > MAX_CREATURES) {
    const goes = crowdedOut(out.map(idOf));
    out.splice(goes >= 0 ? goes : 0, 1);
  }
  return out;
}

// ---- how they get on with each other ----

/** Body lengths of elbow room every animal wants, whatever it is. */
export const PERSONAL_SPACE = 1.15;
/** A neighbour this many times longer is worth keeping clear of. */
export const BIG_RATIO = 1.8;
/** How far an animal looks for company, in box units. */
export const CROWD_RANGE = 2.6;

/** Somewhere a frightened animal can tuck itself out of sight. */
export interface Shelter {
  x: number;
  y: number;
  /** Close enough to count as hidden. */
  r: number;
}

/**
 * Every plant and every ornament big enough to get under. Cover comes out of the
 * scenery that is already there, so hiding always looks like hiding *somewhere*
 * rather than stopping in the open.
 */
export function sheltersFrom(viv: Vivarium, plants: readonly Plant[], decor: readonly Decor[]): Shelter[] {
  // Cover is measured off the drawing, so a fern dragged to the front of the
  // bank shelters as much as it now looks like it does.
  const out: Shelter[] = plants.map((plant) => ({
    x: plant.x,
    y: plant.y - plant.h * 0.25 * bankScale(plant.y, viv),
    r: Math.max(viv.unit * 0.5, plant.h * 0.4) * bankScale(plant.y, viv),
  }));
  for (const d of decor) {
    if (d.kind === 'dish' || d.kind === 'flower') continue;
    const grown = bankScale(d.y, viv);
    out.push({ x: d.x, y: d.y - d.size * viv.unit * 0.3 * grown, r: d.size * viv.unit * 0.55 * grown });
  }
  return out;
}

/** The nearest cover within `SHELTER_REACH`, or null when there is none. */
export function nearestShelter(shelters: readonly Shelter[], x: number, y: number, viv: Vivarium): Shelter | null {
  let best: Shelter | null = null;
  let bestAway = SHELTER_REACH * viv.unit;
  for (const shelter of shelters) {
    const away = Math.hypot(shelter.x - x, shelter.y - y);
    if (away < bestAway) {
      bestAway = away;
      best = shelter;
    }
  }
  return best;
}

/** Something that just happened and is worth walking over to look at. */
export interface Interest {
  x: number;
  y: number;
  /** Seconds left before they lose interest. */
  life: number;
}

/** Everything outside an animal that it might react to on a given frame. */
export interface World {
  foods: readonly Food[];
  nudge: Nudge | null;
  shelters?: readonly Shelter[];
  /** A plant that was just rustled, an ornament that was just poked. */
  interest?: Interest | null;
  /** Everybody else in the box, so they can keep apart and take fright together. */
  neighbours?: readonly Creature[];
  /** How far the food carries, against its usual reach. */
  smell?: number;
  /** Lights out: the day animals doze and the night ones come out. */
  night?: boolean;
  /** Just misted. The glass is slippery and everybody perks up. */
  wet?: number;
}

const TURN = 4.5;
/** How fast a dropped or falling animal accelerates, in box units per second squared. */
const GRAVITY = 12;

/**
 * How far each kind holds its body clear of whatever it is standing on, as a
 * fraction of its length. A beetle is up on six legs; a snake is lying on the
 * soil; a butterfly is not standing on anything at all.
 */
const STAND: Readonly<Record<CreatureKind, number>> = {
  reptile: 0.2,
  snake: 0.035,
  turtle: 0.19,
  bug: 0.26,
  hopper: 0.21,
  snail: 0.09,
  flyer: 0,
};

/** One walking, climbing, hopping or fluttering animal. */
export class Creature {
  readonly spine: Spine;
  /** Where its feet are: on the soil, on a pane of glass, or up in the air. */
  surface: Surface = 'ground';
  /** Foot position. The body itself stands `lift` clear of this, along the surface. */
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  heading = 0;
  /** Gait cycle, in strides. */
  phase = 0;
  /** How far the nose is tipped off level, towards the front glass or away. */
  private lean = 0;
  /** How far its legs hold the body off the surface when it is simply standing. */
  readonly stand: number;
  /** 0 … 1 through a flight at the glass; 1 is the moment it arrives. */
  get charge(): number {
    return this.flight > 0 ? Math.min(1, Math.max(0, 1 - this.flight / FLIGHT_SECONDS)) : 0;
  }
  /** Extra height above standing: mid-hop, or falling. */
  lift = 0;
  /** Falling: nothing under it, and `lift` shrinking fast. */
  falling = false;
  /** Seconds left of a fright: bolting, then hiding. */
  fear = 0;
  /** Seconds left of a fuss — just fed, just greeted, just misted, just put down. */
  joy = 0;
  /** 0 after a meal, 1 when it really wants feeding. */
  hunger = 0;
  /** Held in the child's fingers: it goes where the finger goes. */
  held = false;
  /** Tucked into cover (or into its shell) and keeping still. */
  hiding = false;
  /** Seconds of giddy staggering after being put down. */
  dizzy = 0;
  /** A lizard darts, then stops dead. Seconds left of standing perfectly still. */
  still = 0;
  /** What frightened it, so it (and its neighbours) can keep away from it. */
  frightX = 0;
  frightY = 0;
  /** Body length in px. */
  readonly length: number;
  /** One box unit in px, kept so a fright can be measured without the box to hand. */
  private readonly unit: number;
  /** Which way along the surface it is travelling: +1 or -1 of the surface's axis. */
  private dir = 1;
  /** Seconds left of wanting to be up the glass; below zero it wants to come down. */
  private climbFor = 0;
  /** Seconds until it may fancy the glass again. */
  private climbRest = 0;
  /** The cover it is making for, while frightened. */
  private den: Shelter | null = null;
  /** Where it is heading when nothing more interesting is happening. */
  private tx = 0;
  private ty = 0;
  /** Between hops: where the hop started and where it ends. */
  private hopFrom = { x: 0, y: 0 };
  private hopTo = { x: 0, y: 0 };
  /** 0 … 1 through the current hop, or 0 when standing. */
  private hopAt = 0;
  private hopFor = 0;
  /** Seconds of crouching before the next hop. */
  private crouch = 0;
  /** Which way up the glass it fancies going: the back wall, or a side pane. */
  private wall: 'back' | 'side' = 'back';
  /**
   * How deep in the box it is while airborne, 0 at the cork and 1 at the glass.
   * Nothing on the ground uses it: where they stand already says it.
   */
  private aloft = 0.5;
  /** Where that drift has got to. */
  private aloftAt = 0;
  /**
   * How big it draws right now: where it stands in the bank, and — for the one
   * that flies — how close to the child's nose it has got.
   */
  depth = 1;
  /** Seconds left of a flight at the front glass. 0 when it is not flying. */
  flight = 0;
  /** It hit the glass on this frame. The caller makes the bonk. */
  bonked = false;
  /** It took off on this frame. The caller makes the buzz. */
  launched = false;
  /** Seconds until it might take off again. */
  private flightRest = 0;
  /** Where the flight started, so the charge can be flown as one smooth run. */
  private flewFrom = { x: 0, y: 0 };

  constructor(
    readonly species: Species,
    viv: Vivarium,
    rng: () => number = Math.random,
    spawn?: { x: number; y: number },
  ) {
    this.length = species.size * viv.unit;
    this.unit = viv.unit;
    this.stand = this.length * STAND[species.kind];
    const widths = species.profile.map((p) => p * this.length);
    const bend = species.kind === 'snake' ? SNAKE_BEND : BEND;
    this.spine = new Spine({ widths, spacing: this.length / (JOINTS - 1), bend });
    this.surface = species.kind === 'flyer' ? 'air' : 'ground';
    this.x = spawn ? spawn.x : viv.w * (0.12 + rng() * 0.76);
    this.y = spawn ? spawn.y : this.band(viv, rng);
    this.dir = rng() < 0.5 ? -1 : 1;
    this.heading = this.dir > 0 ? 0 : Math.PI;
    this.phase = rng() * Math.PI * 2;
    this.climbRest = rng() * 14;
    this.crouch = rng() * 1.5;
    // Not the moment the child walks in: a surprise needs somewhere to come from.
    this.flightRest = FLIGHT_MIN_REST * 0.4 + rng() * FLIGHT_MIN_REST;
    this.vx = Math.cos(this.heading) * species.speed * viv.unit;
    this.pose();
    this.wander(viv, rng);
    // Last, so that adding it did not shift every other draw in the sequence and
    // rearrange a boxful of animals that were placed perfectly well before.
    this.aloftAt = rng() * Math.PI * 2;
    this.aloft = 0.5 + Math.sin(this.aloftAt) * 0.38;
  }

  /** The middle of the body, which its legs hold clear of whatever the feet are on. */
  get bodyX(): number {
    return this.x - footDir(this.surface).x * (this.stand + this.lift);
  }

  get bodyY(): number {
    return this.y - footDir(this.surface).y * (this.stand + this.lift);
  }

  /** Which side of the body the legs hang off, on screen. */
  get belly(): number {
    return bellySide(this.surface, this.heading);
  }

  /**
   * Where the feet go. Standing, that is the surface itself. In the air — mid-hop,
   * or dropped by the child, or letting go of the lid — there is nothing to stand
   * on, so they hang under the body instead of stretching down to a floor that is
   * still a long way below and leaving the animal on stilts all the way down.
   */
  get footX(): number {
    return this.x - footDir(this.surface).x * this.lift;
  }

  get footY(): number {
    return this.y - footDir(this.surface).y * this.lift;
  }

  /**
   * How much the body undulates as it goes, in radians per vertebra. A snake is
   * nothing but undulation, a lizard sways a little, and a shell does not bend
   * at all.
   */
  get wave(): number {
    if (this.species.kind === 'snake') return 0.42;
    if (this.species.kind === 'reptile') return 0.12;
    return 0;
  }

  /** Lay the body out behind the head. */
  private pose(): void {
    this.poseAt(this.bodyX, this.bodyY);
  }

  /**
   * The body runs straight back from the head along the way it is facing, with a
   * travelling wave laid over it.
   *
   * This is the one place the terrarium parts company with the tank. In water,
   * letting the vertebrae trail along the path the head took *is* the animation —
   * a fish turns and its body curls through the turn. Seen side-on on land the
   * same rule is a disaster: walking towards the front glass moves the head down
   * the screen while the animal is still facing sideways, and the body follows it
   * round into a banana. So the spine is built from the heading, and the only
   * curve in it is the one the animal is putting there itself.
   */
  private poseAt(px: number, py: number): void {
    // On the back wall we are looking straight down on the animal, and there the
    // tank's rule is the right one after all: let the vertebrae trail along the
    // path the head actually took. From above, a body curling through a turn is
    // exactly what a walking lizard does — it is only from the side that the same
    // curl reads as a banana.
    if (isTopDown(this.surface)) {
      this.spine.follow(px, py, this.heading);
      return;
    }
    const { joints, angles } = this.spine;
    const spacing = this.spine.config.spacing;
    const amp = this.wave;
    let x = px;
    let y = py;
    for (let i = 0; i < joints.length; i++) {
      const angle = amp === 0 ? this.heading : this.heading + Math.sin(this.phase * 2.2 - i * 0.85) * amp;
      angles[i] = angle;
      const joint = joints[i]!;
      joint.x = x;
      joint.y = y;
      x -= Math.cos(angle) * spacing;
      y -= Math.sin(angle) * spacing;
    }
  }

  /**
   * What this animal is feeling, strongest first. Fright beats everything, then a
   * fuss, then an empty stomach.
   */
  get mood(): Mood {
    if (this.fear > 0) return 'scared';
    if (this.joy > 0) return 'excited';
    if (this.hunger >= HUNGRY_AT) return 'hungry';
    return 'calm';
  }

  /** Can it go and get a cricket? A butterfly lives on the flowers instead. */
  get forages(): boolean {
    return this.species.kind !== 'flyer';
  }

  /** Is this the wrong half of the day for it? Then it is dozing, not walking. */
  dozing(night: boolean): boolean {
    return night !== this.species.nocturnal;
  }

  /** A turtle frightened right into its shell, which is the whole of its hiding. */
  get tucked(): boolean {
    return this.species.kind === 'turtle' && this.fear > 0;
  }

  /**
   * A y inside the soil bank. `floor` is the back of it and `front` the glass;
   * everybody has the whole depth, and where they stand only decides who is drawn
   * in front of whom.
   */
  private band(viv: Vivarium, rng: () => number): number {
    if (this.species.kind === 'flyer') return viv.top + (viv.floor - viv.top) * (0.15 + rng() * 0.6);
    return viv.floor + (viv.front - viv.floor) * (0.12 + rng() * 0.82);
  }

  /**
   * Can it take the cork wall at the back — the one that faces the child?
   * Only the ones with legs to watch: the point of that wall is seeing the body
   * bend through the walk from above, and a snail has nothing to bend.
   */
  get scalesBackWall(): boolean {
    return this.species.climbs && (this.species.kind === 'reptile' || this.species.kind === 'bug');
  }

  /** Picked up. It stops walking and simply goes where the finger goes. */
  hold(px: number, py: number): void {
    // In a child's hand it is seen from the side, whatever pane it came off.
    this.surface = 'ground';
    this.held = true;
    this.hiding = false;
    this.den = null;
    this.falling = false;
    this.lift = 0;
    this.hopAt = 0;
    this.x = px;
    this.y = py;
  }

  /**
   * The wall a finger has just let go of it against, if there is one.
   *
   * A child putting the gecko on the glass is aiming at a wall, not at a line,
   * so the panes and the lid get a generous reach — and everything else above
   * the soil is the cork at the back, which is most of the picture. Only the
   * climbers get any of this: a turtle held over the middle of the box has
   * nothing to hold on to and has to come down.
   */
  private gripAt(viv: Vivarium): Surface | null {
    if (!this.species.climbs || this.y >= viv.floor) return null;
    const reach = viv.unit * 1.2;
    const lid = this.y - viv.top;
    const left = this.x - viv.wallL;
    const right = viv.wallR - this.x;
    const near = Math.min(lid, left, right);
    if (near >= reach) return this.scalesBackWall ? 'back' : null;
    if (near === lid) return 'ceiling';
    return near === left ? 'left' : 'right';
  }

  /** Put back down: a giddy moment, then off it goes. */
  release(viv: Vivarium, rng: () => number = Math.random): void {
    if (!this.held) return;
    this.held = false;
    this.dizzy = 1.1;
    this.joy = JOY_SECONDS;
    // Let go against a wall and it holds on there. Half of being allowed to pick
    // an animal up is deciding where to put it down, and a gecko that slides off
    // the glass every time says the glass is not really a place to put one.
    const grip = this.gripAt(viv);
    if (grip) return this.stick(grip, viv, rng);
    this.surface = this.species.kind === 'flyer' ? 'air' : 'ground';
    // Dropped in mid-air it falls to the soil rather than snapping down to it,
    // which would look like the game took it away and put it back.
    if (this.species.kind !== 'flyer' && this.y < viv.floor) {
      this.falling = true;
      this.lift = viv.floor - this.y;
      this.y = viv.floor;
      this.vy = 0;
    }
  }

  /** Take hold where it has been put, and stay there long enough to be watched. */
  private stick(surface: Surface, viv: Vivarium, rng: () => number): void {
    this.surface = surface;
    this.falling = false;
    this.lift = 0;
    this.vx = 0;
    this.vy = 0;
    this.lean = 0;
    // A longer stretch than it would ever give itself: the child chose this
    // spot, so it must not turn round and walk straight back down off it.
    this.climbFor = 9 + rng() * 9;
    this.climbRest = 0;
    this.wall = surface === 'back' ? 'back' : 'side';
    const edge = this.length * 0.5;
    if (surface === 'back') {
      this.x = Math.min(viv.wallR - edge, Math.max(viv.wallL + edge, this.x));
      this.y = Math.min(viv.floor - viv.unit * 0.05, Math.max(viv.top + edge, this.y));
      this.heading = -Math.PI / 2;
      this.wanderWall(viv, rng);
    } else if (surface === 'ceiling') {
      this.x = Math.min(viv.wallR, Math.max(viv.wallL, this.x));
      this.y = viv.top;
      // Set off towards the middle of the lid rather than straight at a corner.
      this.dir = this.x < viv.w * 0.5 ? 1 : -1;
      this.heading = this.dir > 0 ? 0 : Math.PI;
    } else {
      this.x = surface === 'left' ? viv.wallL : viv.wallR;
      this.y = Math.min(viv.floor - viv.unit * 0.03, Math.max(viv.top, this.y));
      this.dir = -1;
      this.heading = -Math.PI / 2;
    }
    this.replant();
  }

  /** Fed. A full animal is a happy animal. */
  feed(): void {
    this.hunger = 0;
    this.joy = JOY_SECONDS;
    // A meal is worth coming down off the glass for, and worth standing still to eat.
    this.climbFor = Math.min(this.climbFor, 0);
    this.still = 0.5;
  }

  private wander(viv: Vivarium, rng: () => number): void {
    this.tx = viv.wallL + viv.unit * 0.4 + rng() * Math.max(1, viv.wallR - viv.wallL - viv.unit * 0.8);
    this.ty = this.band(viv, rng);
  }

  /** A generous hit box: toddler fingers, not a mouse. */
  hits(px: number, py: number): boolean {
    // The body is drawn scaled about its feet, so bring the finger back into the
    // body's own size before asking the spine about it.
    const d = this.depth || 1;
    const qx = this.footX + (px - this.footX) / d;
    const qy = this.footY + (py - this.footY) / d;
    for (let i = 0; i < this.spine.joints.length; i++) {
      const joint = this.spine.joints[i]!;
      const reach = Math.max(this.spine.widthAt(i) * 2.2, 26 / d);
      if (Math.hypot(qx - joint.x, qy - joint.y) < reach) return true;
    }
    return false;
  }

  /**
   * Bolt away from `(px, py)`, then go and hide. `hard` is a real fright — a
   * neighbour being lifted out of the box — rather than a friendly prod.
   */
  startle(px: number, py: number, hard = false): void {
    if (this.held) return;
    const dx = this.bodyX - px;
    const dy = this.bodyY - py;
    const away = Math.hypot(dx, dy);
    // Startled by something standing exactly where it is: there is no "away" to
    // run, so it runs the way it was already facing rather than standing there.
    const ux = away > 0.001 ? dx / away : Math.cos(this.heading);
    const uy = away > 0.001 ? dy / away : Math.sin(this.heading);
    this.dir = this.surface === 'left' || this.surface === 'right' ? (uy > 0 ? 1 : -1) : ux > 0 ? 1 : -1;
    // In pixels a second, like every other velocity here. Left in body units it
    // came out around a hundredth of the intended bolt, and a startled animal
    // strolled away from the thing that frightened it.
    const bolt = this.species.speed * this.unit * 2.4;
    this.vx = ux * bolt;
    this.vy = uy * bolt;
    this.frightX = px;
    this.frightY = py;
    this.fear = hard ? FEAR_SECONDS : FEAR_SECONDS * 0.35;
    this.still = 0;
    this.crouch = 0;
    // A prod from a child it knows is half a fright and half a game.
    if (!hard) this.joy = JOY_SECONDS * 0.5;
    this.den = null;
    // Frightened, a climber goes straight up the nearest glass. It is the one
    // place in the box nothing can follow it to.
    if (this.species.climbs) this.climbFor = Math.max(this.climbFor, FEAR_SECONDS);
  }

  /**
   * Advance one frame. Returns `true` on the frame it eats something, so the
   * caller can make a sound about it.
   */
  update(dt: number, viv: Vivarium, world: World, rng: () => number = Math.random): boolean {
    const step = Math.min(0.05, Math.max(0, dt));
    this.bonked = false;
    this.launched = false;
    const ate = this.advance(step, viv, world, rng);
    // Where it stands is how big it draws — including, for the one that flies,
    // how close to the child it has got.
    this.depth = this.held ? DEPTH_FRONT : depthAt(this.surface, this.y, viv, this.aloft) + this.charge * (FLIGHT_ZOOM - 1) * DEPTH_FRONT;
    return ate;
  }

  /**
   * Where in the bank it sorts, back to front.
   *
   * Not how high up the screen it is: a butterfly halfway up the box is halfway
   * *into* the box too, and a gecko up a pane is at the far end of it. Both are
   * drawn at the size that says so, so both have to be drawn in the order that
   * says so as well.
   */
  sortY(viv: Vivarium): number {
    return bankY(bankOf(this.surface, this.y, viv, this.aloft), viv);
  }

  private advance(step: number, viv: Vivarium, world: World, rng: () => number): boolean {
    this.fear = Math.max(0, this.fear - step);
    this.joy = Math.max(0, this.joy - step);
    this.dizzy = Math.max(0, this.dizzy - step);
    this.still = Math.max(0, this.still - step);
    const resting = this.dozing(world.night === true);
    if (!this.held && this.forages) {
      this.hunger = Math.min(1, this.hunger + (step / FULL_FOR) * (resting ? NIGHT_APPETITE : 1));
    }
    if (this.fear === 0) {
      this.hiding = false;
      this.den = null;
    }
    this.catchFright(viv, world.neighbours ?? []);

    // Held: it goes where the finger goes. index.ts has already moved it there,
    // so all that is left is to keep the body alive in the child's hand.
    if (this.held) {
      this.phase += step * 9;
      this.heading += angleDelta(this.heading, -Math.PI / 2) * Math.min(1, 4 * step);
      this.poseAt(this.x, this.y);
      return false;
    }

    if (this.flight > 0) {
      this.chargeGlass(step, viv, rng);
      return false;
    }
    if (this.mightFly(step, rng)) {
      this.takeOff(rng);
      return false;
    }

    if (this.falling) {
      this.fall(step, viv);
      return false;
    }

    const pace = resting ? NIGHT_PACE : 1;
    if (this.species.kind === 'flyer') return this.flutter(step, viv, world, rng, pace);
    if (this.species.kind === 'hopper') return this.leap(step, viv, world, rng, pace);
    if (this.surface === 'back') return this.roam(step, viv, world, rng, pace);
    if (this.surface !== 'ground') return this.climb(step, viv, world, pace, rng);
    return this.crawl(step, viv, world, rng, pace);
  }

  /**
   * Would it take off right now? Only from the soil, only when nothing else is
   * going on, and only once in a while — the whole joke is that it is a surprise.
   */
  private mightFly(step: number, rng: () => number): boolean {
    if (!this.species.flies || this.held || this.falling || this.flight > 0) return false;
    if (this.fear > 0 || this.hiding) return false;
    this.flightRest -= step;
    return this.flightRest <= 0 && rng() < step * 0.5;
  }

  /**
   * Off whatever it was on and straight at the child, growing all the way.
   *
   * From anywhere, not only from the soil. This one climbs as well as it flies,
   * so it spends much of its life up a wall; asking it to be standing on the
   * ground before it could take off meant it almost never did — and one that
   * peels off the cork straight at the child is the better surprise anyway.
   */
  private takeOff(rng: () => number): void {
    this.flight = FLIGHT_SECONDS;
    this.launched = true;
    this.flewFrom = { x: this.x, y: this.y };
    // It is in the air now, and the air belongs to the ground plane: that is
    // where the charge ends and where it lands afterwards.
    this.surface = 'ground';
    this.climbFor = 0;
    this.lift = 0;
    this.flightRest = FLIGHT_MIN_REST + rng() * (FLIGHT_MAX_REST - FLIGHT_MIN_REST);
  }

  /**
   * The flight itself: out of the soil, at the glass, bigger every frame, and
   * then a bonk on the pane an inch from the child's nose. It cannot get out —
   * that is the point, and it is why this is funny rather than horrid.
   */
  private chargeGlass(step: number, viv: Vivarium, rng: () => number): void {
    this.flight -= step;
    const t = this.charge;
    // Fast out of the soil and slowing into the glass, so the arrival lands.
    const ease = 1 - (1 - t) * (1 - t);
    this.y = this.flewFrom.y + (viv.front - this.flewFrom.y) * ease;
    // A wobble across, the way anything with wings that small flies.
    this.x = this.flewFrom.x + Math.sin(t * 9) * viv.unit * 0.5 * (1 - t);
    this.x = Math.min(viv.wallR - this.length, Math.max(viv.wallL + this.length, this.x));
    this.lift = Math.sin(ease * Math.PI) * this.length * 0.6;
    this.heading = this.dir > 0 ? 0 : Math.PI;
    // Wings, far faster than any walk.
    this.phase += step * 46;
    this.pose();
    if (this.flight <= 0) {
      this.flight = 0;
      this.bonked = true;
      // Off the glass and down, thoroughly startled by its own idea.
      this.falling = true;
      this.lift = Math.max(this.lift, this.length * 0.5);
      this.y = viv.front;
      this.fear = FEAR_SECONDS;
      this.frightX = this.x;
      this.frightY = this.y - this.length;
      this.dir = rng() < 0.5 ? -1 : 1;
      this.heading = this.dir > 0 ? 0 : Math.PI;
    }
  }

  /** Nothing underneath: down it comes, and it is quite pleased about landing. */
  private fall(step: number, viv: Vivarium): void {
    // A dropped animal turns itself feet-down and level on the way, the way they do.
    this.heading = this.dir > 0 ? 0 : Math.PI;
    this.vy += GRAVITY * viv.unit * step;
    this.lift -= this.vy * step;
    if (this.lift <= 0) {
      this.lift = 0;
      this.vy = 0;
      this.falling = false;
      this.surface = 'ground';
      this.joy = JOY_SECONDS;
      this.still = 0.35;
      this.y = Math.min(viv.front, Math.max(viv.floor, this.y));
    }
    this.pose();
  }

  /** How fast it is going right now, mood included. */
  private cruise(viv: Vivarium): number {
    let speed = this.species.speed * viv.unit;
    if (this.fear > 0 && !this.hiding) speed *= 2.2;
    else if (this.mood === 'excited') speed *= 1.3;
    else if (this.mood === 'hungry') speed *= 1.2;
    return speed;
  }

  /**
   * Where it wants to be this frame. Fright first — nothing is worth eating
   * while something enormous is overhead — then food, then whatever the child is
   * doing, then simply somewhere else.
   */
  private aim(viv: Vivarium, world: World, rng: () => number): { x: number; y: number } {
    if (this.fear > 0) {
      this.den ??= nearestShelter(world.shelters ?? [], this.bodyX, this.bodyY, viv);
      if (this.den) {
        this.hiding = Math.hypot(this.den.x - this.bodyX, this.den.y - this.bodyY) < this.den.r;
        return this.den;
      }
      // Nowhere to hide: keep going away from whatever it was. Heading for the old
      // wander target instead would leave it sitting still the moment it arrived,
      // which looks like the box has stopped rather than like fear.
      const dx = this.bodyX - this.frightX;
      const dy = this.bodyY - this.frightY;
      const away = Math.hypot(dx, dy);
      const ux = away > 0.001 ? dx / away : Math.cos(this.heading);
      const uy = away > 0.001 ? dy / away : Math.sin(this.heading);
      return { x: this.bodyX + ux * viv.unit * 4, y: this.bodyY + uy * viv.unit * 1.2 };
    }

    const bite = this.nearestFood(world.foods, viv, world.smell ?? 1);
    if (bite) return { x: bite.x, y: bite.y };

    const nudge = world.nudge;
    if (nudge?.held && this.species.curious !== 0) {
      const away = Math.hypot(nudge.x - this.bodyX, nudge.y - this.bodyY);
      if (away < NOTICE * viv.unit) {
        // Shy ones go the other way; hungry ones come to anything, hoping it is food.
        const pull = this.hunger >= HUNGRY_AT ? 1 : this.species.curious;
        if (pull > 0) return { x: nudge.x, y: nudge.y };
        return { x: this.bodyX - (nudge.x - this.bodyX), y: this.bodyY - (nudge.y - this.bodyY) };
      }
    }

    // Something was just poked: the nosy ones go and have a look.
    const interest = world.interest;
    if (interest && interest.life > 0 && this.species.curious > 0) {
      const away = Math.hypot(interest.x - this.bodyX, interest.y - this.bodyY);
      if (away < NOTICE * viv.unit * 2.2) return { x: interest.x, y: interest.y };
    }

    // Off to the wall. A climber that only found one by wandering into it hardly
    // ever climbed; wanting to climb has to mean walking over there.
    if (this.wantsGlass()) {
      if (this.wall === 'back') return { x: this.bodyX, y: viv.floor };
      return { x: this.bodyX < viv.w / 2 ? viv.wallL : viv.wallR, y: viv.floor + viv.unit * 0.05 };
    }

    if (Math.hypot(this.tx - this.bodyX, this.ty - this.bodyY) < viv.unit * 0.6) this.wander(viv, rng);
    return { x: this.tx, y: this.ty };
  }

  /** How far from the glass a walking animal is kept. */
  private groundMargin(viv: Vivarium): number {
    return viv.unit * 0.3 + this.length * 0.2;
  }

  /** Walking about on the soil, which is what most of them do most of the time. */
  private crawl(step: number, viv: Vivarium, world: World, rng: () => number, pace: number): boolean {
    this.tickClimbing(step, rng);
    const goal = this.aim(viv, world, rng);
    const cruise = this.cruise(viv) * pace;

    // A lizard does not stroll: it darts, then stops dead and looks about. That
    // stop-start is most of what makes it read as a reptile rather than a toy —
    // but an animal that has decided to go up a wall walks there without dawdling,
    // or a dozing gecko spends four minutes crossing the bank and never arrives.
    const errand = this.wantsGlass();
    const darts = this.species.kind === 'reptile' && this.fear === 0 && !errand;
    if (darts && this.still <= 0 && rng() < step * 0.5) this.still = 0.5 + rng() * 1.6;
    // A frightened turtle does not run anywhere; it stops and shuts the door.
    const ease = this.tucked ? 0.03 : this.hiding ? 0.25 : this.still > 0 && !errand ? 0.06 : 1;

    const toX = goal.x - this.bodyX;
    const toY = goal.y - this.bodyY;
    const far = Math.hypot(toX, toY) || 1;
    let wantX = (toX / far) * cruise * ease;
    // Crossing the bank is a little slower than walking along it — but only a
    // little: the bank is half the screen deep, and at a fraction of the pace
    // nobody ever reaches the back of it.
    let wantY = (toY / far) * cruise * 0.7 * ease;

    const crowd = this.neighbours(viv, world.neighbours ?? []);
    wantX += crowd.x * cruise;
    wantY += crowd.y * cruise * 0.7;

    this.vx += (wantX - this.vx) * Math.min(1, TURN * step);
    this.vy += (wantY - this.vy) * Math.min(1, TURN * step);
    this.x += this.vx * step;
    this.y += this.vy * step;

    // Up a wall, if it fancies it and it is the kind that can. Only from the back
    // of the soil bank: stepping onto a wall from right against the front glass
    // would jump it half the bank's depth in one frame.
    if (this.wantsGlass() && this.y < viv.floor + (viv.front - viv.floor) * 0.55) {
      if (this.wall === 'back') {
        if (this.y <= viv.floor + viv.unit * 0.25) return this.takeBack(viv, rng);
      } else {
        const edge = this.groundMargin(viv) + viv.unit * 0.06;
        if (this.x <= viv.wallL + edge) return this.takeWall('left', viv, world);
        if (this.x >= viv.wallR - edge) return this.takeWall('right', viv, world);
      }
    }
    this.keepIn(viv);

    this.face(step, cruise);
    this.stride(step, viv, pace);
    this.pose();
    return this.bite(world.foods, viv);
  }

  /**
   * Point the body where it is going.
   *
   * Seen from the side there is no such thing as turning round: an animal faces
   * left or it faces right, and the change is a flip on the spot with a beat of
   * standing still around it. The only thing that eases is the lean — nose down
   * towards the front glass, nose up towards the back wall — which is the whole
   * of how a flat body says it is crossing the bank.
   *
   * Easing the heading itself, the way a fish turns, cannot work here: the body
   * has to stay within a lean of level or it stands on its tail, and an angle
   * that may not leave that band can never reach the other side of it. An animal
   * whose goal was behind it simply walked backwards to get there, for ever.
   */
  private face(step: number, cruise: number): void {
    if (Math.abs(this.vx) > cruise * 0.1) {
      const want = this.vx > 0 ? 1 : -1;
      if (want !== this.dir) {
        this.dir = want;
        // A beat to turn round in, so the flip lands on a stationary animal.
        this.still = Math.max(this.still, 0.14);
      }
    }
    const wantLean = Math.max(-0.3, Math.min(0.3, (this.vy / Math.max(1, cruise)) * 0.5));
    this.lean += (wantLean - this.lean) * Math.min(1, 6 * step);
    // Just put down: a giddy wobble before it remembers which way is forward.
    const giddy = this.dizzy > 0 ? Math.sin(this.dizzy * 22) * 0.3 * this.dizzy : 0;
    this.heading = (this.dir > 0 ? 0 : Math.PI) + this.dir * (this.lean + giddy);
  }

  /**
   * Does it want to be up a wall right now?
   *
   * Deliberately not "and it is not hungry". Nothing in the box is fed unless the
   * child presses the button, so every animal is hungry within a minute of a
   * fresh start; hanging climbing on an empty stomach meant that after that first
   * minute nobody ever went up anything again. What actually brings one down is
   * food it can smell — see `smellsFood`.
   */
  private wantsGlass(): boolean {
    return this.species.climbs && this.climbFor > 0;
  }

  /** Is there something down on the soil worth coming off the wall for? */
  private smellsFood(viv: Vivarium, world: World): boolean {
    return this.hunger >= HUNGRY_AT && this.nearestFood(world.foods, viv, world.smell ?? 1) !== null;
  }

  private tickClimbing(step: number, rng: () => number): void {
    if (!this.species.climbs) return;
    if (this.climbFor > 0) {
      this.climbFor -= step;
      return;
    }
    this.climbRest -= step;
    if (this.climbRest <= 0 && rng() < step * 0.35) {
      this.climbFor = 5 + rng() * 10;
      this.climbRest = 14 + rng() * 22;
      // Mostly the cork at the back, where the child can watch it walk; the side
      // panes are the other picture of the same animal and worth keeping.
      this.wall = this.scalesBackWall && rng() < 0.65 ? 'back' : 'side';
    }
  }

  /** Lay the body out straight along its heading, for a frame that changes surface. */
  private replant(): void {
    this.spine.replant(this.bodyX, this.bodyY, this.heading);
  }

  /** Somewhere else on the cork wall to be. */
  private wanderWall(viv: Vivarium, rng: () => number): void {
    const edge = this.length * 0.6;
    this.tx = viv.wallL + edge + rng() * Math.max(1, viv.wallR - viv.wallL - edge * 2);
    this.ty = viv.top + edge + rng() * Math.max(1, viv.floor - viv.top - edge * 1.6);
  }

  /** Step off the soil and onto the cork wall at the back. */
  private takeBack(viv: Vivarium, rng: () => number): boolean {
    this.surface = 'back';
    this.y = viv.floor - viv.unit * 0.05;
    this.x = Math.min(viv.wallR - this.length * 0.5, Math.max(viv.wallL + this.length * 0.5, this.x));
    this.heading = -Math.PI / 2;
    this.vx = 0;
    this.vy = -this.species.speed * this.unit;
    this.lean = 0;
    this.replant();
    this.wanderWall(viv, rng);
    return false;
  }

  /**
   * Up the cork wall, seen from above. Two dimensions again, but this time both
   * of them are the wall — and because nothing about this view is side-on, the
   * body may point wherever it is going. That freedom is the whole animation:
   * the spine trails the head round every turn.
   */
  private roam(step: number, viv: Vivarium, world: World, rng: () => number, pace: number): boolean {
    this.climbFor -= step;
    const wet = world.wet ?? 0;
    const speed = this.species.speed * this.unit * pace * (1 - wet * 0.4) * (this.fear > 0 ? 2.2 : 1);
    const wantsDown = this.climbFor <= 0 || this.smellsFood(viv, world);

    // Down to the soil, or off across the cork.
    if (wantsDown) this.ty = viv.floor + viv.unit;
    else if (Math.hypot(this.tx - this.x, this.ty - this.y) < this.length * 0.7) this.wanderWall(viv, rng);

    const toX = this.tx - this.x;
    const toY = this.ty - this.y;
    const far = Math.hypot(toX, toY) || 1;
    const crowd = this.neighbours(viv, world.neighbours ?? []);
    this.vx += ((toX / far) * speed + crowd.x * speed - this.vx) * Math.min(1, TURN * step);
    this.vy += ((toY / far) * speed + crowd.y * speed - this.vy) * Math.min(1, TURN * step);
    this.x += this.vx * step;
    this.y += this.vy * step;

    const edge = this.length * 0.45;
    this.x = Math.min(viv.wallR - edge, Math.max(viv.wallL + edge, this.x));
    if (this.y < viv.top + edge) {
      this.y = viv.top + edge;
      this.vy = Math.abs(this.vy);
    }

    if (Math.hypot(this.vx, this.vy) > 1) {
      this.heading += angleDelta(this.heading, Math.atan2(this.vy, this.vx)) * Math.min(1, 5 * step);
    }
    this.stride(step, viv, pace);
    this.pose();

    // Back down onto the soil.
    if (this.y >= viv.floor) {
      this.surface = 'ground';
      this.y = viv.floor + viv.unit * 0.1;
      this.dir = Math.cos(this.heading) >= 0 ? 1 : -1;
      this.heading = this.dir > 0 ? 0 : Math.PI;
      this.lean = 0;
      this.vy = 0;
      this.climbRest = Math.max(this.climbRest, 8);
      this.replant();
      return false;
    }
    // …or simply lets go, which is the best thing in the box.
    if (rng() < step * (0.05 + wet * 0.4)) {
      this.falling = true;
      this.surface = 'ground';
      this.lift = Math.max(0, viv.floor - this.y);
      this.y = viv.floor + (viv.front - viv.floor) * 0.35;
      this.dir = Math.cos(this.heading) >= 0 ? 1 : -1;
      this.heading = this.dir > 0 ? 0 : Math.PI;
      this.lean = 0;
      this.vy = 0;
      this.replant();
    }
    return false;
  }

  /** Step off the soil and onto a pane of glass, heading up it. */
  private takeWall(side: 'left' | 'right', viv: Vivarium, world: World): boolean {
    this.surface = side;
    this.x = side === 'left' ? viv.wallL : viv.wallR;
    // Just clear of the soil, or the very next frame reads it as back on the ground.
    this.y = viv.floor - viv.unit * 0.03;
    this.dir = -1;
    this.heading = -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.pose();
    return this.bite(world.foods, viv);
  }

  /**
   * On the glass, or hanging from the lid. One dimension instead of two, which is
   * why this is a different piece of code and not a special case of walking: a
   * climber goes up, round the corner, along, and eventually comes back down —
   * and once in a while simply lets go, which is the best thing in the box.
   */
  private climb(step: number, viv: Vivarium, world: World, pace: number, rng: () => number): boolean {
    this.climbFor -= step;
    const wet = world.wet ?? 0;
    // Wet glass is slippery. A misted gecko slows right down and, once in a
    // while, does not hold on at all.
    let speed = this.species.speed * viv.unit * pace * (1 - wet * 0.45) * (this.fear > 0 ? 2 : 1);
    if (this.still > 0) speed *= 0.1;
    // Hungry, or done climbing: head back down to the soil.
    const wantsDown = this.climbFor <= 0 || this.smellsFood(viv, world);

    if (this.surface === 'ceiling') {
      this.x += this.dir * speed * step;
      this.y = viv.top;
      this.heading = this.dir > 0 ? 0 : Math.PI;
      if (this.x <= viv.wallL) return this.turnDown('left', viv, world);
      if (this.x >= viv.wallR) return this.turnDown('right', viv, world);
      // Hanging upside down by its toes is not something anybody keeps up for
      // ever, and a gecko dropping off the lid is worth the whole game.
      if ((wantsDown && rng() < step * 0.5) || rng() < step * (0.06 + wet * 0.5)) {
        this.falling = true;
        this.surface = 'ground';
        this.lift = viv.floor - viv.top;
        this.y = viv.floor + (viv.front - viv.floor) * 0.4;
        this.vy = 0;
        this.heading = this.dir > 0 ? 0 : Math.PI;
      }
    } else {
      this.dir = wantsDown ? 1 : this.dir;
      this.y += this.dir * speed * step;
      this.x = this.surface === 'left' ? viv.wallL : viv.wallR;
      this.heading = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (this.y <= viv.top) {
        this.surface = 'ceiling';
        this.y = viv.top;
        // Off along the lid, away from the corner it came round.
        this.dir = this.x < viv.w / 2 ? 1 : -1;
        this.heading = this.dir > 0 ? 0 : Math.PI;
        this.pose();
      }
      if (this.y >= viv.floor) {
        // Back on the soil, facing away from the glass it just came down.
        this.surface = 'ground';
        this.y = viv.floor + viv.unit * 0.1;
        this.heading = this.x < viv.w / 2 ? 0 : Math.PI;
        this.dir = this.x < viv.w / 2 ? 1 : -1;
        this.vx = Math.cos(this.heading) * speed;
        this.vy = 0;
        this.climbRest = Math.max(this.climbRest, 8);
        this.pose();
      }
    }
    this.stride(step, viv, pace);
    this.pose();
    return this.bite(world.foods, viv);
  }

  /** Round the corner from the lid onto a pane of glass, heading down. */
  private turnDown(side: 'left' | 'right', viv: Vivarium, world: World): boolean {
    this.surface = side;
    this.x = side === 'left' ? viv.wallL : viv.wallR;
    this.y = viv.top;
    this.dir = 1;
    this.heading = Math.PI / 2;
    this.pose();
    return this.bite(world.foods, viv);
  }

  /**
   * A frog or a cricket cannot walk anywhere: it crouches, it jumps, it lands.
   * Everything about how one reads on screen is in the pause before the jump.
   */
  private leap(step: number, viv: Vivarium, world: World, rng: () => number, pace: number): boolean {
    if (this.hopAt > 0) {
      this.hopAt = Math.max(0, this.hopAt - step / Math.max(0.01, this.hopFor));
      const t = 1 - this.hopAt;
      this.x = this.hopFrom.x + (this.hopTo.x - this.hopFrom.x) * t;
      this.y = this.hopFrom.y + (this.hopTo.y - this.hopFrom.y) * t;
      this.lift = Math.sin(t * Math.PI) * this.length * 0.9;
      this.phase = t;
      if (this.hopAt === 0) {
        this.lift = 0;
        this.crouch = (0.5 + rng() * 1.6) / Math.max(0.2, pace);
      }
      this.pose();
      return this.bite(world.foods, viv);
    }

    this.lift = 0;
    this.phase = 0;
    this.crouch -= step * (this.fear > 0 ? 4 : 1);
    if (this.crouch > 0) {
      this.pose();
      return this.bite(world.foods, viv);
    }

    const goal = this.aim(viv, world, rng);
    const dx = goal.x - this.x;
    const dy = goal.y - this.y;
    const away = Math.hypot(dx, dy) || 1;
    const reach = this.length * (this.fear > 0 ? 2.6 : 1.6) * (0.7 + rng() * 0.6);
    const go = Math.min(away, reach);
    this.hopFrom = { x: this.x, y: this.y };
    this.hopTo = {
      x: Math.min(viv.wallR - viv.unit * 0.2, Math.max(viv.wallL + viv.unit * 0.2, this.x + (dx / away) * go)),
      y: Math.min(viv.front, Math.max(viv.floor, this.y + (dy / away) * go * 0.5)),
    };
    this.hopFor = Math.max(0.25, go / (this.species.speed * viv.unit * 2.6 * pace));
    this.hopAt = 1;
    this.heading = this.hopTo.x >= this.x ? 0 : Math.PI;
    this.dir = this.hopTo.x >= this.x ? 1 : -1;
    this.pose();
    return this.bite(world.foods, viv);
  }

  /** A butterfly steers about as well as a falling leaf, and that is the charm. */
  private flutter(step: number, viv: Vivarium, world: World, rng: () => number, pace: number): boolean {
    this.surface = 'air';
    this.lift = 0;
    const goal = this.aim(viv, world, rng);
    const cruise = this.species.speed * viv.unit * pace * (this.fear > 0 ? 2 : 1);
    const toX = goal.x - this.x;
    const toY = goal.y - this.y;
    const far = Math.hypot(toX, toY) || 1;
    this.phase += step * 11;
    // The bob is the wingbeat pushing it up and letting it sink, not a sine
    // pinned on top of a straight line.
    const beat = Math.sin(this.phase) * cruise * 0.8;
    this.vx += ((toX / far) * cruise - this.vx) * Math.min(1, 2 * step);
    this.vy += ((toY / far) * cruise * 0.6 + beat - this.vy) * Math.min(1, 6 * step);
    this.x += this.vx * step;
    this.y += this.vy * step;
    this.x = Math.min(viv.wallR - this.length * 0.3, Math.max(viv.wallL + this.length * 0.3, this.x));
    this.y = Math.min(viv.front - this.length * 0.2, Math.max(viv.top + this.length * 0.3, this.y));
    // And it drifts through the box as well as across it, so over half a minute
    // it passes behind one fern and out in front of the next. A butterfly pinned
    // to one depth is a sticker on the glass.
    this.aloftAt += step * 0.35;
    this.aloft = 0.5 + Math.sin(this.aloftAt) * 0.38;
    if (Math.abs(this.vx) > 1) {
      this.heading = this.vx >= 0 ? 0 : Math.PI;
      this.dir = this.vx >= 0 ? 1 : -1;
    }
    this.poseAt(this.x, this.y);
    return false;
  }

  /** How far through the walk cycle one frame carries it. */
  private stride(step: number, viv: Vivarium, pace: number): void {
    const moved = this.surface === 'ground' ? Math.hypot(this.vx, this.vy) : this.species.speed * viv.unit * pace;
    const still = this.still > 0 || this.hiding;
    this.phase += still ? step * 0.4 : step * (1.2 + (moved / Math.max(1, this.length)) * 1.6);
  }

  /**
   * Everything the other animals in the box do to this one, as one nudge: nobody
   * crowds anybody, and anything much bigger gets a wide berth. There is no
   * shoaling on land — a lizard has never wanted to be in the middle of a lizard —
   * so this is the separation half of the tank's rules and nothing else.
   */
  private neighbours(viv: Vivarium, others: readonly Creature[]): { x: number; y: number } {
    if (this.held) return { x: 0, y: 0 };
    const range = CROWD_RANGE * viv.unit;
    let x = 0;
    let y = 0;
    for (const other of others) {
      if (other === this || other.held || other.surface !== this.surface) continue;
      const dx = other.bodyX - this.bodyX;
      const dy = other.bodyY - this.bodyY;
      const away = Math.hypot(dx, dy);
      if (away < 0.001 || away > range) continue;
      const ux = dx / away;
      const uy = dy / away;
      const elbow = PERSONAL_SPACE * (this.length + other.length) * 0.5;
      if (away < elbow) {
        const push = 1 - away / elbow;
        x -= ux * push * 1.5;
        y -= uy * push * 1.5;
      }
      if (other.length > this.length * BIG_RATIO) {
        const wary = 1 - away / range;
        x -= ux * wary * 1.3;
        y -= uy * wary * 1.3;
      }
    }
    const size = Math.hypot(x, y);
    const cap = 1.1;
    return size > cap ? { x: (x / size) * cap, y: (y / size) * cap } : { x, y };
  }

  /**
   * One neighbour bolting is reason enough. Only a fresh fright spreads, and it
   * spreads weaker than it arrived, so a box never panics itself empty.
   */
  private catchFright(viv: Vivarium, others: readonly Creature[]): void {
    if (this.held || this.fear > 0) return;
    for (const other of others) {
      if (other === this || other.fear < FEAR_SECONDS * 0.8) continue;
      if (Math.hypot(other.bodyX - this.bodyX, other.bodyY - this.bodyY) > viv.unit * 1.8) continue;
      this.startle(other.frightX, other.frightY);
      return;
    }
  }

  private nearestFood(foods: readonly Food[], viv: Vivarium, carry = 1): Food | null {
    if (!this.forages) return null;
    let best: Food | null = null;
    // An empty stomach carries a long way.
    let bestAway = SMELL * viv.unit * (this.hunger >= HUNGRY_AT ? 2.2 : 1) * carry;
    for (const food of foods) {
      if (food.eaten || !food.landed) continue;
      const away = Math.hypot(food.x - this.bodyX, food.y - this.bodyY);
      if (away < bestAway) {
        bestAway = away;
        best = food;
      }
    }
    return best;
  }

  /** Snap up whatever is under its nose. */
  private bite(foods: readonly Food[], viv: Vivarium): boolean {
    if (!this.forages || this.surface !== 'ground' || this.held) return false;
    const mouthX = this.bodyX + Math.cos(this.heading) * this.length * 0.2;
    const mouthY = this.bodyY + Math.sin(this.heading) * this.length * 0.2;
    const reach = Math.max(viv.unit * 0.32, this.length * 0.3);
    for (const food of foods) {
      if (food.eaten || !food.landed) continue;
      if (Math.hypot(food.x - mouthX, food.y - mouthY) < reach) {
        food.eaten = true;
        this.feed();
        return true;
      }
    }
    return false;
  }

  /** Keep it on the soil, and off the glass it cannot climb. */
  private keepIn(viv: Vivarium): void {
    const margin = this.groundMargin(viv);
    if (this.x < viv.wallL + margin) {
      this.x = viv.wallL + margin;
      this.vx = Math.abs(this.vx);
    }
    if (this.x > viv.wallR - margin) {
      this.x = viv.wallR - margin;
      this.vx = -Math.abs(this.vx);
    }
    if (this.y < viv.floor) {
      this.y = viv.floor;
      this.vy = Math.abs(this.vy);
    }
    if (this.y > viv.front) {
      this.y = viv.front;
      this.vy = -Math.abs(this.vy);
    }
  }
}

/** Where in the soil bank `y` sits, 0 at the back and 1 against the front glass. */
export function bankAt(y: number, viv: Vivarium): number {
  const deep = viv.front - viv.floor;
  return deep > 0 ? Math.min(1, Math.max(0, (y - viv.floor) / deep)) : 0;
}

/** The other way round: where in the box a bank fraction lands. */
export function bankY(at: number, viv: Vivarium): number {
  return viv.floor + (viv.front - viv.floor) * Math.min(1, Math.max(0, at));
}

export * from './scenery';
export * from './mist';
export * from './save';
