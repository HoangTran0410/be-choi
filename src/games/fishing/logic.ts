/**
 * Câu cá, with no DOM in sight: the line, the bait on the end of it, and the
 * rule that decides when a fish takes it.
 *
 * The fish themselves are the aquarium's fish — the same species, the same
 * bodies, the same hunger and fright — because a fish caught here swims into
 * that tank afterwards, and a child would notice at once if it changed on the
 * way. `index.ts` only draws what this file has decided.
 */
import { Creature, SPECIES, type Species, type Tank } from '../aquarium/logic';

/** Where the line hangs from, as a fraction across the top of the water. */
export const ROD_X = 0.5;

/**
 * What else is down there. Half the reason to cast again is not knowing what is
 * coming up — a lake that only ever gives you fish is a lake you have finished
 * with after three of them.
 */
export interface Junk {
  id: string;
  emoji: string;
  /** Said when it breaks the surface. */
  say: string;
  /** Worth a fuss: confetti and a star of its own. */
  treasure?: boolean;
}

export const JUNK: readonly Junk[] = [
  { id: 'boot', emoji: '👢', say: 'Ơ, cái ủng cũ!' },
  { id: 'bottle', emoji: '🍾', say: 'Cái chai thôi!' },
  { id: 'weed', emoji: '🌿', say: 'Toàn rong biển!' },
  { id: 'shell', emoji: '🐚', say: 'Vỏ sò đẹp quá!' },
  { id: 'can', emoji: '🥫', say: 'Vỏ hộp cũ!' },
  { id: 'gem', emoji: '💎', say: 'Ôi, viên ngọc!', treasure: true },
  { id: 'chest', emoji: '🗝️', say: 'Chìa khoá kho báu!', treasure: true },
];

/** Treasure is rare enough to be worth shouting about. */
export const TREASURE_CHANCE = 0.18;
/** How many things are drifting about down there at once. */
export const DRIFTERS = 4;
/** Close enough to the bait to foul it, in tank units. */
export const SNAG_REACH = 0.45;

/**
 * A boot or a bottle drifting through the water. They are visible, they move,
 * and the bait fouls on them — which turns half the game into steering around
 * things rather than waiting for a timer to fire.
 */
export interface Drifter {
  junk: Junk;
  x: number;
  y: number;
  /** Units per second. */
  vx: number;
  vy: number;
  /** Where it is in its slow tumble. */
  turn: number;
  spin: number;
}

export function makeDrifters(tank: Tank, n = DRIFTERS, rng: () => number = Math.random): Drifter[] {
  return Array.from({ length: n }, () => {
    const pool = rng() < TREASURE_CHANCE ? JUNK.filter((j) => j.treasure) : JUNK.filter((j) => !j.treasure);
    return {
      junk: pool[Math.floor(rng() * pool.length)] ?? JUNK[0]!,
      x: rng() * tank.w,
      y: tank.h * (0.25 + rng() * 0.6),
      vx: (rng() - 0.5) * 0.5,
      vy: (rng() - 0.5) * 0.18,
      turn: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 0.8,
    };
  });
}

/** Drift on, wrapping round the sides and bouncing off the surface and the sand. */
export function stepDrifter(d: Drifter, dt: number, tank: Tank): void {
  d.x += d.vx * tank.unit * dt;
  d.y += d.vy * tank.unit * dt;
  d.turn += d.spin * dt;
  const edge = tank.unit * 0.6;
  if (d.x < -edge) d.x = tank.w + edge;
  if (d.x > tank.w + edge) d.x = -edge;
  const top = tank.h * 0.2;
  const bottom = tank.floor - tank.unit * 0.3;
  if (d.y < top) {
    d.y = top;
    d.vy = Math.abs(d.vy);
  }
  if (d.y > bottom) {
    d.y = bottom;
    d.vy = -Math.abs(d.vy);
  }
}

/** The drifting thing the bait has fouled on, if any. */
export function snaggedOn(hook: Hook, drifters: readonly Drifter[], tank: Tank): Drifter | null {
  if (hook.caught || hook.junk || !hook.baited || isOutOfWater(hook, tank)) return null;
  for (const d of drifters) {
    if (Math.hypot(d.x - hook.x, d.y - hook.y) < SNAG_REACH * tank.unit) return d;
  }
  return null;
}

// ---- the ones that pass through ----

/**
 * Now and then something far too big comes through the lake, crosses it and is
 * gone. It cannot be caught: if the bait is in its way it takes it and keeps
 * going, and the child has to put a new one on.
 *
 * They live here rather than in the aquarium's species list on purpose — nobody
 * should be able to put a crocodile in a fish tank from the picker.
 */
export const HAZARD_IDS: readonly string[] = ['shark', 'croc', 'seasnake'];

export function isHazard(cr: Creature): boolean {
  return HAZARD_IDS.includes(cr.species.id);
}

const LONG_LOW = [0.055, 0.085, 0.09, 0.08, 0.06, 0.038, 0.016];
const SNAKE = [0.03, 0.045, 0.05, 0.048, 0.042, 0.03, 0.014];
const BIG_FISH = [0.085, 0.145, 0.155, 0.125, 0.085, 0.05, 0.022];

export const MONSTERS: readonly Species[] = [
  {
    id: 'shark', name: 'cá mập', kind: 'fish',
    back: '#64748b', belly: '#e2e8f0', fin: '#475569', pattern: 'none', patternColor: '#ffffff',
    size: 3.2, profile: BIG_FISH, speed: 1.6, depth: 0.45, curious: 0, count: 1,
  },
  {
    id: 'croc', name: 'cá sấu', kind: 'fish',
    back: '#3f6212', belly: '#a3a380', fin: '#365314', pattern: 'patches', patternColor: '#1a2e05',
    size: 3.6, profile: LONG_LOW, speed: 1.3, depth: 0.24, curious: 0, count: 1,
  },
  {
    id: 'seasnake', name: 'con rắn biển', kind: 'fish',
    back: '#0f766e', belly: '#fde68a', fin: '#134e4a', pattern: 'stripes', patternColor: '#fef08a',
    size: 3.4, profile: SNAKE, speed: 1.9, depth: 0.6, curious: 0, count: 1,
  },
];

/**
 * Seconds between one monster leaving and the next arriving. Long: a shark every
 * fifteen seconds is a lake nobody can fish, and stops being frightening by the
 * third time. This way it is an event.
 */
export const VISIT_MIN_GAP = 26;
export const VISIT_MAX_GAP = 48;
/** Close enough to take the bait off the hook as it goes by, in tank units. */
export const STEAL_REACH = 1.5;
/** Everything within this of a passing monster is frightened, in tank units. */
export const DREAD_REACH = 2.6;

/** Seconds until the next monster comes through. */
export function nextVisit(rng: () => number = Math.random): number {
  return VISIT_MIN_GAP + rng() * (VISIT_MAX_GAP - VISIT_MIN_GAP);
}

/** Which one, which way, and how deep. */
export function planVisit(tank: Tank, rng: () => number = Math.random): { species: Species; dir: 1 | -1; y: number } {
  const species = MONSTERS[Math.floor(rng() * MONSTERS.length)] ?? MONSTERS[0]!;
  const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;
  const top = tank.h * 0.2;
  return { species, dir, y: top + (tank.floor - top) * (0.15 + rng() * 0.7) };
}

/** Has it crossed the water and gone? */
export function visitOver(cr: Creature, tank: Tank): boolean {
  return cr.x < -cr.length * 1.6 || cr.x > tank.w + cr.length * 1.6;
}

/** The bait on the end of the line. */
export interface Hook {
  x: number;
  y: number;
  /** How fast it is being dragged, in px per second, smoothed. */
  speed: number;
  /** The fish on the line, if any. */
  caught: Creature | null;
  /** The thing that is not a fish on the line, if any. */
  junk: Junk | null;
  /**
   * Is there a bait on the hook? A landed catch takes it with it, and the line
   * fishes for nothing until the child casts again. Without this the line goes
   * on catching fish while it dangles in the air with nobody holding it.
   */
  baited: boolean;
  /** Seconds the bait has been sitting quietly. Fish will not come to a jumpy one. */
  steady: number;
  /** Where a cast is heading. Picked once, so the line does not wander mid-flight. */
  aimX: number;
  aimY: number;
  /**
   * Seconds of hauling left in the child's last tug. While this lasts the line
   * comes up; when it runs out the fish takes it back down.
   */
  pull: number;
  /** How deep the line was when the fish took it: the mark it must not sink back past. */
  fightFrom: number;
}

export function makeHook(tank: Tank): Hook {
  return {
    x: tank.w * ROD_X,
    y: tank.h * 0.3,
    speed: 0,
    caught: null,
    junk: null,
    baited: true,
    steady: 0,
    aimX: tank.w * ROD_X,
    aimY: tank.h * 0.3,
    pull: 0,
    fightFrom: tank.h * 0.3,
  };
}

/**
 * How long the bait must sit quietly before a fish will risk it. Short enough
 * that a patient child is rewarded within a few seconds, long enough that the
 * lake is not simply a magnet.
 */
export const STEADY_SECONDS = 2.4;

/** Count the quiet seconds, and start again the moment the line is snatched. */
export function tickSteady(hook: Hook, dt: number, tank: Tank): void {
  hook.steady = isJerking(hook, tank) ? 0 : hook.steady + dt;
}

/**
 * Drag the hook to `(x, y)` over `dt` seconds, keeping it in the water and
 * remembering how fast it moved — which is the whole game.
 */
export function moveHook(hook: Hook, x: number, y: number, dt: number, tank: Tank): void {
  const edge = tank.unit * 0.35;
  const nextX = Math.min(tank.w - edge, Math.max(edge, x));
  const nextY = Math.min(tank.floor - edge, Math.max(tank.h * 0.06, y));
  const moved = Math.hypot(nextX - hook.x, nextY - hook.y);
  const rate = dt > 0 ? moved / dt : 0;
  // Smoothed, so one twitchy frame does not read as a yank.
  hook.speed += (rate - hook.speed) * Math.min(1, dt * 8);
  hook.x = nextX;
  hook.y = nextY;
}

/** Let the remembered speed fall away while the finger is off the screen. */
export function settleHook(hook: Hook, dt: number): void {
  hook.speed = Math.max(0, hook.speed - hook.speed * Math.min(1, dt * 4));
}

/**
 * Faster than this, in tank units per second, and the bait is being yanked about.
 * Set so that walking the bait around the lake is fine and flicking it is not:
 * too strict and a child cannot move the line at all without emptying the water.
 */
export const JERK_SPEED = 5;

/** How close a mouth must come to the bait to take it, in tank units. */
export const BITE_REACH = 0.42;
/** A jerk this close frightens a fish, in tank units. */
export const JERK_REACH = 2.4;
/** Fish are drawn to bait from this far, in tank units — further than a flake. */
export const BAIT_SMELL = 3.4;
/** Catches before the celebration and the star. */
export const CATCH_FOR_STAR = 3;
/** How many fish swim in the lake at once. */
export const LAKE_MIN = 5;
export const LAKE_MAX = 8;

/** Is the bait being moved too fast to be worth trusting? */
export function isJerking(hook: Hook, tank: Tank): boolean {
  return hook.speed > JERK_SPEED * tank.unit;
}

/**
 * Who is on the end of the line now. A fish takes the bait when it is hungry,
 * unafraid, and its mouth reaches a bait that is being held reasonably still.
 * Anything else is just a fish looking at a hook.
 */
export function biter(hook: Hook, fish: readonly Creature[], tank: Tank): Creature | null {
  // A bait held in the air catches nothing, an empty hook catches nothing, and a
  // bait that has only just stopped moving has not settled yet.
  if (hook.caught || hook.junk || !hook.baited || isJerking(hook, tank) || isOutOfWater(hook, tank)) return null;
  if (hook.steady < STEADY_SECONDS) return null;
  for (const cr of fish) {
    if (cr.fear > 0 || cr.mood !== 'hungry' || isHazard(cr)) continue;
    const mouthX = cr.x + Math.cos(cr.heading) * cr.length * 0.15;
    const mouthY = cr.y + Math.sin(cr.heading) * cr.length * 0.15;
    if (Math.hypot(hook.x - mouthX, hook.y - mouthY) < BITE_REACH * tank.unit) return cr;
  }
  return null;
}

/** The water starts here: above this line the bait is dangling in the air. */
export const WATERLINE = 0.14;

/** Is the bait out of the water, where no fish can reach it? */
export function isOutOfWater(hook: Hook, tank: Tank): boolean {
  return hook.y <= tank.h * WATERLINE;
}

/** High enough out of the water to count as landed. */
export function isLanded(hook: Hook, tank: Tank): boolean {
  return (hook.caught !== null || hook.junk !== null) && hook.y <= tank.h * 0.12;
}

/**
 * A fish this long fights the line: it comes up slowly, pulling as it goes, and
 * hauling it out is something the child did rather than something that happened.
 */
export const FIGHTER_SIZE = 1.1;

/** How hard the thing on the line is to lift, 1 being a bare hook. */
export function pullOf(hook: Hook): number {
  if (hook.junk) return 0.55;
  if (!hook.caught) return 1;
  return hook.caught.species.size >= FIGHTER_SIZE ? 0.32 : 0.8;
}

/**
 * Who can be caught. A jellyfish cannot steer to a bait, so it would only ever
 * be an animal the child could not catch — but a crab will come along the sand
 * for one, which gives the bottom of the lake a reason to be visited.
 */
export const CATCHABLE: readonly Species[] = SPECIES.filter(
  (s) => (s.kind === 'fish' || s.kind === 'ray' || s.kind === 'crab') && !HAZARD_IDS.includes(s.id),
);

/** Which fish live in this lake: a handful, never two of anything unusual. */
export function lakeStock(tank: Tank, rng: () => number = Math.random): Species[] {
  const room = (tank.w * tank.h) / (520 * 820);
  const n = Math.round(Math.max(LAKE_MIN, Math.min(LAKE_MAX, LAKE_MIN + room * 2)));
  const pool = CATCHABLE;
  return Array.from({ length: n }, () => pool[Math.floor(rng() * pool.length)] ?? pool[0]!);
}

/** A fish to take the place of one that has just been lifted out. */
export function replacement(rng: () => number = Math.random): Species {
  return CATCHABLE[Math.floor(rng() * CATCHABLE.length)] ?? CATCHABLE[0]!;
}

/** How fast the reel button hauls the line up, in tank units per second. */
export const REEL_SPEED = 5.5;

/** How long one tug on the reel keeps hauling for. Tap again inside this. */
export const PULL_SECONDS = 0.62;
/** How fast the fish takes the line back while nobody is tugging, in units per second. */
export const SLIP_SPEED = 2.4;
/** Let it sink this far past where it was hooked and the fish is off, in units. */
export const ESCAPE_SLIP = 3;

/**
 * Put a fresh bait on right here. The child dropping the line in themselves is
 * a cast like any other: it has to settle before anything will come to it.
 */
export function castHere(hook: Hook, x: number, y: number, tank: Tank): void {
  hook.baited = true;
  hook.pull = 0;
  moveHook(hook, x, y, 1, tank);
  // After the move, or moveHook would write the speed of the drop back in.
  hook.steady = 0;
  hook.speed = 0;
  hook.aimX = hook.x;
  hook.aimY = hook.y;
}

/** One tug on the reel: the line comes up for a moment. */
export function tug(hook: Hook): void {
  hook.pull = PULL_SECONDS;
}

/** Is the fish beating the child back down the line? */
export function isSlipping(hook: Hook): boolean {
  return (hook.caught !== null || hook.junk !== null) && hook.pull <= 0;
}

/**
 * Let the fish take line back. True when it has taken enough of it to get off:
 * the child stopped tugging, and a fish that is not being hauled is a fish going
 * home. Nothing else in the game can be lost, and losing this one costs a cast.
 */
export function slip(hook: Hook, dt: number, tank: Tank): boolean {
  hook.y += SLIP_SPEED * tank.unit * dt;
  hook.speed = 0;
  return hook.y > hook.fightFrom + ESCAPE_SLIP * tank.unit || hook.y > tank.floor;
}

/** A cast lands somewhere in this band of the water, never the same spot twice. */
export const CAST_MIN_DEPTH = 0.5;
export const CAST_MAX_DEPTH = 0.78;
/** …and somewhere across this much of the width. */
export const CAST_SPREAD = 0.72;

/**
 * Aim a new cast. Somewhere else every time: a line that always lands on the
 * same spot is a line the child stops watching.
 */
export function aimCast(hook: Hook, tank: Tank, rng: () => number = Math.random): void {
  hook.aimX = tank.w * ((1 - CAST_SPREAD) / 2 + rng() * CAST_SPREAD);
  hook.aimY = tank.h * (CAST_MIN_DEPTH + rng() * (CAST_MAX_DEPTH - CAST_MIN_DEPTH));
}

/** Is the line out of the water with nothing on it, waiting to be cast again? */
export function needsCast(hook: Hook, tank: Tank): boolean {
  return hook.caught === null && hook.junk === null && (!hook.baited || isOutOfWater(hook, tank));
}

/** Drop the line back in, straight down from the rod. */
export function cast(hook: Hook, dt: number, tank: Tank): boolean {
  const step = REEL_SPEED * tank.unit * dt;
  hook.y = Math.min(hook.aimY, hook.y + step);
  const across = hook.aimX - hook.x;
  hook.x += Math.sign(across) * Math.min(step, Math.abs(across));
  hook.speed = 0;
  // A fresh bait goes on as the line goes out, and has to settle like any other.
  hook.baited = true;
  hook.steady = 0;
  return hook.y >= hook.aimY - 0.5 && Math.abs(across) < 1;
}

/**
 * Wind the line in on its own, towards the rod at the surface. A big fish comes
 * up a third as fast and pulls the line about as it does, so landing one is an
 * event rather than a formality.
 */
export function reel(hook: Hook, dt: number, tank: Tank, clock = 0): void {
  hook.pull = Math.max(0, hook.pull - dt);
  const pull = pullOf(hook);
  const step = REEL_SPEED * tank.unit * dt * pull;
  // A fighter surges from side to side all the way up.
  if (pull < 0.5) hook.x += Math.sin(clock * 9) * tank.unit * 1.6 * dt;
  // Everything comes home to the rod: the line ends up straight above the child.
  const across = tank.w * ROD_X - hook.x;
  hook.x += Math.sign(across) * Math.min(step, Math.abs(across));
  hook.y = Math.max(tank.h * 0.08, hook.y - step);
  hook.x = Math.min(tank.w * 0.94, Math.max(tank.w * 0.06, hook.x));
  // Winding in is the child's own doing, so it never counts as a scare.
  hook.speed = 0;
}

// ---- the line itself ----

/**
 * The line, as a little rope simulation. A straight stroke from the rod to the
 * bait reads as a stick; a real line sags under its own weight, lags behind when
 * the bait is moved, and swings when it stops — which is most of what tells a
 * child that the bait is heavy and the water is thick.
 *
 * Verlet integration: each knot remembers where it was last frame, which is all
 * the velocity it needs, and the length between knots is then relaxed back into
 * place a few times. Cheap, stable, and it never explodes.
 */
export interface Knot {
  x: number;
  y: number;
  /** Where it was last frame. The difference is the velocity. */
  px: number;
  py: number;
}

export type Rope = Knot[];

/** Knots in the line. Enough to curve, few enough to relax several times a frame. */
export const ROPE_KNOTS = 14;
/** Line paid out beyond the straight distance, which is what makes it sag. */
export const ROPE_SLACK = 1.07;
/** Downward pull on the line, in tank units per second squared. Water is thick. */
export const ROPE_GRAVITY = 2.2;
/** How much speed a knot keeps from one frame to the next. */
export const ROPE_DAMPING = 0.88;
/** Relaxation passes. More is stiffer; this is enough to look like a line. */
export const ROPE_PASSES = 8;

export function makeRope(fromX: number, fromY: number, toX: number, toY: number): Rope {
  return Array.from({ length: ROPE_KNOTS }, (_, i) => {
    const along = i / (ROPE_KNOTS - 1);
    const x = fromX + (toX - fromX) * along;
    const y = fromY + (toY - fromY) * along;
    return { x, y, px: x, py: y };
  });
}

/**
 * Advance the line one frame. Both ends are pinned — the top to the rod, the
 * bottom to the bait — and everything in between falls, swings and is pulled
 * back to length.
 */
export function stepRope(rope: Rope, dt: number, rod: { x: number; y: number }, hook: Hook, tank: Tank): void {
  const step = Math.min(0.04, Math.max(0, dt));
  const gravity = ROPE_GRAVITY * tank.unit * step * step;
  for (const knot of rope) {
    const vx = (knot.x - knot.px) * ROPE_DAMPING;
    const vy = (knot.y - knot.py) * ROPE_DAMPING;
    knot.px = knot.x;
    knot.py = knot.y;
    knot.x += vx;
    knot.y += vy + gravity;
  }

  const span = Math.hypot(hook.x - rod.x, hook.y - rod.y);
  const rest = (span / (ROPE_KNOTS - 1)) * ROPE_SLACK;
  const first = rope[0];
  const last = rope[rope.length - 1];
  for (let pass = 0; pass < ROPE_PASSES; pass++) {
    // The ends go where they are told; the middle has to make do.
    if (first) {
      first.x = rod.x;
      first.y = rod.y;
    }
    if (last) {
      last.x = hook.x;
      last.y = hook.y;
    }
    for (let i = 0; i < rope.length - 1; i++) {
      const a = rope[i]!;
      const b = rope[i + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const away = Math.hypot(dx, dy);
      if (away < 1e-4) continue;
      const pull = ((away - rest) / away) * 0.5;
      const ox = dx * pull;
      const oy = dy * pull;
      a.x += ox;
      a.y += oy;
      b.x -= ox;
      b.y -= oy;
    }
  }
  if (first) {
    first.x = rod.x;
    first.y = rod.y;
  }
  if (last) {
    last.x = hook.x;
    last.y = hook.y;
  }
}
