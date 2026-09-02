import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  Creature,
  FOOD_PER_FEED,
  STAR_EVERY_TAP,
  makeBubble,
  makeFood,
  makePlants,
  makeRocks,
  makeTank,
  solveTwoBone,
  stocking,
  type Bubble,
  type Food,
  type Nudge,
  type Plant,
  type Point,
  type Rock,
  type Tank,
} from './logic';
import './style.css';

/** Caustics are baked into a tile this many pixels square and blown up over the tank. */
const CAUSTIC_N = 64;
/** Frames between two bakes: the light moves, but not on every single frame. */
const CAUSTIC_EVERY = 3;
/** Longest frame the simulation will take in one step. */
const MAX_STEP = 0.05;
const MAX_BUBBLES = 90;

/** A closed path through `pts`, rounded off by putting the corners on the curve midpoints. */
function smoothPath(c: CanvasRenderingContext2D, pts: readonly Point[]): void {
  const n = pts.length;
  if (n < 3) return;
  const first = pts[0]!;
  const last = pts[n - 1]!;
  c.beginPath();
  c.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const next = pts[(i + 1) % n]!;
    c.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  }
  c.closePath();
}

/** Deterministic 0…1 from two integers, so a fish's spots stay put. */
function hash(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Bể cá: a tank that runs whether or not anybody is playing with it.
 *
 * Every animal is a spine — a head that leads and a chain of vertebrae that may
 * not bend past a limit — so a turn bends the whole body through it instead of
 * rotating a sprite. The crab's legs are two-bone IK over that same body.
 *
 * The child can tap a fish to be told what it is, run a finger through the water
 * (curious fish come, shy ones bolt, bubbles trail behind) and press 🍤 to drop
 * food, which is the one thing here with a beginning and an end: every flake
 * eaten is confetti and a star.
 */
function start(ctx: GameContext): void {
  const canvas = h('canvas', { class: 'aquarium-canvas' });
  const feed = h('button', { class: 'aquarium-feed', type: 'button', 'aria-label': 'cho cá ăn' }, '🍤');
  const root = h('div', { class: 'aquarium' }, canvas, feed);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  let alive = true;
  let dpr = 1;
  let tank: Tank = makeTank(1, 1);
  let creatures: Creature[] = [];
  let plants: Plant[] = [];
  let rocks: Rock[] = [];
  let sand: number[] = [];
  const bubbles: Bubble[] = [];
  let foods: Food[] = [];
  let nudge: Nudge | null = null;
  let taps = 0;
  let clock = 0;
  let frame = 0;
  let feeding = false;

  // ---- the tank itself ----

  function build(): void {
    const w = root.clientWidth;
    const hgt = root.clientHeight;
    if (!w || !hgt) return;
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width === Math.round(w * nextDpr) && canvas.height === Math.round(hgt * nextDpr)) return;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    tank = makeTank(w, hgt);
    plants = makePlants(tank);
    rocks = makeRocks(tank);
    // The sand line, as a handful of heights the floor is drawn through.
    sand = Array.from({ length: 9 }, (_, i) => tank.floor + Math.sin(i * 1.7) * tank.unit * 0.09);
    creatures = stocking(tank).map((species) => new Creature(species, tank));
    bubbles.length = 0;
    foods = [];
    feeding = false;
  }

  // ---- caustics ----

  const causticTile = document.createElement('canvas');
  causticTile.width = CAUSTIC_N;
  causticTile.height = CAUSTIC_N;
  const tileCtx = causticTile.getContext('2d');
  const tileData = tileCtx?.createImageData(CAUSTIC_N, CAUSTIC_N) ?? null;

  /**
   * Two crossed sine fields that warp each other, ridged so the bright part is
   * where they cancel: that gives the thin joined-up veins real caustics have,
   * rather than blobs. Every frequency is a whole number of cycles across the
   * tile, so the tile repeats without a seam.
   */
  function bakeCaustics(t: number): void {
    if (!tileCtx || !tileData) return;
    const d = tileData.data;
    for (let y = 0; y < CAUSTIC_N; y++) {
      const v = (y / CAUSTIC_N) * Math.PI * 2;
      for (let x = 0; x < CAUSTIC_N; x++) {
        const u = (x / CAUSTIC_N) * Math.PI * 2;
        const a = Math.sin(u * 2 + Math.sin(v + t) * 1.5 + t);
        const b = Math.sin(v * 2 + Math.sin(u - t * 0.7) * 1.5 - t * 0.6);
        const ridge = 1 - Math.abs(a * 0.5 + b * 0.5);
        const i = (y * CAUSTIC_N + x) * 4;
        d[i] = 214;
        d[i + 1] = 246;
        d[i + 2] = 255;
        d[i + 3] = Math.min(255, ridge ** 9 * 340);
      }
    }
    tileCtx.putImageData(tileData, 0, 0);
  }

  // ---- scenery ----

  function drawWater(g: CanvasRenderingContext2D): void {
    const sky = g.createLinearGradient(0, 0, 0, tank.h);
    sky.addColorStop(0, '#7dd3fc');
    sky.addColorStop(0.35, '#38bdf8');
    sky.addColorStop(0.75, '#0e7490');
    sky.addColorStop(1, '#155e75');
    g.fillStyle = sky;
    g.fillRect(0, 0, tank.w, tank.h);
  }

  function drawRays(g: CanvasRenderingContext2D): void {
    g.save();
    g.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const x = tank.w * (0.12 + i * 0.26) + Math.sin(clock * 0.18 + i) * tank.w * 0.03;
      const width = tank.unit * (0.5 + i * 0.12);
      const lean = Math.sin(clock * 0.13 + i * 1.7) * tank.unit * 0.8;
      const fade = g.createLinearGradient(0, 0, 0, tank.floor);
      fade.addColorStop(0, 'rgba(224,247,255,0.30)');
      fade.addColorStop(0.55, 'rgba(224,247,255,0.10)');
      fade.addColorStop(1, 'rgba(224,247,255,0)');
      g.fillStyle = fade;
      g.beginPath();
      g.moveTo(x - width, 0);
      g.lineTo(x + width, 0);
      g.lineTo(x + width * 3.2 + lean, tank.floor);
      g.lineTo(x - width * 2.4 + lean, tank.floor);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  function sandPath(g: CanvasRenderingContext2D): void {
    g.beginPath();
    g.moveTo(0, tank.h);
    g.lineTo(0, sand[0] ?? tank.floor);
    for (let i = 0; i < sand.length - 1; i++) {
      const x = (tank.w * i) / (sand.length - 1);
      const nx = (tank.w * (i + 1)) / (sand.length - 1);
      g.quadraticCurveTo(x, sand[i]!, (x + nx) / 2, ((sand[i] ?? 0) + (sand[i + 1] ?? 0)) / 2);
    }
    g.lineTo(tank.w, sand[sand.length - 1] ?? tank.floor);
    g.lineTo(tank.w, tank.h);
    g.closePath();
  }

  function drawSand(g: CanvasRenderingContext2D): void {
    const grad = g.createLinearGradient(0, tank.floor - tank.unit * 0.2, 0, tank.h);
    grad.addColorStop(0, '#fef3c7');
    grad.addColorStop(0.45, '#fcd34d');
    grad.addColorStop(1, '#b45309');
    g.fillStyle = grad;
    sandPath(g);
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

  function drawPlant(g: CanvasRenderingContext2D, plant: Plant): void {
    for (let b = 0; b < plant.blades; b++) {
      const lean = (b - (plant.blades - 1) / 2) * 0.22;
      const base = plant.x + lean * plant.w * 3;
      const tall = plant.h * (0.7 + hash(plant.x, b) * 0.5);
      g.beginPath();
      g.moveTo(base - plant.w, tank.floor + tank.unit * 0.1);
      for (let s = 0; s <= 6; s++) {
        const along = s / 6;
        const wave = Math.sin(clock * plant.sway * 2 + plant.phase + b + along * 2.4) * tank.unit * 0.28 * along * along;
        g.lineTo(base + wave - plant.w * (1 - along), tank.floor + tank.unit * 0.1 - tall * along);
      }
      for (let s = 6; s >= 0; s--) {
        const along = s / 6;
        const wave = Math.sin(clock * plant.sway * 2 + plant.phase + b + along * 2.4) * tank.unit * 0.28 * along * along;
        g.lineTo(base + wave + plant.w * (1 - along), tank.floor + tank.unit * 0.1 - tall * along);
      }
      g.closePath();
      g.fillStyle = `hsl(${plant.hue} 65% ${28 + b * 6}%)`;
      g.fill();
    }
  }

  // ---- animals ----

  /** The two flanks at a vertebra, upper one first in screen space. */
  function flanks(cr: Creature, index: number): [Point, Point] {
    const a = cr.spine.edge(index, Math.PI / 2);
    const b = cr.spine.edge(index, -Math.PI / 2);
    return a.y <= b.y ? [a, b] : [b, a];
  }

  function bodyGradient(g: CanvasRenderingContext2D, cr: Creature): CanvasGradient {
    const [top, bottom] = flanks(cr, 2);
    const grad = g.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
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

  function drawPattern(g: CanvasRenderingContext2D, cr: Creature, seed: number): void {
    const { species } = cr;
    if (species.pattern === 'none') return;
    g.save();
    smoothPath(g, cr.spine.outline());
    g.clip();
    g.fillStyle = species.patternColor;
    if (species.pattern === 'stripes') {
      g.globalAlpha = 0.95;
      for (const i of [1, 2, 3]) {
        const [top, bottom] = flanks(cr, i);
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
    const up = flanks(cr, 2)[0];
    drawFin(g, up, cr.spine.angles[2]! + Math.PI * 1.35, cr.length * 0.24, cr.length * 0.11, cr.species.fin);
    const side = cr.spine.joints[1]!;
    const flap = Math.sin(cr.phase * 1.6) * 0.5;
    g.globalAlpha = 0.75;
    drawFin(g, side, cr.spine.angles[1]! + Math.PI * 0.75 + flap * 0.3, cr.length * 0.16, cr.length * 0.07, cr.species.fin);
    g.globalAlpha = 1;

    // Body.
    smoothPath(g, cr.spine.outline());
    g.fillStyle = bodyGradient(g, cr);
    g.fill();
    // A dark edge: without it, two fish that overlap read as one odd shape.
    g.strokeStyle = 'rgba(3,32,54,0.28)';
    g.lineWidth = Math.max(1, cr.length * 0.022);
    g.stroke();
    drawPattern(g, cr, seed);

    // A rim of light along the back. Not clipped: at this width the spill reads as
    // a highlight, and two dozen clips a frame is a real cost on a cheap tablet.
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = Math.max(1.5, cr.length * 0.025);
    g.beginPath();
    for (let i = 0; i <= 4; i++) {
      const e = flanks(cr, i)[0];
      if (i === 0) g.moveTo(e.x, e.y);
      else g.lineTo(e.x, e.y);
    }
    g.stroke();

    drawEye(g, cr);
  }

  function drawEye(g: CanvasRenderingContext2D, cr: Creature): void {
    const head = cr.spine.joints[0]!;
    const [top] = flanks(cr, 0);
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
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(len * 0.24, side * len * 0.1, Math.max(1.6, len * 0.03), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  /** The crab is the one here that walks: three legs a side, each a two-bone leg. */
  function drawCrab(g: CanvasRenderingContext2D, cr: Creature): void {
    const len = cr.length;
    const facing = cr.vx >= 0 ? 1 : -1;
    const bodyY = cr.y - len * 0.1;
    const upper = len * 0.3;
    const lower = len * 0.34;
    g.strokeStyle = cr.species.fin;
    g.lineWidth = Math.max(2.5, len * 0.075);
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const hipX = cr.x + (i - 1) * len * 0.22;
        const hipY = bodyY + len * 0.1;
        const step = cr.phase + i * 2.1 + (side > 0 ? Math.PI : 0);
        const footX = hipX + side * len * 0.42 + Math.cos(step) * len * 0.18 * facing;
        const footY = tank.floor + len * 0.24 - Math.max(0, Math.sin(step)) * len * 0.16;
        const knee = solveTwoBone(hipX, hipY, footX, footY, upper, lower, side);
        g.beginPath();
        g.moveTo(hipX, hipY);
        g.lineTo(knee.x, knee.y);
        g.lineTo(footX, footY);
        g.stroke();
      }
    }
    // Claws.
    for (const side of [-1, 1]) {
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
    for (const side of [-1, 1]) {
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

  function drawCreature(g: CanvasRenderingContext2D, cr: Creature, index: number): void {
    g.save();
    if (cr.happy > 0) {
      // A little bob of delight, around the animal's own middle.
      g.translate(cr.x, cr.y);
      g.rotate(Math.sin(cr.happy * 34) * 0.12 * cr.happy);
      g.translate(-cr.x, -cr.y);
    }
    if (cr.species.kind === 'jelly') drawJelly(g, cr);
    else if (cr.species.kind === 'ray') drawRay(g, cr, index);
    else if (cr.species.kind === 'crab') drawCrab(g, cr);
    else drawFish(g, cr, index);
    g.restore();
  }

  // ---- loose things in the water ----

  function drawFood(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#fb923c';
    for (const food of foods) {
      if (food.eaten) continue;
      g.save();
      g.translate(food.x, food.y);
      g.rotate(food.wobble);
      g.fillRect(-tank.unit * 0.035, -tank.unit * 0.025, tank.unit * 0.07, tank.unit * 0.05);
      g.restore();
    }
  }

  function drawBubbles(g: CanvasRenderingContext2D): void {
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

  /** Lay the baked square over the tank at a size where the veins read as light on water. */
  function tileCaustics(g: CanvasRenderingContext2D, size: number, dx: number, dy: number, top: number, bottom: number): void {
    for (let y = top - size + (dy % size); y < bottom; y += size) {
      for (let x = -size + (dx % size); x < tank.w; x += size) {
        g.drawImage(causticTile, x, y, size, size);
      }
    }
  }

  function drawCaustics(g: CanvasRenderingContext2D): void {
    if (!tileCtx) return;
    const drift = clock * 16;
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.12;
    tileCaustics(g, tank.unit * 3.4, drift, Math.sin(clock * 0.3) * tank.unit, 0, tank.h);
    // Stronger where the light lands on the sand.
    g.globalAlpha = 0.5;
    g.beginPath();
    g.rect(0, tank.floor - tank.unit * 0.15, tank.w, tank.h - tank.floor + tank.unit * 0.15);
    g.clip();
    tileCaustics(g, tank.unit * 2.2, -drift * 0.6, 0, tank.floor - tank.unit, tank.h);
    g.restore();
  }

  function drawSurface(g: CanvasRenderingContext2D): void {
    g.save();
    g.globalCompositeOperation = 'screen';
    g.fillStyle = 'rgba(224,247,255,0.35)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(tank.w, 0);
    g.lineTo(tank.w, tank.unit * 0.16);
    for (let x = tank.w; x >= 0; x -= tank.w / 16) {
      g.lineTo(x, tank.unit * (0.16 + Math.sin(x * 0.02 + clock * 1.6) * 0.06));
    }
    g.closePath();
    g.fill();
    g.restore();
    // A soft vignette so the glass has edges.
    const edge = g.createRadialGradient(tank.w / 2, tank.h / 2, Math.min(tank.w, tank.h) * 0.3, tank.w / 2, tank.h / 2, Math.max(tank.w, tank.h) * 0.75);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(3,32,54,0.45)');
    g.fillStyle = edge;
    g.fillRect(0, 0, tank.w, tank.h);
  }

  // ---- the loop ----

  function step(dt: number): void {
    clock += dt;
    for (const cr of creatures) {
      if (cr.update(dt, tank, foods, nudge)) {
        ctx.audio.pop(1.4);
        for (let i = 0; i < 2; i++) bubbles.push(makeBubble(cr.x, cr.y, tank));
      }
    }
    for (const food of foods) {
      if (food.eaten) continue;
      food.y += food.fall * dt;
      food.wobble += dt * 2;
      food.x += Math.sin(food.wobble) * tank.unit * 0.12 * dt;
      if (food.y > tank.floor) food.eaten = true;
    }
    if (feeding && foods.every((f) => f.eaten)) {
      feeding = false;
      void ctx.celebrate().then(() => {
        if (alive) ctx.addStar();
      });
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]!;
      b.y -= b.rise * dt;
      b.wobble += dt * 3;
      b.x += Math.sin(b.wobble) * tank.unit * 0.5 * dt;
      if (b.y + b.r < 0) bubbles.splice(i, 1);
    }
    // A slow stream from one corner, so the tank is never quite still.
    if (Math.random() < dt * 2.5 && bubbles.length < MAX_BUBBLES) {
      bubbles.push(makeBubble(tank.w * 0.9 + Math.random() * tank.unit * 0.3, tank.floor, tank));
    }
  }

  function draw(g: CanvasRenderingContext2D): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWater(g);
    drawRays(g);
    drawSand(g);
    for (let i = 0; i < plants.length; i += 2) drawPlant(g, plants[i]!);
    drawFood(g);
    creatures.forEach((cr, i) => drawCreature(g, cr, i));
    for (let i = 1; i < plants.length; i += 2) drawPlant(g, plants[i]!);
    drawBubbles(g);
    drawCaustics(g);
    drawSurface(g);
  }

  let raf = 0;
  let last = 0;
  function loop(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(MAX_STEP, (now - last) / 1000) : 0.016;
    last = now;
    build();
    if (!c || !tank.w) return;
    if (frame % CAUSTIC_EVERY === 0) bakeCaustics(clock * 0.6);
    frame++;
    step(dt);
    draw(c);
  }

  // ---- the child ----

  function at(e: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? tank.w / rect.width : 1;
    const sy = rect.height ? tank.h / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function greet(cr: Creature, p: Point): void {
    cr.startle(p.x, p.y);
    ctx.audio.pop(1.2);
    navigator.vibrate?.(10);
    ctx.speak(cr.species.name);
    for (let i = 0; i < 4; i++) bubbles.push(makeBubble(cr.x, cr.y, tank));
    taps++;
    if (taps % STAR_EVERY_TAP === 0) {
      ctx.addStar();
      ctx.audio.jingle();
      const star = h('div', { class: 'aquarium-star', style: `left:${(cr.x / tank.w) * 100}%;top:${(cr.y / tank.h) * 100}%` }, '⭐');
      root.append(star);
      setTimeout(() => star.remove(), 900);
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = at(e);
    nudge = { x: p.x, y: p.y, held: true };
    const hit = creatures.find((cr) => cr.hits(p.x, p.y));
    if (hit) {
      greet(hit, p);
      return;
    }
    ctx.audio.tick();
    for (let i = 0; i < 3; i++) bubbles.push(makeBubble(p.x, p.y, tank));
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!nudge?.held) return;
    const p = at(e);
    nudge.x = p.x;
    nudge.y = p.y;
    if (Math.random() < 0.25 && bubbles.length < MAX_BUBBLES) bubbles.push(makeBubble(p.x, p.y, tank));
  });

  const release = (): void => {
    if (nudge) nudge.held = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  feed.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (feeding) return;
    feeding = true;
    foods = makeFood(tank, FOOD_PER_FEED);
    ctx.audio.tick();
    replay(feed, 'anim-bounce');
    ctx.speak('Cho cá ăn nào!');
  });

  ctx.hint.arm(() => {
    replay(feed, 'anim-wiggle');
    const cr = creatures[Math.floor(Math.random() * creatures.length)];
    if (cr) cr.happy = 0.8;
  });

  const onResize = (): void => {
    // Force a rebuild on the next frame.
    canvas.width = 0;
  };
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    window.removeEventListener('resize', onResize);
    if (raf) cancelAnimationFrame(raf);
  });

  build();
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
}

const game: GameModule = { ...meta, start };
export default game;
