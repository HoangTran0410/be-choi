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
import type { FxKind } from '../../core/audio';

// ---- who lives in the box ----

export type CreatureKind = 'reptile' | 'snake' | 'turtle' | 'bug' | 'hopper' | 'snail' | 'flyer';
export type Pattern = 'none' | 'bands' | 'spots' | 'stripes';

export interface Species {
  id: string;
  /** Vietnamese name, spoken when the child taps it. */
  name: string;
  kind: CreatureKind;
  /** Dark back, light belly, and the colour of the legs. */
  back: string;
  belly: string;
  limb: string;
  pattern: Pattern;
  patternColor: string;
  /** Body length, in box units (one unit is a seventh of the box's short side). */
  size: number;
  /** Half-widths head to tail, as a fraction of the body length. */
  profile: readonly number[];
  /** Walking speed, box units per second. */
  speed: number;
  /** Walks up the glass and across the lid. The reason to have a lid at all. */
  climbs: boolean;
  /** Awake after dark and dozing by day. The lamp button swaps who is busy. */
  nocturnal: boolean;
  /** Towards a finger (1) or away from it (-1). Shy ones are half the fun. */
  curious: number;
  /** A recorded or synthesized voice, for the ones that have one. */
  voice?: FxKind;
}

// Half-widths as a fraction of body length. A lizard is far longer than it is
// deep, and the tail has to come down to nearly nothing or it reads as a stump.
const LIZARD = [0.075, 0.105, 0.115, 0.09, 0.06, 0.033, 0.014];
const STOUT = [0.095, 0.135, 0.145, 0.11, 0.07, 0.038, 0.015];
const NOODLE = [0.048, 0.058, 0.06, 0.055, 0.045, 0.03, 0.012];
const SHELL = [0.14, 0.2, 0.22, 0.17, 0.1, 0.05, 0.02];
const CHUBBY = [0.16, 0.23, 0.245, 0.19, 0.11, 0.055, 0.022];
const BEETLE = [0.13, 0.19, 0.2, 0.155, 0.095, 0.05, 0.02];
const TINY = [0.11, 0.16, 0.15, 0.12, 0.08, 0.045, 0.018];

export const SPECIES: readonly Species[] = [
  {
    id: 'gecko',
    name: 'con thạch sùng',
    kind: 'reptile',
    back: '#d6bda7',
    belly: '#faf1e8',
    limb: '#c0a289',
    pattern: 'spots',
    patternColor: '#8b6f5c',
    size: 1.05,
    profile: LIZARD,
    speed: 1.5,
    climbs: true,
    nocturnal: true,
    curious: 0.5,
  },
  {
    id: 'lizard',
    name: 'con thằn lằn',
    kind: 'reptile',
    back: '#4ade80',
    belly: '#dcfce7',
    limb: '#22c55e',
    pattern: 'bands',
    patternColor: '#166534',
    size: 1.2,
    profile: LIZARD,
    speed: 1.7,
    climbs: false,
    nocturnal: false,
    curious: -0.5,
  },
  {
    id: 'chameleon',
    name: 'con tắc kè hoa',
    kind: 'reptile',
    back: '#2dd4bf',
    belly: '#ccfbf1',
    limb: '#14b8a6',
    pattern: 'spots',
    patternColor: '#fbbf24',
    size: 1.15,
    profile: STOUT,
    speed: 0.45,
    climbs: true,
    nocturnal: false,
    curious: 0,
  },
  {
    id: 'turtle',
    name: 'con rùa',
    kind: 'turtle',
    back: '#65a30d',
    belly: '#d9f99d',
    limb: '#4d7c0f',
    pattern: 'spots',
    patternColor: '#3f6212',
    size: 1.1,
    profile: SHELL,
    speed: 0.35,
    climbs: false,
    nocturnal: false,
    curious: -0.4,
  },
  {
    id: 'snake',
    name: 'con rắn',
    kind: 'snake',
    back: '#fbbf24',
    belly: '#fef3c7',
    limb: '#f59e0b',
    pattern: 'bands',
    patternColor: '#ea580c',
    size: 2.1,
    profile: NOODLE,
    speed: 0.95,
    climbs: false,
    nocturnal: false,
    curious: 0.4,
  },
  {
    id: 'frog',
    name: 'con ếch',
    kind: 'hopper',
    back: '#22c55e',
    belly: '#dcfce7',
    limb: '#16a34a',
    pattern: 'spots',
    patternColor: '#166534',
    size: 0.85,
    profile: CHUBBY,
    speed: 1.1,
    climbs: false,
    nocturnal: true,
    curious: 0.6,
    voice: 'frog',
  },
  {
    id: 'cricket',
    name: 'con dế',
    kind: 'hopper',
    back: '#78716c',
    belly: '#d6d3d1',
    limb: '#44403c',
    pattern: 'stripes',
    patternColor: '#292524',
    size: 0.45,
    profile: BEETLE,
    speed: 1.4,
    climbs: false,
    nocturnal: true,
    curious: -1,
    voice: 'cricket',
  },
  {
    id: 'ladybug',
    name: 'con bọ rùa',
    kind: 'bug',
    back: '#ef4444',
    belly: '#7f1d1d',
    limb: '#1c1917',
    pattern: 'spots',
    patternColor: '#111827',
    size: 0.42,
    profile: BEETLE,
    speed: 1.1,
    climbs: true,
    nocturnal: false,
    curious: 1,
  },
  {
    id: 'ant',
    name: 'con kiến',
    kind: 'bug',
    back: '#7c2d12',
    belly: '#431407',
    limb: '#1c1917',
    pattern: 'none',
    patternColor: '#fff',
    size: 0.32,
    profile: TINY,
    speed: 2,
    climbs: true,
    nocturnal: false,
    curious: 1,
  },
  {
    id: 'beetle',
    name: 'con bọ cánh cứng',
    kind: 'bug',
    back: '#10b981',
    belly: '#064e3b',
    limb: '#065f46',
    pattern: 'stripes',
    patternColor: '#facc15',
    size: 0.7,
    profile: BEETLE,
    speed: 0.75,
    climbs: false,
    nocturnal: false,
    curious: -0.5,
  },
  {
    id: 'snail',
    name: 'con ốc sên',
    kind: 'snail',
    back: '#d97706',
    belly: '#fef3c7',
    limb: '#fbbf24',
    pattern: 'none',
    patternColor: '#fff',
    size: 0.6,
    profile: STOUT,
    speed: 0.18,
    climbs: true,
    nocturnal: true,
    curious: 0,
  },
  {
    id: 'butterfly',
    name: 'con bướm',
    kind: 'flyer',
    back: '#f472b6',
    belly: '#fbcfe8',
    limb: '#be185d',
    pattern: 'spots',
    patternColor: '#fde047',
    size: 0.62,
    profile: TINY,
    speed: 1,
    climbs: false,
    nocturnal: false,
    curious: 0.3,
  },
];

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id);
}

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

/** Which pane of glass (or which side of the soil) an animal is standing on. */
export type Surface = 'ground' | 'left' | 'right' | 'ceiling' | 'air';

/** Which way this animal's feet point, given what it is standing on. */
export function footDir(surface: Surface): { x: number; y: number } {
  switch (surface) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'ceiling':
      return { x: 0, y: -1 };
    default:
      return { x: 0, y: 1 };
  }
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
  const out: Shelter[] = plants.map((plant) => ({
    x: plant.x,
    y: plant.y - plant.h * 0.25,
    r: Math.max(viv.unit * 0.5, plant.h * 0.4),
  }));
  for (const d of decor) {
    if (d.kind === 'dish' || d.kind === 'flower') continue;
    out.push({ x: d.x, y: d.y - d.size * viv.unit * 0.3, r: d.size * viv.unit * 0.55 });
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
    this.vx = Math.cos(this.heading) * species.speed * viv.unit;
    this.pose();
    this.wander(viv, rng);
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

  /** Picked up. It stops walking and simply goes where the finger goes. */
  hold(px: number, py: number): void {
    this.held = true;
    this.hiding = false;
    this.den = null;
    this.falling = false;
    this.lift = 0;
    this.hopAt = 0;
    this.x = px;
    this.y = py;
  }

  /** Put back down: a giddy moment, then off it goes. */
  release(viv: Vivarium): void {
    if (!this.held) return;
    this.held = false;
    this.dizzy = 1.1;
    this.joy = JOY_SECONDS;
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
    for (let i = 0; i < this.spine.joints.length; i++) {
      const joint = this.spine.joints[i]!;
      const reach = Math.max(this.spine.widthAt(i) * 2.2, 26);
      if (Math.hypot(px - joint.x, py - joint.y) < reach) return true;
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

    if (this.falling) {
      this.fall(step, viv);
      return false;
    }

    const pace = resting ? NIGHT_PACE : 1;
    if (this.species.kind === 'flyer') return this.flutter(step, viv, world, rng, pace);
    if (this.species.kind === 'hopper') return this.leap(step, viv, world, rng, pace);
    if (this.surface !== 'ground') return this.climb(step, viv, world, pace, rng);
    return this.crawl(step, viv, world, rng, pace);
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

    // Off to the glass. A climber that only found a wall by wandering into one
    // hardly ever climbed; wanting to climb has to mean walking over there.
    if (this.wantsGlass()) {
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
    // stop-start is most of what makes it read as a reptile rather than a toy.
    const darts = this.species.kind === 'reptile' && this.fear === 0;
    if (darts && this.still <= 0 && rng() < step * 0.5) this.still = 0.5 + rng() * 1.6;
    // A frightened turtle does not run anywhere; it stops and shuts the door.
    const ease = this.tucked ? 0.03 : this.hiding ? 0.25 : this.still > 0 ? 0.06 : 1;

    const toX = goal.x - this.bodyX;
    const toY = goal.y - this.bodyY;
    const far = Math.hypot(toX, toY) || 1;
    let wantX = (toX / far) * cruise * ease;
    // The soil bank is shallow, so walking towards the glass is slower than
    // walking along it — otherwise everybody crosses it in one stride.
    let wantY = (toY / far) * cruise * 0.4 * ease;

    const crowd = this.neighbours(viv, world.neighbours ?? []);
    wantX += crowd.x * cruise;
    wantY += crowd.y * cruise * 0.4;

    this.vx += (wantX - this.vx) * Math.min(1, TURN * step);
    this.vy += (wantY - this.vy) * Math.min(1, TURN * step);
    this.x += this.vx * step;
    this.y += this.vy * step;

    // Up the glass, if it fancies it and it is the kind that can. Only from the
    // back of the soil bank: stepping onto a pane from right against the front
    // glass would jump it half the bank's depth in one frame.
    if (this.wantsGlass() && this.y < viv.floor + (viv.front - viv.floor) * 0.55) {
      const edge = this.groundMargin(viv) + viv.unit * 0.06;
      if (this.x <= viv.wallL + edge) return this.takeWall('left', viv, world);
      if (this.x >= viv.wallR - edge) return this.takeWall('right', viv, world);
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

  /** Does it want to be up the glass right now? */
  private wantsGlass(): boolean {
    return this.species.climbs && this.climbFor > 0 && this.hunger < HUNGRY_AT;
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
    }
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
    const wantsDown = this.climbFor <= 0 || this.hunger >= HUNGRY_AT;

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

// ---- scenery ----

export interface Plant {
  x: number;
  /** Where it is planted in the soil bank, so it sorts with the animals. */
  y: number;
  /** Height in px. */
  h: number;
  /** Half-width at the base, px. */
  w: number;
  hue: number;
  sway: number;
  phase: number;
  blades: number;
  /** Seconds left of being pushed about by a finger or a passing animal. */
  shake: number;
}

export function makePlants(viv: Vivarium, rng: () => number = Math.random): Plant[] {
  const n = Math.max(6, Math.round(viv.w / 85));
  return Array.from({ length: n }, (_, i) => ({
    x: viv.w * ((i + 0.5 + (rng() - 0.5) * 0.6) / n),
    y: viv.floor + (viv.front - viv.floor) * (0.1 + rng() * 0.55),
    h: viv.unit * (0.9 + rng() * 1.6),
    w: viv.unit * (0.06 + rng() * 0.05),
    hue: 90 + rng() * 60,
    sway: 0.15 + rng() * 0.25,
    phase: rng() * Math.PI * 2,
    blades: 3 + Math.floor(rng() * 3),
    shake: 0,
  }));
}

export interface Pebble {
  x: number;
  y: number;
  r: number;
  squash: number;
  tint: number;
}

export function makePebbles(viv: Vivarium, rng: () => number = Math.random): Pebble[] {
  const n = Math.max(5, Math.round(viv.w / 90));
  return Array.from({ length: n }, () => ({
    x: viv.w * rng(),
    y: viv.floor + (viv.front - viv.floor) * rng(),
    r: viv.unit * (0.06 + rng() * 0.13),
    squash: 0.45 + rng() * 0.3,
    tint: rng(),
  }));
}

/** Things that sit in the box and never move on their own: the furniture. */
export type DecorKind = 'rock' | 'log' | 'branch' | 'cave' | 'dish' | 'flower' | 'leaf' | 'moss';

export interface Decor {
  kind: DecorKind;
  x: number;
  /** Where in the soil bank it stands, for drawing order. */
  y: number;
  /** Size in box units. */
  size: number;
  /** Which parallax layer it belongs to. */
  layer: 'far' | 'mid' | 'near';
  phase: number;
  hue: number;
  /** Seconds left of reacting to being poked: a wobble, a ripple, a puff of petals. */
  poke: number;
  /** The water dish is the one that stays how the child left it. */
  open: boolean;
}

/** Ornaments, laid out in slots across the soil so nothing lands on anything else. */
export function makeDecor(viv: Vivarium, rng: () => number = Math.random): Decor[] {
  const roomy = viv.w > 640;
  const plan: { kind: DecorKind; size: number; layer: Decor['layer'] }[] = [
    { kind: 'rock', size: 1.1, layer: 'far' },
    { kind: 'log', size: 2.2, layer: 'far' },
    { kind: 'branch', size: 2, layer: 'far' },
    { kind: 'moss', size: 0.9, layer: 'mid' },
    { kind: 'dish', size: 0.95, layer: 'mid' },
    ...(roomy
      ? ([
          { kind: 'cave', size: 1.35, layer: 'mid' },
          { kind: 'flower', size: 0.75, layer: 'mid' },
        ] as const)
      : []),
    { kind: 'flower', size: 0.85, layer: 'near' },
    { kind: 'leaf', size: 2.4, layer: 'near' },
  ];
  // A narrow box gets smaller ornaments rather than fewer of them, and every one
  // is pulled far enough from the glass to stand there whole.
  const shrink = Math.max(0.55, Math.min(1, viv.w / 720));
  const slot = viv.w / plan.length;
  let corner = 0;
  return plan.map((item, i) => {
    const size = item.size * shrink;
    const half = size * viv.unit * 0.8;
    // Foreground pieces frame the picture from the corners; in the middle they
    // would spend their time standing in front of whichever animal the child wants.
    const want = item.layer === 'near' ? viv.w * (corner++ % 2 === 0 ? 0.96 : 0.04) : slot * (i + 0.5) + (rng() - 0.5) * slot * 0.35;
    const depth = item.layer === 'far' ? 0.1 : item.layer === 'mid' ? 0.45 : 0.9;
    return {
      kind: item.kind,
      size,
      layer: item.layer,
      x: item.layer === 'near' ? want : Math.max(half, Math.min(viv.w - half, want)),
      y: viv.floor + (viv.front - viv.floor) * depth,
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
export function decorReach(d: Decor, viv: Vivarium): number {
  return Math.max(viv.unit * 0.6, d.size * viv.unit * 0.7);
}

/** The ornament under `(x, y)`, if any. Nearest first, so overlapping pieces behave. */
export function decorAt(decor: readonly Decor[], x: number, y: number, viv: Vivarium): Decor | null {
  let best: Decor | null = null;
  let bestAway = Infinity;
  for (const d of decor) {
    const away = Math.hypot(d.x - x, d.y - d.size * viv.unit * 0.35 - y);
    if (away < decorReach(d, viv) && away < bestAway) {
      bestAway = away;
      best = d;
    }
  }
  return best;
}

/** The plant under `(x, y)`, if any. */
export function plantAt(plants: readonly Plant[], x: number, y: number, viv: Vivarium): Plant | null {
  let best: Plant | null = null;
  let bestAway = Infinity;
  for (const plant of plants) {
    if (y < plant.y - plant.h * 1.15) continue;
    const away = Math.abs(plant.x - x);
    if (away < Math.max(viv.unit * 0.45, plant.w * 3) && away < bestAway) {
      bestAway = away;
      best = plant;
    }
  }
  return best;
}

/** What a poke does, so `index.ts` only has to draw the result. */
export function pokeDecor(d: Decor): void {
  d.poke = POKE_SECONDS;
  if (d.kind === 'dish') d.open = !d.open;
}

/** Let every reaction die away by `dt`. */
export function settleScenery(plants: readonly Plant[], decor: readonly Decor[], dt: number): void {
  for (const plant of plants) plant.shake = Math.max(0, plant.shake - dt);
  for (const d of decor) d.poke = Math.max(0, d.poke - dt);
}

// ---- misting ----

/** A drop of water on the inside of the glass, running down and drying out. */
export interface Drop {
  x: number;
  y: number;
  r: number;
  /** How fast it runs down, px per second. */
  run: number;
  /** Seconds of life left. */
  life: number;
}

/** How long the glass stays wet after one press of the spray. */
export const MIST_SECONDS = 6;
/** How many drops one press puts on the glass. */
export const DROPS_PER_MIST = 26;

export function makeDrops(viv: Vivarium, n = DROPS_PER_MIST, rng: () => number = Math.random): Drop[] {
  return Array.from({ length: n }, () => ({
    x: viv.w * rng(),
    y: viv.h * rng() * 0.8,
    r: viv.unit * (0.02 + rng() * 0.05),
    run: viv.unit * (0.1 + rng() * 0.7),
    life: MIST_SECONDS * (0.5 + rng() * 0.9),
  }));
}

/** Run the drops down the glass by `dt`, and drop the ones that have dried. */
export function stepDrops(drops: Drop[], dt: number): void {
  for (let i = drops.length - 1; i >= 0; i--) {
    const drop = drops[i]!;
    drop.life -= dt;
    // A big drop runs, a small one clings: that is the whole of why misted glass
    // reads as glass and not as a scatter of dots.
    drop.y += drop.run * dt * (drop.r > 0 ? 1 : 0);
    if (drop.life <= 0) drops.splice(i, 1);
  }
}

// ---- the box the child built ----

/** The key the box is kept under. */
export const SAVE_KEY = 'be-choi:terrarium';

/**
 * What is worth remembering between visits: who lives here, and where the child
 * put the furniture. Positions are fractions of the box's width, so the log stays
 * where it was put when the tablet is turned on its side.
 */
export interface VivSave {
  v: 1;
  /** Species ids, one per animal. */
  pets: string[];
  /** Fraction of the box width, one per ornament, in `makeDecor` order. */
  decor: number[];
  /** Fraction of the box width, one per plant, in `makePlants` order. */
  plants: number[];
  /** Lights out: the child left the box on its night setting. */
  night?: boolean;
}

const EMPTY_SAVE: VivSave = { v: 1, pets: [], decor: [], plants: [], night: false };

/** Anything unreadable, from an older version or another app, is simply ignored. */
export function readSave(raw: string | null): VivSave | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const save = parsed as Partial<VivSave>;
    if (save.v !== 1) return null;
    const fractions = (list: unknown): number[] =>
      Array.isArray(list) ? list.filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 1) : [];
    const pets = Array.isArray(save.pets)
      ? save.pets.filter((id): id is string => typeof id === 'string' && speciesById(id) !== undefined)
      : [];
    return {
      v: 1,
      pets: trimStock(pets),
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
  viv: Vivarium,
  night = false,
): VivSave {
  const across = (x: number): number => Math.min(1, Math.max(0, viv.w > 0 ? x / viv.w : 0));
  return {
    v: 1,
    pets: trimStock(creatures, (cr) => cr.species.id).map((cr) => cr.species.id),
    decor: decor.map((d) => across(d.x)),
    plants: plants.map((plant) => across(plant.x)),
    night,
  };
}

/**
 * Put the saved positions back. A different screen can hold a different number
 * of plants, so anything the save does not cover keeps where it was generated.
 */
export function applySave(save: VivSave, decor: Decor[], plants: Plant[], viv: Vivarium): void {
  save.decor.forEach((fraction, i) => {
    const d = decor[i];
    if (d) d.x = fraction * viv.w;
  });
  save.plants.forEach((fraction, i) => {
    const plant = plants[i];
    if (plant) plant.x = fraction * viv.w;
  });
}

/** The animals a saved box asks for, or `null` when there is no usable save. */
export function savedStock(save: VivSave | null): Species[] | null {
  if (!save || save.pets.length === 0) return null;
  const out: Species[] = [];
  for (const id of save.pets) {
    const species = speciesById(id);
    if (species) out.push(species);
  }
  return out.length > 0 ? out : null;
}

export { EMPTY_SAVE };
