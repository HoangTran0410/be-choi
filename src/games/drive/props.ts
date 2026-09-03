import type { FxKind } from '../../core/audio';
import { mulberry32 } from '../../core/dom';
import { RED_MS, forkAt, roadY, type LegPlan, type Prop } from './logic';
import { HOSE_SECONDS, onFire, type Job, type Load } from './jobs';
import { barrierDown, railPhase, trainAcross } from './traffic';
import { box, dim, glyph, paletteFor, type Scene } from './scenery';

/**
 * Everything standing beside the road. What a pick-up point holds and what a
 * house wants depends on the job in hand, so swapping the lorry for the fire
 * engine redresses the whole street without moving a thing.
 */
export interface Dressing {
  scene: Scene;
  job: Job;
  /** What is in the back right now, so a house can show who is coming. */
  loads: readonly Load[];
  /** Pick-up points already emptied. */
  served: ReadonlySet<number>;
  /** Fires already put out. */
  doused: ReadonlySet<number>;
  /** How far along the hose is on the fire being fought, 0 … 1. */
  hosing: { slot: number; t: number } | null;
  /** Slot → the moment it was last poked. */
  pokes: ReadonlyMap<number, number>;
  lights: ReadonlyMap<number, { redAt: number; green: boolean }>;
  /** Slot → seconds into the level-crossing cycle. */
  crossings: ReadonlyMap<number, number>;
  /** Forks already decided, and which of the two ways was taken. */
  chosen: ReadonlyMap<number, boolean>;
  /** When somebody was last dropped off, for the wave from the doorway. */
  waved: number;
  carX: number;
}

/** How long a poked thing wobbles for. */
export const POKE_MS = 700;

/** −1 … 1, the wobble of something the child has just prodded. */
export function wobble(d: Dressing, slot: number): number {
  const at = d.pokes.get(slot);
  if (at === undefined) return 0;
  const age = (d.scene.clock - at) / (POKE_MS / 1000);
  if (age < 0 || age > 1) return 0;
  return Math.sin(age * Math.PI * 6) * (1 - age);
}

/** What comes off a thing when it is prodded: what flies, what is heard, what is said. */
export interface PokeReply {
  emoji: string;
  count: number;
  fx?: FxKind;
  say?: string;
}

const FRUIT = ['🍎', '🍐', '🍊', '🍃', '🌰'];

export function pokeReply(prop: Prop, job: Job, rng: () => number = Math.random): PokeReply | null {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)] ?? list[0]!;
  switch (prop.kind) {
    case 'tree':
      if (prop.biome === 'snow') return { emoji: '❄️', count: 5 };
      if (prop.biome === 'seaside') return { emoji: '🥥', count: 2 };
      return { emoji: pick(FRUIT), count: 3 };
    case 'bush':
      return { emoji: pick(['🦋', '🐝', '🐞']), count: 2, fx: 'chirp' };
    case 'house':
      return { emoji: '💡', count: 1, say: 'Có người ở nhà!' };
    case 'light':
      return { emoji: '✨', count: 2, fx: 'zap' };
    case 'puddle':
      return { emoji: '💧', count: 4 };
    case 'pump':
      return { emoji: '⛽', count: 1, say: 'Trạm xăng đây!' };
    case 'wash':
      return { emoji: '🫧', count: 4 };
    case 'crossing':
      return { emoji: '🚂', count: 1, fx: 'whistle' };
    case 'stop': {
      if (job.kind === 'ride') return { emoji: '❤️', count: 2 };
      return { emoji: job.kind === 'parcel' ? '📦' : '🌾', count: 2 };
    }
    default:
      return null;
  }
}

// ---- scenery ----

function drawTree(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number): void {
  const { road, clock, dusk } = d.scene;
  const p = paletteFor(road, prop.x);
  const u = road.unit * (1.25 + prop.seed * 0.6);
  const sway = (Math.sin(clock * 1.1 + prop.seed * 6) * 0.03 + wobble(d, prop.slot) * 0.16) * u;
  g.fillStyle = dim(p.trunk, dusk);
  g.fillRect(x - u * 0.07, y - u * 0.9, u * 0.14, u * 0.9);
  if (prop.biome === 'seaside') {
    // A palm: a bare stem with fronds sagging off the top.
    g.strokeStyle = dim(p.leaf[prop.seed > 0.5 ? 0 : 1], dusk);
    g.lineWidth = u * 0.09;
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i / 5) * Math.PI;
      g.beginPath();
      g.moveTo(x + sway, y - u * 0.92);
      g.quadraticCurveTo(
        x + sway + Math.cos(a) * u * 0.3,
        y - u * 1.15,
        x + sway + Math.cos(a) * u * 0.52,
        y - u * 0.86 + Math.abs(Math.cos(a)) * u * 0.12,
      );
      g.stroke();
    }
    g.lineCap = 'butt';
    g.fillStyle = '#a16207';
    g.beginPath();
    g.arc(x + sway, y - u * 0.86, u * 0.06, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (prop.biome === 'forest' || prop.biome === 'snow') {
    // A fir: three stacked triangles, with snow on them up in the cold.
    for (let i = 0; i < 3; i++) {
      const top = y - u * (1.5 - i * 0.32);
      const wide = u * (0.22 + i * 0.11);
      g.fillStyle = dim(p.leaf[i % 2 === 0 ? 0 : 1], dusk);
      g.beginPath();
      g.moveTo(x + sway, top);
      g.lineTo(x + sway - wide, top + u * 0.45);
      g.lineTo(x + sway + wide, top + u * 0.45);
      g.closePath();
      g.fill();
      if (prop.biome === 'snow') {
        g.fillStyle = dim('#f8fafc', dusk);
        g.beginPath();
        g.moveTo(x + sway, top + u * 0.02);
        g.lineTo(x + sway - wide * 0.55, top + u * 0.26);
        g.lineTo(x + sway + wide * 0.55, top + u * 0.26);
        g.closePath();
        g.fill();
      }
    }
    return;
  }
  // One blob at a time: three arcs in a single path leave a seam where they meet.
  g.fillStyle = dim(prop.seed > 0.5 ? p.leaf[0] : p.leaf[1], dusk);
  for (const [bx, by, br] of [
    [-0.28, -0.82, 0.28],
    [0.28, -0.85, 0.3],
    [0, -1.05, 0.4],
  ]) {
    g.beginPath();
    g.arc(x + sway + u * bx!, y + u * by!, u * br!, 0, Math.PI * 2);
    g.fill();
  }
}

function drawBush(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number): void {
  const { road, dusk } = d.scene;
  const p = paletteFor(road, prop.x);
  const u = road.unit * (0.4 + prop.seed * 0.2);
  const shake = wobble(d, prop.slot) * u * 0.35;
  g.fillStyle = dim(prop.biome === 'snow' ? '#e2e8f0' : p.leaf[0], dusk);
  for (const [bx, by, br] of [
    [-0.4, -0.25, 0.34],
    [0.42, -0.28, 0.36],
    [0, -0.4, 0.45],
  ]) {
    g.beginPath();
    g.arc(x + shake + u * bx!, y + u * by!, u * br!, 0, Math.PI * 2);
    g.fill();
  }
  if (prop.seed > 0.6 && prop.biome !== 'snow') {
    g.fillStyle = dim(p.bloom[0], dusk);
    g.beginPath();
    g.arc(x + shake - u * 0.1, y - u * 0.66, u * 0.09, 0, Math.PI * 2);
    g.arc(x + shake + u * 0.3, y - u * 0.5, u * 0.08, 0, Math.PI * 2);
    g.fill();
  }
}

function drawPuddle(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number): void {
  const u = d.scene.road.unit * (0.5 + prop.seed * 0.3);
  const ring = Math.abs(wobble(d, prop.slot));
  g.fillStyle = `rgba(56,189,248,${(0.55 - d.scene.dusk * 0.2).toFixed(2)})`;
  g.beginPath();
  g.ellipse(x, y + d.scene.road.unit * 0.34, u * (0.6 + ring * 0.12), u * 0.13, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse(x - u * 0.15, y + d.scene.road.unit * 0.32, u * 0.16, u * 0.04, 0, 0, Math.PI * 2);
  g.fill();
}

// ---- the places that matter ----

/** Where the load is going: a house, or a barn when the tractor is out. */
function drawHouse(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number): void {
  const { road, clock, dusk } = d.scene;
  const u = road.unit * (1.35 + prop.seed * 0.3);
  const barn = d.job.kind === 'harvest';
  const lit = dusk > 0.4 || d.pokes.has(prop.slot);
  const wall = barn ? '#b45309' : (['#fef3c7', '#fce7f3', '#dbeafe', '#e0e7ff'][prop.slot % 4] ?? '#fef3c7');
  const roofColour = barn ? '#7f1d1d' : (['#dc2626', '#7c3aed', '#0891b2', '#ea580c'][prop.slot % 4] ?? '#dc2626');
  const lean = wobble(d, prop.slot) * u * 0.02;
  g.save();
  g.translate(x + lean, y);
  g.fillStyle = dim(wall, dusk);
  g.fillRect(-u * 0.5, -u * 0.9, u, u * 0.9);
  g.fillStyle = dim(roofColour, dusk * 0.8);
  g.beginPath();
  g.moveTo(-u * 0.62, -u * 0.88);
  g.lineTo(0, -u * 1.35);
  g.lineTo(u * 0.62, -u * 0.88);
  g.closePath();
  g.fill();
  g.fillStyle = dim('#92400e', dusk);
  g.fillRect(-u * 0.13, -u * 0.45, u * 0.26, u * 0.45);
  g.fillStyle = lit ? '#fde68a' : dim('#bae6fd', dusk);
  g.fillRect(u * 0.16, -u * 0.74, u * 0.24, u * 0.24);
  if (prop.biome === 'snow') {
    g.fillStyle = dim('#f8fafc', dusk);
    g.beginPath();
    g.moveTo(-u * 0.62, -u * 0.88);
    g.lineTo(0, -u * 1.35);
    g.lineTo(u * 0.62, -u * 0.88);
    g.lineTo(u * 0.5, -u * 0.94);
    g.lineTo(0, -u * 1.24);
    g.lineTo(-u * 0.5, -u * 0.94);
    g.closePath();
    g.fill();
  }
  g.restore();

  // Whoever is on board and coming here leans out over the door.
  const expected = d.loads.find((l) => l.home === prop.slot);
  if (expected) {
    const bob = Math.sin(clock * 4) * road.unit * 0.06;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(x, y - u * 1.6 + bob, road.unit * 0.34, 0, Math.PI * 2);
    g.fill();
    glyph(g, expected.emoji, x, y - u * 1.6 + bob, road.unit * 0.5);
  }
  // Somebody just went in: a wave from the doorway.
  if (clock - d.waved < 1.4 && Math.abs(prop.x - d.carX) < road.unit * 2.5) {
    glyph(g, '👋', x + u * 0.35, y - u * 0.5 + Math.sin(clock * 12) * road.unit * 0.05, road.unit * 0.34);
  }
  if (d.job.kind === 'fire' && onFire(prop.slot) && !d.doused.has(prop.slot)) drawFire(g, d, prop, x, y, u);
}

/** Flames out of the roof, dying back while the hose is on them. */
function drawFire(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number, u: number): void {
  const { road, clock } = d.scene;
  const fought = d.hosing?.slot === prop.slot ? Math.min(1, d.hosing.t / HOSE_SECONDS) : 0;
  const size = 1 - fought * 0.8;
  for (let i = 0; i < 3; i++) {
    const flick = Math.sin(clock * 9 + i * 2.1) * u * 0.05;
    const fx = x + (i - 1) * u * 0.26;
    const fy = y - u * 1.3 - Math.abs(Math.sin(clock * 6 + i)) * u * 0.1;
    g.fillStyle = i === 1 ? '#f97316' : '#facc15';
    g.beginPath();
    g.moveTo(fx, fy - u * 0.42 * size + flick);
    g.quadraticCurveTo(fx + u * 0.16 * size, fy - u * 0.12, fx, fy);
    g.quadraticCurveTo(fx - u * 0.16 * size, fy - u * 0.12, fx, fy - u * 0.42 * size + flick);
    g.fill();
  }
  // Smoke going up, thinner as the fire is beaten.
  g.fillStyle = `rgba(100,116,139,${(0.35 * (1 - fought)).toFixed(2)})`;
  for (let i = 0; i < 3; i++) {
    const rise = (clock * 0.6 + i * 0.33) % 1;
    g.beginPath();
    g.arc(x + Math.sin(rise * 6 + i) * u * 0.2, y - u * 1.6 - rise * u * 1.1, u * (0.1 + rise * 0.16), 0, Math.PI * 2);
    g.fill();
  }
  glyph(g, '🔥', x, y - u * 1.75, road.unit * 0.4);
}

/** The pick-up point: a bus stop, a stack of crates, or a patch of crops. */
function drawStop(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number, load: Load): void {
  const { road, clock, dusk } = d.scene;
  const u = road.unit;
  const taken = d.served.has(prop.slot) || d.loads.some((l) => l.slot === prop.slot);
  if (d.job.kind === 'fire') return;
  if (d.job.kind === 'ride') {
    g.fillStyle = dim('#94a3b8', dusk);
    g.fillRect(x - u * 0.03, y - u * 1.1, u * 0.06, u * 1.1);
    g.fillStyle = dim('#0ea5e9', dusk);
    box(g, x - u * 0.26, y - u * 1.45, u * 0.52, u * 0.4, u * 0.08);
    g.fill();
    glyph(g, '🚏', x, y - u * 1.25, u * 0.24);
  } else if (d.job.kind === 'parcel') {
    // A little depot hut to fetch the load from.
    g.fillStyle = dim('#a8a29e', dusk);
    box(g, x - u * 0.62, y - u * 1.15, u * 1.24, u * 1.15, u * 0.07);
    g.fill();
    g.fillStyle = dim('#78716c', dusk);
    g.fillRect(x - u * 0.7, y - u * 1.28, u * 1.4, u * 0.16);
    g.fillStyle = dim('#57534e', dusk);
    g.fillRect(x - u * 0.28, y - u * 0.72, u * 0.56, u * 0.72);
  } else {
    // A ploughed patch with rows in it.
    g.fillStyle = dim('#a16207', dusk);
    g.beginPath();
    g.ellipse(x, y + u * 0.14, u * 0.95, u * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = dim('#78350f', dusk);
    g.lineWidth = Math.max(1, u * 0.03);
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(x + i * u * 0.3, y + u * 0.02);
      g.lineTo(x + i * u * 0.3, y + u * 0.26);
      g.stroke();
    }
  }
  if (taken) return;
  // Whatever is waiting hops on the spot until the car pulls up.
  const near = Math.abs(prop.x - d.carX) < u * 3;
  const hop = (near ? Math.abs(Math.sin(clock * 5 + prop.slot)) * 0.14 : 0) + Math.abs(wobble(d, prop.slot)) * 0.2;
  const offset = d.job.kind === 'ride' ? u * 0.45 : 0;
  glyph(g, load.emoji, x + offset, y - u * (0.32 + hop), u * 0.62);
}

function drawLight(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number): void {
  const { road, clock, dusk } = d.scene;
  const u = road.unit;
  const state = d.lights.get(prop.slot);
  const green = !state || state.green || clock - state.redAt >= RED_MS / 1000;
  g.fillStyle = dim('#475569', dusk * 0.5);
  g.fillRect(x - u * 0.04, y - u * 1.5, u * 0.08, u * 1.5);
  g.fillStyle = dim('#334155', dusk * 0.5);
  box(g, x - u * 0.14, y - u * 2.05, u * 0.28, u * 0.62, u * 0.06);
  g.fill();
  const lamps: [string, boolean][] = [
    ['#ef4444', !green],
    ['#facc15', false],
    ['#22c55e', green],
  ];
  lamps.forEach(([colour, on], i) => {
    g.fillStyle = on ? colour : 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.arc(x, y - u * 1.9 + i * u * 0.2, u * 0.062, 0, Math.PI * 2);
    g.fill();
  });
}

/** A petrol pump on the verge. */
function drawPump(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number): void {
  const { road, dusk } = d.scene;
  const u = road.unit;
  const tip = wobble(d, prop.slot) * u * 0.05;
  g.fillStyle = dim('#f1f5f9', dusk);
  box(g, x - u * 0.9, y - u * 1.6, u * 1.8, u * 0.14, u * 0.05);
  g.fill();
  g.fillStyle = dim('#94a3b8', dusk);
  g.fillRect(x - u * 0.82, y - u * 1.5, u * 0.1, u * 1.5);
  g.fillRect(x + u * 0.72, y - u * 1.5, u * 0.1, u * 1.5);
  g.fillStyle = dim('#ef4444', dusk);
  box(g, x - u * 0.22 + tip, y - u * 1.0, u * 0.44, u * 1.0, u * 0.07);
  g.fill();
  g.fillStyle = dim('#fee2e2', dusk);
  g.fillRect(x - u * 0.14 + tip, y - u * 0.9, u * 0.28, u * 0.22);
  glyph(g, '⛽', x + tip, y - u * 1.32, u * 0.34);
}

/** A car-wash arch over the road. */
function drawWash(g: CanvasRenderingContext2D, d: Dressing, x: number, y: number): void {
  const { road, clock, dusk } = d.scene;
  const u = road.unit;
  g.fillStyle = dim('#38bdf8', dusk);
  g.fillRect(x - u * 1.05, y - u * 2.1, u * 0.16, u * 2.1);
  g.fillRect(x + u * 0.89, y - u * 2.1, u * 0.16, u * 2.1);
  box(g, x - u * 1.05, y - u * 2.3, u * 2.1, u * 0.3, u * 0.1);
  g.fill();
  glyph(g, '🚿', x, y - u * 2.15, u * 0.34);
  // Water coming down inside the arch.
  g.strokeStyle = 'rgba(186,230,253,0.75)';
  g.lineWidth = Math.max(1, u * 0.026);
  for (let i = 0; i < 7; i++) {
    const dx = x - u * 0.84 + i * u * 0.28;
    const top = y - u * 1.95;
    const drop = ((clock * 1.6 + i * 0.31) % 1) * u * 1.2;
    g.beginPath();
    g.moveTo(dx, top + drop);
    g.lineTo(dx, top + drop + u * 0.22);
    g.stroke();
  }
}

/** Rails across the road, a barrier, and a train when one is coming. */
function drawCrossing(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number): void {
  const { road, dusk } = d.scene;
  const u = road.unit;
  const t = d.crossings.get(prop.slot);
  // The rails themselves, lying across the tarmac.
  g.strokeStyle = dim('#78716c', dusk);
  g.lineWidth = Math.max(2, u * 0.05);
  for (const off of [-0.1, 0.28]) {
    g.beginPath();
    g.moveTo(x - u * 0.55, y + u * (0.16 + off));
    g.lineTo(x + u * 0.55, y + u * (0.16 + off));
    g.stroke();
  }
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(x + i * u * 0.24, y + u * 0.02);
    g.lineTo(x + i * u * 0.24, y + u * 0.5);
    g.stroke();
  }
  if (t !== undefined && trainAcross(t) !== null) drawTrain(g, d, y, trainAcross(t)!);
  // The post and its arm, swinging down across the road.
  const down = t === undefined ? 0 : barrierDown(t);
  const postX = x - u * 1.15;
  g.fillStyle = dim('#e2e8f0', dusk);
  g.fillRect(postX - u * 0.05, y - u * 1.25, u * 0.1, u * 1.25);
  g.save();
  g.translate(postX, y - u * 1.15);
  g.rotate(down * (Math.PI / 2));
  g.fillStyle = '#dc2626';
  g.fillRect(0, -u * 0.05, u * 1.5, u * 0.1);
  g.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) g.fillRect(u * (0.22 + i * 0.42), -u * 0.05, u * 0.2, u * 0.1);
  g.restore();
  // Two lamps that alternate while the barrier is anything but up.
  const flashing = t !== undefined && railPhase(t) !== 'clear';
  for (const [i, side] of [-1, 1].entries()) {
    const on = flashing && Math.floor(d.scene.clock * 3) % 2 === i;
    g.fillStyle = on ? '#ef4444' : dim('#7f1d1d', dusk * 0.5);
    g.beginPath();
    g.arc(postX + side * u * 0.14, y - u * 1.38, u * 0.07, 0, Math.PI * 2);
    g.fill();
  }
}

function drawTrain(g: CanvasRenderingContext2D, d: Dressing, y: number, across: number): void {
  const { road, dusk } = d.scene;
  const u = road.unit;
  // The train runs across the screen, well behind the road, not along it.
  const x = -u * 3 + across * (road.w + u * 6);
  const top = y - u * 1.05;
  g.save();
  g.translate(x, top);
  g.fillStyle = dim('#1e293b', dusk * 0.4);
  box(g, 0, 0, u * 1.1, u * 0.62, u * 0.08);
  g.fill();
  g.fillStyle = dim('#0f172a', dusk * 0.4);
  g.fillRect(u * 0.18, -u * 0.28, u * 0.22, u * 0.3);
  for (let i = 1; i <= 3; i++) {
    g.fillStyle = dim(['#0ea5e9', '#22c55e', '#f59e0b'][i - 1] ?? '#0ea5e9', dusk * 0.4);
    box(g, -i * u * 1.35 - u * 0.1, u * 0.06, u * 1.25, u * 0.5, u * 0.06);
    g.fill();
    g.fillStyle = dusk > 0.4 ? '#fde68a' : dim('#bae6fd', dusk);
    for (let wIdx = 0; wIdx < 3; wIdx++) {
      g.fillRect(-i * u * 1.35 + u * (0.02 + wIdx * 0.36), u * 0.14, u * 0.24, u * 0.2);
    }
  }
  g.fillStyle = dim('#334155', dusk * 0.4);
  for (let i = -4; i <= 1; i++) {
    g.beginPath();
    g.arc(i * u * 0.7 + u * 0.3, u * 0.6, u * 0.09, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // Steam, so it is unmistakably a train even at a glance.
  g.fillStyle = `rgba(226,232,240,${(0.7 * (1 - dusk * 0.4)).toFixed(2)})`;
  for (let i = 0; i < 4; i++) {
    const puff = (d.scene.clock * 1.4 + i * 0.25) % 1;
    g.beginPath();
    g.arc(x + u * 0.3 - puff * u * 1.4, top - u * 0.35 - puff * u * 0.7, u * (0.08 + puff * 0.18), 0, Math.PI * 2);
    g.fill();
  }
}

// ---- the fork ----

/** Where the two signposts sit on screen, so a finger can find them. */
export interface SignBox {
  plan: LegPlan;
  x: number;
  y: number;
  r: number;
}

export function signBoxes(d: Dressing, prop: Prop, x: number, y: number): SignBox[] {
  const u = d.scene.road.unit;
  const [up, down] = forkAt(prop.slot);
  return [
    { plan: up, x: x - u * 0.85, y: y - u * 2.55, r: u * 0.62 },
    { plan: down, x: x + u * 0.85, y: y - u * 1.5, r: u * 0.62 },
  ];
}

function drawFork(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, x: number, y: number): void {
  const { road, clock, dusk } = d.scene;
  const u = road.unit;
  const picked = d.chosen.get(prop.slot);
  const signs = signBoxes(d, prop, x, y);
  // A gantry across the road holding both boards up.
  g.fillStyle = dim('#a8a29e', dusk);
  g.fillRect(x - u * 0.06, y - u * 2.9, u * 0.12, u * 2.9);
  for (const [i, sign] of signs.entries()) {
    const chosen = picked === undefined ? null : picked === (i === 0);
    g.globalAlpha = chosen === false ? 0.28 : 1;
    g.strokeStyle = dim('#a8a29e', dusk);
    g.lineWidth = Math.max(2, u * 0.05);
    g.beginPath();
    g.moveTo(x, y - u * 2.1);
    g.lineTo(sign.x, sign.y);
    g.stroke();
    const beat = chosen === null ? 1 + Math.sin(clock * 3 + i) * 0.06 : 1;
    g.save();
    g.translate(sign.x, sign.y);
    g.scale(beat, beat);
    g.fillStyle = chosen ? '#fde047' : dim('#f8fafc', dusk * 0.6);
    box(g, -sign.r, -sign.r * 0.8, sign.r * 2, sign.r * 1.6, sign.r * 0.28);
    g.fill();
    g.strokeStyle = dim('#0f766e', dusk * 0.5);
    g.lineWidth = Math.max(2, u * 0.04);
    box(g, -sign.r, -sign.r * 0.8, sign.r * 2, sign.r * 1.6, sign.r * 0.28);
    g.stroke();
    glyph(g, sign.plan.emoji, 0, -sign.r * 0.06, sign.r * 0.95);
    // An arrow under it saying which way the road goes.
    glyph(g, sign.plan.up ? '⬆️' : '⬇️', 0, sign.r * 0.52, sign.r * 0.5);
    g.restore();
    g.globalAlpha = 1;
  }
}

// ---- the lot ----

export function drawProp(g: CanvasRenderingContext2D, d: Dressing, prop: Prop, load: Load, tarmac: boolean): void {
  const x = prop.x - d.scene.camX;
  const y = roadY(d.scene.road, prop.x);
  if (tarmac) {
    if (prop.kind === 'puddle') drawPuddle(g, d, prop, x, y);
    else if (prop.kind === 'crossing') drawCrossing(g, d, prop, x, y);
    return;
  }
  switch (prop.kind) {
    case 'tree':
      return drawTree(g, d, prop, x, y);
    case 'bush':
      return drawBush(g, d, prop, x, y);
    case 'house':
      return drawHouse(g, d, prop, x, y);
    case 'stop':
      return drawStop(g, d, prop, x, y, load);
    case 'light':
      return drawLight(g, d, prop, x, y);
    case 'pump':
      return drawPump(g, d, prop, x, y);
    case 'wash':
      return drawWash(g, d, x, y);
    case 'fork':
      return drawFork(g, d, prop, x, y);
    default:
      return;
  }
}

/** Windows and lamps that should still be alight when the sun goes down. */
export function lampsFor(prop: Prop, x: number, y: number, unit: number): { x: number; y: number; r: number }[] {
  if (prop.kind === 'house') {
    const u = unit * (1.35 + prop.seed * 0.3);
    return [{ x: x + u * 0.28, y: y - u * 0.62, r: unit * 1.0 }];
  }
  if (prop.kind === 'pump') return [{ x, y: y - unit * 1.5, r: unit * 1.5 }];
  if (prop.kind === 'wash') return [{ x, y: y - unit * 1.2, r: unit * 1.4 }];
  return [];
}

/** A seeded shuffle for poke replies, so the same tree drops the same fruit. */
export function seedFor(slot: number, clock: number): () => number {
  return mulberry32(slot * 977 + Math.floor(clock * 3) * 31 + 5);
}
