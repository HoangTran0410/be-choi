import { solveTwoBone, type Point } from '../../core/creature';
import type { Bubble, Creature, Plant, Rock, Tank } from './logic';

/**
 * How the animals are drawn: bodies built from the spine, fins hung off it, an
 * eye, a pattern, and the little face above the head that says how it feels.
 *
 * This lives apart from the tank so that Câu cá can put the very same fish in
 * its lake. A fish caught there swims into this tank afterwards, and a child
 * would notice at once if it changed shape on the way.
 */
export interface Scene {
  tank: Tank;
  /** Seconds since the scene started, for every wobble and shimmer. */
  clock: number;
  /**
   * Show the little face above each animal saying how it feels. It is the whole
   * point in the tank, where a hungry fish is asking to be fed; in the lake it is
   * a dozen shrimps floating next to a bait, which is just confusing.
   */
  moods?: boolean;
}

/**
 * A curve through the points, so a body reads as flesh rather than a polygon.
 * `move` false continues the path already being built instead of starting a new
 * one — without it the corner drawn before this call is thrown away.
 */
export function smoothPath(c: CanvasRenderingContext2D, pts: readonly Point[], move = true): void {
  if (pts.length === 0) return;
  if (move) c.moveTo(pts[0]!.x, pts[0]!.y);
  else c.lineTo(pts[0]!.x, pts[0]!.y);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = pts[pts.length - 1]!;
  c.lineTo(last.x, last.y);
}

/** A stable number in 0…1 from two others: the same fish keeps the same spots. */
export function hash(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** Where `flanks` leaves its answer. Read them before calling it again. */
const fTop: Point = { x: 0, y: 0 };
const fBottom: Point = { x: 0, y: 0 };

/**
 * The body's two edge points at a vertebra, top first. It fills the two points
 * above rather than returning a fresh pair, because a full tank asks for these
 * a couple of hundred times a frame and every one was a throwaway object.
 */
function flanks(cr: Creature, index: number): void {
  const joint = cr.spine.joints[index];
  if (!joint) return;
  const angle = (cr.spine.angles[index] ?? 0) + Math.PI / 2;
  const width = cr.spine.widthAt(index);
  const dx = Math.cos(angle) * width;
  const dy = Math.sin(angle) * width;
  const ax = joint.x + dx,
    ay = joint.y + dy;
  const bx = joint.x - dx,
    by = joint.y - dy;
  if (ay <= by) {
    fTop.x = ax;
    fTop.y = ay;
    fBottom.x = bx;
    fBottom.y = by;
  } else {
    fTop.x = bx;
    fTop.y = by;
    fBottom.x = ax;
    fBottom.y = ay;
  }
}

function bodyGradient(g: CanvasRenderingContext2D, cr: Creature): CanvasGradient {
  flanks(cr, 2);
  const grad = g.createLinearGradient(fTop.x, fTop.y, fBottom.x, fBottom.y);
  grad.addColorStop(0, cr.species.back);
  grad.addColorStop(0.62, cr.species.belly);
  grad.addColorStop(1, cr.species.belly);
  return grad;
}

function drawFin(g: CanvasRenderingContext2D, at: Point, angle: number, len: number, wide: number, color: string): void {
  g.save();
  g.translate(at.x, at.y);
  g.rotate(angle);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.6, -wide, len, -wide * 0.35);
  g.quadraticCurveTo(len * 0.7, wide * 0.25, 0, wide * 0.2);
  g.closePath();
  g.fill();
  g.restore();
}

function drawPattern(g: CanvasRenderingContext2D, cr: Creature, seed: number, ring: readonly Point[]): void {
  const { species } = cr;
  if (species.pattern === 'none') return;
  g.save();
  // The outline the body was just drawn from, rather than a second one built
  // from scratch: the same eighteen points, and clipping is dear enough already.
  g.beginPath();
  smoothPath(g, ring);
  g.clip();
  g.fillStyle = species.patternColor;
  if (species.pattern === 'stripes') {
    g.globalAlpha = 0.95;
    for (let i = 1; i <= 3; i++) {
      flanks(cr, i);
      const top = fTop,
        bottom = fBottom;
      const thick = cr.length * 0.045;
      const dx = bottom.x - top.x;
      const dy = bottom.y - top.y;
      const norm = Math.hypot(dx, dy) || 1;
      const px = (-dy / norm) * thick;
      const py = (dx / norm) * thick;
      g.beginPath();
      g.moveTo(top.x - px, top.y - py);
      g.lineTo(top.x + px, top.y + py);
      g.lineTo(bottom.x + px, bottom.y + py);
      g.lineTo(bottom.x - px, bottom.y - py);
      g.closePath();
      g.fill();
    }
  } else {
    const n = species.pattern === 'spots' ? 7 : 3;
    g.globalAlpha = species.pattern === 'spots' ? 0.9 : 0.95;
    for (let i = 0; i < n; i++) {
      const joint = cr.spine.joints[1 + (i % 4)]!;
      const off = (hash(seed, i) - 0.5) * cr.length * 0.35;
      const r = cr.length * (species.pattern === 'spots' ? 0.032 : 0.085) * (0.7 + hash(seed, i + 9));
      g.beginPath();
      g.arc(joint.x + off, joint.y + (hash(seed, i + 3) - 0.5) * cr.length * 0.2, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

function drawFish(g: CanvasRenderingContext2D, cr: Creature, seed: number): void {
  const tailJoint = cr.spine.joints[cr.spine.joints.length - 1]!;
  const tailAngle = cr.spine.angles[cr.spine.angles.length - 1]!;
  const swish = Math.sin(cr.phase) * 0.5;
  // Tail fin, behind the body so the body edge hides where it joins on.
  g.save();
  g.translate(tailJoint.x, tailJoint.y);
  g.rotate(tailAngle + Math.PI + swish * 0.4);
  g.fillStyle = cr.species.fin;
  g.globalAlpha = 0.92;
  const tl = cr.length * 0.28;
  const tw = cr.length * 0.2;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(tl * 0.7, -tw * 0.4, tl, -tw);
  g.quadraticCurveTo(tl * 0.55, 0, tl, tw);
  g.quadraticCurveTo(tl * 0.7, tw * 0.4, 0, 0);
  g.closePath();
  g.fill();
  g.restore();

  // Dorsal and pectoral fins.
  flanks(cr, 2);
  drawFin(g, fTop, cr.spine.angles[2]! + Math.PI * 1.35, cr.length * 0.24, cr.length * 0.11, cr.species.fin);
  const side = cr.spine.joints[1]!;
  const flap = Math.sin(cr.phase * 1.6) * 0.5;
  g.globalAlpha = 0.75;
  drawFin(g, side, cr.spine.angles[1]! + Math.PI * 0.75 + flap * 0.3, cr.length * 0.16, cr.length * 0.07, cr.species.fin);
  g.globalAlpha = 1;

  // Body. A path of its own first: the pectoral fin's is still the current one
  // — save and restore do not put a path back — and without this the body fill
  // and its dark edge are painted round that fin as well.
  const ring = cr.spine.outline();
  g.beginPath();
  smoothPath(g, ring);
  g.fillStyle = bodyGradient(g, cr);
  g.fill();
  // A dark edge: without it, two fish that overlap read as one odd shape.
  g.strokeStyle = 'rgba(3,32,54,0.28)';
  g.lineWidth = Math.max(1, cr.length * 0.022);
  g.stroke();
  drawPattern(g, cr, seed, ring);

  // A rim of light along the back. Not clipped: at this width the spill reads as
  // a highlight, and two dozen clips a frame is a real cost on a cheap tablet.
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = Math.max(1.5, cr.length * 0.025);
  g.beginPath();
  for (let i = 0; i <= 4; i++) {
    flanks(cr, i);
    if (i === 0) g.moveTo(fTop.x, fTop.y);
    else g.lineTo(fTop.x, fTop.y);
  }
  g.stroke();

  drawEye(g, cr);
}

function drawEye(g: CanvasRenderingContext2D, cr: Creature): void {
  const head = cr.spine.joints[0]!;
  flanks(cr, 0);
  const top = fTop;
  const ex = head.x + (top.x - head.x) * 0.45 + Math.cos(cr.heading) * cr.length * 0.06;
  const ey = head.y + (top.y - head.y) * 0.45 + Math.sin(cr.heading) * cr.length * 0.06;
  const r = Math.max(2, cr.length * 0.05);
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(ex, ey, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0f172a';
  g.beginPath();
  g.arc(ex + Math.cos(cr.heading) * r * 0.3, ey + Math.sin(cr.heading) * r * 0.3, r * 0.55, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(ex - r * 0.25, ey - r * 0.3, r * 0.22, 0, Math.PI * 2);
  g.fill();
}

function drawJelly(g: CanvasRenderingContext2D, cr: Creature): void {
  const pulse = Math.sin(cr.phase);
  const r = cr.length * 0.42;
  const squash = 1 - pulse * 0.22;
  g.save();
  g.translate(cr.x, cr.y);
  g.globalAlpha = 0.7;
  // Tentacles first: they hang behind the bell.
  g.strokeStyle = cr.species.fin;
  g.lineWidth = Math.max(1.5, r * 0.11);
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x0 = (i / 5 - 0.5) * r * 1.2;
    g.beginPath();
    g.moveTo(x0, r * squash * 0.5);
    for (let s = 1; s <= 4; s++) {
      const along = s / 4;
      g.lineTo(x0 + Math.sin(cr.phase * 1.2 + i + along * 3) * r * 0.3 * along, r * squash * 0.5 + r * 1.7 * along);
    }
    g.stroke();
  }
  const bell = g.createRadialGradient(0, -r * 0.3, r * 0.15, 0, 0, r * 1.1);
  bell.addColorStop(0, '#ffffff');
  bell.addColorStop(0.5, cr.species.back);
  bell.addColorStop(1, cr.species.fin);
  g.fillStyle = bell;
  g.globalAlpha = 0.82;
  g.beginPath();
  g.ellipse(0, 0, r * (1 + pulse * 0.12), r * squash, 0, Math.PI, Math.PI * 2);
  g.ellipse(0, 0, r * (1 + pulse * 0.12), r * squash * 0.45, 0, 0, Math.PI);
  g.fill();
  g.restore();
}

function drawRay(g: CanvasRenderingContext2D, cr: Creature, seed: number): void {
  const flap = Math.sin(cr.phase * 0.7);
  g.save();
  g.translate(cr.x, cr.y);
  // Seen from above while everything else is seen from the side, the way picture
  // books draw a ray. Keep it near level: a manta stood on its wingtip reads as a kite.
  const facing = Math.cos(cr.heading) >= 0 ? 1 : -1;
  g.scale(facing, 1);
  g.rotate(Math.max(-0.35, Math.min(0.35, Math.atan2(cr.vy, Math.abs(cr.vx) || 1))) * facing);
  const len = cr.length;
  const span = len * (0.62 + flap * 0.1);
  const wing = g.createLinearGradient(0, -span, 0, span);
  wing.addColorStop(0, cr.species.fin);
  wing.addColorStop(0.5, cr.species.back);
  wing.addColorStop(1, cr.species.fin);
  g.fillStyle = wing;
  g.beginPath();
  g.moveTo(len * 0.46, 0);
  g.bezierCurveTo(len * 0.3, -span * 0.5, len * 0.02, -span * 0.98, -len * 0.16, -span);
  g.bezierCurveTo(-len * 0.34, -span * 0.9, -len * 0.4, -span * 0.3, -len * 0.44, 0);
  g.bezierCurveTo(-len * 0.4, span * 0.3, -len * 0.34, span * 0.9, -len * 0.16, span);
  g.bezierCurveTo(len * 0.02, span * 0.98, len * 0.3, span * 0.5, len * 0.46, 0);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(3,32,54,0.25)';
  g.lineWidth = Math.max(1, len * 0.02);
  g.stroke();
  g.fillStyle = cr.species.patternColor;
  g.globalAlpha = 0.55;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc((hash(seed, i) - 0.6) * len * 0.5, (hash(seed, i + 5) - 0.5) * span * 0.9, len * 0.045, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = cr.species.back;
  g.lineWidth = Math.max(1.5, len * 0.035);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-len * 0.4, 0);
  g.quadraticCurveTo(-len * 0.7, flap * len * 0.12, -len * 0.95, flap * len * 0.2);
  g.stroke();
  g.fillStyle = '#0f172a';
  for (let side = -1; side <= 1; side += 2) {
    g.beginPath();
    g.arc(len * 0.24, side * len * 0.1, Math.max(1.6, len * 0.03), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** The crab is the one here that walks: three legs a side, each a two-bone leg. */
function drawCrab(g: CanvasRenderingContext2D, cr: Creature, scene: Scene): void {
  const len = cr.length;
  const facing = cr.vx >= 0 ? 1 : -1;
  const bodyY = cr.y - len * 0.12;
  // Off the sand — held in the fingers, or falling back down after being let
  // go — there is nothing to stand on, so the legs hang from the body instead
  // of stretching down to a floor that is still a long way below.
  const standing = cr.y > scene.tank.floor - len * 0.4;
  const ground = standing ? scene.tank.floor : cr.y + len * 0.34;
  // Long enough bones that the knee has somewhere to lift to: a crab's legs are
  // read from the peak above the body, not from the foot.
  const upper = len * 0.42;
  const lower = len * 0.42;
  g.strokeStyle = '#7f1d1d';
  g.lineWidth = Math.max(2.5, len * 0.07);
  g.lineCap = 'round';
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const hipX = cr.x + (i - 1) * len * 0.22;
      const hipY = bodyY + len * 0.16;
      const step = cr.phase + i * 2.1 + (side > 0 ? Math.PI : 0);
      const footX = hipX + side * len * 0.42 + Math.cos(step) * len * 0.18 * facing;
      const footY = ground + len * 0.14 - Math.max(0, Math.sin(step)) * len * 0.16;
      // -side, so the knee lifts above the hip-to-foot line the way a crab's does,
      // instead of buckling under it.
      const knee = solveTwoBone(hipX, hipY, footX, footY, upper, lower, -side);
      g.beginPath();
      g.moveTo(hipX, hipY);
      g.lineTo(knee.x, knee.y);
      g.lineTo(footX, footY);
      g.stroke();
    }
  }
  // Claws.
  for (let side = -1; side <= 1; side += 2) {
    const cx = cr.x + facing * len * 0.42;
    const cy = bodyY + side * len * 0.16;
    g.beginPath();
    g.moveTo(cr.x + facing * len * 0.2, bodyY + side * len * 0.1);
    g.lineTo(cx, cy);
    g.stroke();
    g.fillStyle = cr.species.back;
    g.beginPath();
    g.ellipse(cx, cy, len * 0.16, len * 0.11, facing * side * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  const shell = g.createLinearGradient(cr.x, bodyY - len * 0.3, cr.x, bodyY + len * 0.25);
  shell.addColorStop(0, cr.species.belly);
  shell.addColorStop(1, cr.species.back);
  g.fillStyle = shell;
  g.beginPath();
  g.ellipse(cr.x, bodyY, len * 0.42, len * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  for (let side = -1; side <= 1; side += 2) {
    const ex = cr.x + facing * len * 0.16 + side * len * 0.06;
    const ey = bodyY - len * 0.3;
    g.strokeStyle = cr.species.fin;
    g.lineWidth = Math.max(1.5, len * 0.04);
    g.beginPath();
    g.moveTo(ex - facing * len * 0.02, bodyY - len * 0.16);
    g.lineTo(ex, ey);
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(ex, ey, len * 0.07, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0f172a';
    g.beginPath();
    g.arc(ex + facing * len * 0.02, ey, len * 0.038, 0, Math.PI * 2);
    g.fill();
  }
}

export function drawCreature(g: CanvasRenderingContext2D, cr: Creature, index: number, scene: Scene): void {
  g.save();
  if (cr.joy > 0) {
    // A little bob of delight, around the animal's own middle.
    g.translate(cr.x, cr.y);
    g.rotate(Math.sin(cr.joy * 34) * 0.12 * cr.joy);
    g.translate(-cr.x, -cr.y);
  }
  // Tucked into the weeds: still there, but keeping out of it.
  if (cr.hiding) g.globalAlpha = 0.45;
  // In the child's hand it is out of the water, so it gets a shadow and a wriggle.
  if (cr.held) {
    g.translate(cr.x, cr.y);
    g.rotate(Math.sin(scene.clock * 22) * 0.16);
    g.translate(-cr.x, -cr.y);
    g.shadowColor = 'rgba(3,32,54,0.45)';
    g.shadowBlur = cr.length * 0.35;
  }
  if (cr.species.kind === 'jelly') drawJelly(g, cr);
  else if (cr.species.kind === 'ray') drawRay(g, cr, index);
  else if (cr.species.kind === 'crab') drawCrab(g, cr, scene);
  else drawFish(g, cr, index);
  g.restore();
  if (scene.moods !== false) drawMood(g, cr, scene);
}

/** The mood font, which is one string for as long as the tank is one size. */
let moodSize = 0;
let moodFont = '';

/**
 * What the fish is feeling, above its head, for a child who cannot read. Only
 * hunger and delight are shown: fright already reads perfectly well from a fish
 * bolting into the weeds.
 */
function drawMood(g: CanvasRenderingContext2D, cr: Creature, scene: Scene): void {
  const mood = cr.mood;
  if (cr.held || (mood !== 'hungry' && mood !== 'excited')) return;
  const size = Math.max(scene.tank.unit * 0.34, 15);
  if (size !== moodSize) {
    moodSize = size;
    moodFont = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  }
  const bob = Math.sin(scene.clock * 3 + cr.x * 0.01) * size * 0.12;
  g.save();
  g.globalAlpha = mood === 'hungry' ? 0.55 + 0.35 * Math.sin(scene.clock * 2.2) : 0.9;
  g.font = moodFont;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(mood === 'hungry' ? '🍤' : '✨', cr.x, cr.y - cr.length * 0.55 + bob);
  g.restore();
}

// ---- the water everything happens in ----

/**
 * Water, sand, weed and bubbles, drawn once here for every game that has any.
 * Câu cá had its own paler copies and the two read as different places, which
 * they are not: the lake is where the fish in the tank came from.
 */
export function drawWater(g: CanvasRenderingContext2D, tank: Tank): void {
  // Bright most of the way down, dark only at the very bottom.
  const sky = g.createLinearGradient(0, 0, 0, tank.h);
  sky.addColorStop(0, '#7dd3fc');
  sky.addColorStop(0.35, '#38bdf8');
  sky.addColorStop(0.72, '#0ea5e9');
  sky.addColorStop(1, '#0369a1');
  g.fillStyle = sky;
  g.fillRect(0, 0, tank.w, tank.h);
}

/** The line the sand is drawn along, given the heights it was generated with. */
export function sandPath(g: CanvasRenderingContext2D, tank: Tank, sand: readonly number[]): void {
  g.beginPath();
  g.moveTo(0, tank.h);
  g.lineTo(0, sand[0] ?? tank.floor);
  const pts = sand.map((y, i) => ({ x: (i / Math.max(1, sand.length - 1)) * tank.w, y }));
  // Continue the path: the bottom-left corner is already in it.
  smoothPath(g, pts, false);
  g.lineTo(tank.w, tank.h);
  g.closePath();
}

export function drawSand(g: CanvasRenderingContext2D, tank: Tank, sand: readonly number[], rocks: readonly Rock[] = []): void {
  const grad = g.createLinearGradient(0, tank.floor - tank.unit * 0.2, 0, tank.h);
  grad.addColorStop(0, '#fef3c7');
  grad.addColorStop(0.45, '#fcd34d');
  grad.addColorStop(1, '#b45309');
  g.fillStyle = grad;
  sandPath(g, tank, sand);
  g.fill();
  // A scatter of grains, fixed in place.
  g.fillStyle = 'rgba(120,53,15,0.18)';
  for (let i = 0; i < 60; i++) {
    const x = hash(i, 1) * tank.w;
    const y = tank.floor + tank.unit * 0.12 + hash(i, 2) * (tank.h - tank.floor);
    g.fillRect(x, y, 2, 2);
  }
  for (const rock of rocks) {
    const y = tank.floor + tank.unit * 0.1;
    const shade = 90 + rock.tint * 60;
    g.fillStyle = `rgb(${shade},${shade + 8},${shade + 18})`;
    g.beginPath();
    g.ellipse(rock.x, y, rock.r, rock.r * rock.squash, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.ellipse(rock.x - rock.r * 0.3, y - rock.r * rock.squash * 0.45, rock.r * 0.35, rock.r * rock.squash * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * A weed. `stirred` is 0…1 of having just been brushed, which makes it wave a
 * little wider and a little faster before it settles.
 */
export function drawPlant(g: CanvasRenderingContext2D, plant: Plant, scene: Scene, stirred = 0): void {
  const { tank, clock } = scene;
  const amp = tank.unit * 0.28 * (1 + stirred * 0.3);
  const rate = plant.sway * 2 * (1 + stirred * 0.4);
  for (let b = 0; b < plant.blades; b++) {
    const lean = (b - (plant.blades - 1) / 2) * 0.22;
    const base = plant.x + lean * plant.w * 3;
    const tall = plant.h * (0.7 + hash(plant.x, b) * 0.5);
    const wave = (along: number): number => Math.sin(clock * rate + plant.phase + b + along * 2.4) * amp * along * along;
    g.beginPath();
    g.moveTo(base - plant.w, tank.floor + tank.unit * 0.1);
    for (let s = 0; s <= 6; s++) {
      const along = s / 6;
      g.lineTo(base + wave(along) - plant.w * (1 - along), tank.floor + tank.unit * 0.1 - tall * along);
    }
    for (let s = 6; s >= 0; s--) {
      const along = s / 6;
      g.lineTo(base + wave(along) + plant.w * (1 - along), tank.floor + tank.unit * 0.1 - tall * along);
    }
    g.closePath();
    g.fillStyle = `hsl(${plant.hue} 65% ${28 + b * 6}%)`;
    g.fill();
  }
}

/** Bubbles: a glassy shell with a rim and a highlight, not a white dot. */
export function drawBubbles(g: CanvasRenderingContext2D, bubbles: readonly Bubble[]): void {
  for (const b of bubbles) {
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(224,247,255,0.22)';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1.2;
    g.stroke();
    g.beginPath();
    g.arc(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.28, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fill();
  }
}
