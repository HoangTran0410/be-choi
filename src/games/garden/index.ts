import { h, randInt, replay } from '../../core/dom';
import { solveTwoBone } from '../../core/creature';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  BUG_NAMES,
  HARVEST_FOR_STAR,
  SEEDS,
  actionFor,
  daylight,
  hitsBug,
  harvest,
  isRipe,
  makeBugs,
  makeClouds,
  makeField,
  makePlots,
  makeTufts,
  plant,
  plotCount,
  settle,
  shooBug,
  skyBody,
  skyStops,
  stepBug,
  water,
  type Bug,
  type Cloud,
  type Field,
  type Plot,
  type Seed,
  type Tuft,
} from './logic';
import './style.css';

const MAX_STEP = 0.05;

/** Deterministic 0…1 from two integers, so the stars stay where they were put. */
function hash(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
/** How many picked things fit in the basket before it starts again. */
const BASKET = 8;

/** A tapered ribbon from `(x0,y0)` to `(x1,y1)`, bowed sideways by `bow`. */
function ribbon(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, bow: number, base: number, tip: number): void {
  const steps = 6;
  const side = (sign: number, s: number): [number, number] => {
    const t = s / steps;
    const bend = Math.sin(t * Math.PI) * bow;
    const wide = base + (tip - base) * t;
    return [x0 + (x1 - x0) * t + bend + sign * wide, y0 + (y1 - y0) * t];
  };
  g.beginPath();
  const [sx, sy] = side(-1, 0);
  g.moveTo(sx, sy);
  for (let s = 1; s <= steps; s++) {
    const [px, py] = side(-1, s);
    g.lineTo(px, py);
  }
  for (let s = steps; s >= 0; s--) {
    const [px, py] = side(1, s);
    g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
}

/**
 * Vườn cây: plant, water, pick, repeat.
 *
 * The other half of it is the half the child does not touch — clouds drift, grass
 * bends, a bee works the flowers, a ladybug walks the soil on two-bone IK legs —
 * so the garden is somewhere to be as well as something to do.
 */
function start(ctx: GameContext): void {
  const canvas = h('canvas', { class: 'garden-canvas' });
  const tray = h('div', { class: 'g-tray garden-tray' });
  const root = h('div', { class: 'garden' }, canvas, tray);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  let alive = true;
  let dpr = 1;
  let field: Field = makeField(1, 1);
  let plots: Plot[] = [];
  let bugs: Bug[] = [];
  let clouds: Cloud[] = [];
  let tufts: Tuft[] = [];
  let picked: Seed[] = [];
  let harvested = 0;
  let clock = 0;
  let chosen: Seed = SEEDS[0]!;

  // ---- the seed tray ----

  const buttons = SEEDS.map((seed) => {
    const btn = h(
      'button',
      { class: 'g-item garden-seed', type: 'button', 'data-seed': seed.id, 'aria-label': `hạt ${seed.name}` },
      seed.emoji,
    );
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      chosen = seed;
      render();
      ctx.audio.tick();
      ctx.speak(seed.name);
    });
    return btn;
  });
  tray.append(...buttons);

  function render(): void {
    for (const btn of buttons) btn.classList.toggle('selected', btn.dataset.seed === chosen.id);
  }
  render();

  // ---- the plot of land ----

  function build(): void {
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width === Math.round(w * nextDpr) && canvas.height === Math.round(hgt * nextDpr)) return;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    field = makeField(w, hgt);
    const keep = plots;
    plots = makePlots(plotCount(w, field.unit));
    // Keep whatever was growing when the screen turned.
    plots.forEach((plot, i) => {
      const was = keep[i];
      if (!was) return;
      plot.seed = was.seed;
      plot.water = was.water;
      plot.grown = was.grown;
    });
    bugs = makeBugs(field);
    clouds = makeClouds(field);
    tufts = makeTufts(field);
  }

  const plotX = (plot: Plot): number => plot.at * field.w;
  const plantTop = (plot: Plot): number => field.ground - plot.seed!.height * field.unit * plot.grown;

  /** Where the open flowers are, for the bees to work. */
  function blooms(): { x: number; y: number }[] {
    return plots.filter((p) => p.seed !== null && p.grown > 0.75).map((p) => ({ x: plotX(p), y: plantTop(p) }));
  }

  // ---- sky and soil ----

  function drawSky(g: CanvasRenderingContext2D): void {
    const light = daylight(clock);
    const [top, middle, horizon] = skyStops(clock);
    const sky = g.createLinearGradient(0, 0, 0, field.ground);
    sky.addColorStop(0, top);
    sky.addColorStop(0.6, middle);
    sky.addColorStop(1, horizon);
    g.fillStyle = sky;
    g.fillRect(0, 0, field.w, field.ground + 1);

    // Stars come out as the light goes, and twinkle at their own rates.
    if (light < 0.9) {
      for (let i = 0; i < 44; i++) {
        const twinkle = 0.55 + 0.45 * Math.sin(clock * 1.6 + i * 2.4);
        g.fillStyle = `rgba(255,255,255,${(0.9 - light) * twinkle})`;
        g.beginPath();
        g.arc(hash(i, 1) * field.w, hash(i, 2) * field.ground * 0.75, 1 + hash(i, 3) * 1.7, 0, Math.PI * 2);
        g.fill();
      }
    }

    const body = skyBody(clock, field);
    const r = field.unit * 0.5;
    if (!body.moon) {
      g.save();
      g.translate(body.x, body.y);
      g.rotate(clock * 0.12);
      g.fillStyle = 'rgba(253,224,71,0.55)';
      for (let i = 0; i < 12; i++) {
        g.rotate(Math.PI / 6);
        g.beginPath();
        g.moveTo(r * 1.2, -r * 0.1);
        g.lineTo(r * 2 + Math.sin(clock * 2 + i) * r * 0.12, 0);
        g.lineTo(r * 1.2, r * 0.1);
        g.closePath();
        g.fill();
      }
      g.restore();
      const glow = g.createRadialGradient(body.x, body.y, r * 0.2, body.x, body.y, r * 1.6);
      glow.addColorStop(0, '#fef08a');
      glow.addColorStop(0.55, '#fde047');
      glow.addColorStop(1, 'rgba(253,224,71,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(body.x, body.y, r * 1.6, 0, Math.PI * 2);
      g.fill();
    } else {
      const glow = g.createRadialGradient(body.x, body.y, r * 0.3, body.x, body.y, r * 2);
      glow.addColorStop(0, 'rgba(226,232,240,0.55)');
      glow.addColorStop(1, 'rgba(226,232,240,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(body.x, body.y, r * 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f8fafc';
      g.beginPath();
      g.arc(body.x, body.y, r * 0.78, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(203,213,225,0.75)';
      for (const [ox, oy, cr] of [
        [-0.3, -0.2, 0.16],
        [0.24, 0.1, 0.2],
        [-0.05, 0.34, 0.12],
      ]) {
        g.beginPath();
        g.arc(body.x + ox! * r, body.y + oy! * r, cr! * r, 0, Math.PI * 2);
        g.fill();
      }
    }

    for (const cloud of clouds) {
      const x = ((cloud.x + clock * cloud.drift) % (field.w + cloud.r * 6)) - cloud.r * 3;
      g.fillStyle = `rgba(255,255,255,${0.18 + light * 0.72})`;
      for (const [ox, oy, cs] of [
        [-cloud.r * 0.9, cloud.r * 0.15, 0.7],
        [0, 0, 1],
        [cloud.r, cloud.r * 0.2, 0.75],
        [cloud.r * 0.35, -cloud.r * 0.4, 0.6],
      ]) {
        g.beginPath();
        g.arc(x + ox!, cloud.y + oy!, cloud.r * cs!, 0, Math.PI * 2);
        g.fill();
      }
    }

    for (const [depth, colour] of [
      [0.16, '#86efac'],
      [0.09, '#4ade80'],
    ] as const) {
      g.fillStyle = colour;
      g.beginPath();
      g.moveTo(0, field.ground);
      g.quadraticCurveTo(field.w * 0.25, field.ground - field.h * depth, field.w * 0.55, field.ground - field.h * depth * 0.4);
      g.quadraticCurveTo(field.w * 0.8, field.ground - field.h * depth * 1.1, field.w, field.ground - field.h * depth * 0.2);
      g.lineTo(field.w, field.ground);
      g.closePath();
      g.fill();
    }
  }

  /** Night, laid over the whole picture at once so nothing is lit that should not be. */
  function drawNight(g: CanvasRenderingContext2D): void {
    const light = daylight(clock);
    if (light >= 1) return;
    g.fillStyle = `rgba(9,14,44,${(1 - light) * 0.58})`;
    g.fillRect(0, 0, field.w, field.h);
    if (light > 0.4) return;
    // Fireflies, only once it is properly dark.
    const strength = (0.4 - light) / 0.4;
    for (let i = 0; i < 14; i++) {
      const t = clock * 0.4 + i;
      const wander = (hash(i, 7) * field.w + Math.sin(t) * field.unit * 1.4 + clock * field.unit * 0.2 * (hash(i, 8) - 0.5)) % field.w;
      const x = wander < 0 ? wander + field.w : wander;
      const y = field.ground * (0.28 + hash(i, 9) * 0.62) + Math.cos(t * 1.3) * field.unit * 0.5;
      const pulse = 0.3 + 0.7 * Math.max(0, Math.sin(clock * 3 + i * 2));
      const glow = g.createRadialGradient(x, y, 0, x, y, field.unit * 0.34);
      glow.addColorStop(0, `rgba(253,230,138,${strength * pulse})`);
      glow.addColorStop(1, 'rgba(253,230,138,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(x, y, field.unit * 0.34, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawSoil(g: CanvasRenderingContext2D): void {
    const soil = g.createLinearGradient(0, field.ground, 0, field.h);
    soil.addColorStop(0, '#a16207');
    soil.addColorStop(0.35, '#7c4a10');
    soil.addColorStop(1, '#4a2c0a');
    g.fillStyle = soil;
    g.beginPath();
    g.moveTo(0, field.ground + field.unit * 0.06);
    for (let x = 0; x <= field.w; x += field.w / 10) {
      g.lineTo(x, field.ground + Math.sin(x * 0.02) * field.unit * 0.05);
    }
    g.lineTo(field.w, field.h);
    g.lineTo(0, field.h);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 40; i++) {
      const x = (((i * 97) % 1000) / 1000) * field.w;
      const y = field.ground + field.unit * 0.15 + (((i * 53) % 100) / 100) * (field.h - field.ground);
      g.fillRect(x, y, 3, 2);
    }
    // Grass along the lip of the soil.
    for (const tuft of tufts) {
      const bend = Math.sin(clock * 1.3 + tuft.phase) * field.unit * 0.06;
      g.fillStyle = `hsl(${tuft.hue} 60% 42%)`;
      ribbon(g, tuft.x, field.ground + field.unit * 0.06, tuft.x + bend, field.ground - tuft.h, bend * 0.5, field.unit * 0.09, 0);
    }
  }

  /** Where each plant goes: a dug bed, with a dashed ring while it is still bare. */
  function drawMound(g: CanvasRenderingContext2D, plot: Plot): void {
    const x = plotX(plot);
    const y = field.ground + field.unit * 0.12;
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.beginPath();
    g.ellipse(x, y, field.unit * 0.44, field.unit * 0.17, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.ellipse(x, y - field.unit * 0.03, field.unit * 0.44, field.unit * 0.15, 0, Math.PI, Math.PI * 2);
    g.fill();
    if (plot.seed) return;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = Math.max(1.5, field.unit * 0.03);
    g.setLineDash([field.unit * 0.12, field.unit * 0.09]);
    g.beginPath();
    g.ellipse(x, y, field.unit * 0.34, field.unit * 0.13, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }

  function drawBasket(g: CanvasRenderingContext2D): void {
    const w = field.unit * 1.15;
    const x = field.unit * 0.85;
    const y = field.ground + field.unit * 0.85;
    g.fillStyle = '#b45309';
    g.beginPath();
    g.moveTo(x - w * 0.5, y - w * 0.55);
    g.lineTo(x + w * 0.5, y - w * 0.55);
    g.lineTo(x + w * 0.38, y);
    g.lineTo(x - w * 0.38, y);
    g.closePath();
    g.fill();
    g.strokeStyle = '#78350f';
    g.lineWidth = Math.max(1.5, w * 0.05);
    for (let i = 1; i < 3; i++) {
      g.beginPath();
      g.moveTo(x - w * 0.5 + i * w * 0.06, y - w * 0.55 + (i * w) / 4);
      g.lineTo(x + w * 0.5 - i * w * 0.06, y - w * 0.55 + (i * w) / 4);
      g.stroke();
    }
    // A rim, so it reads as a basket rather than a plant pot.
    g.fillStyle = '#92400e';
    g.beginPath();
    g.ellipse(x, y - w * 0.55, w * 0.5, w * 0.11, 0, 0, Math.PI * 2);
    g.fill();
    picked.forEach((seed, i) => {
      const px = x - w * 0.3 + (i % 4) * w * 0.2;
      const py = y - w * 0.62 - Math.floor(i / 4) * w * 0.18;
      g.fillStyle = seed.bloom;
      g.beginPath();
      g.arc(px, py, w * 0.11, 0, Math.PI * 2);
      g.fill();
    });
  }

  // ---- what is growing ----

  function drawPlant(g: CanvasRenderingContext2D, plot: Plot): void {
    const seed = plot.seed;
    if (!seed || plot.grown <= 0.001) return;
    const x = plotX(plot);
    const base = field.ground + field.unit * 0.02;
    const t = plot.grown;
    const tall = seed.height * field.unit * t;
    const bend = Math.sin(clock * 1.1 + plot.sway) * field.unit * 0.09 * t;
    const tipX = x + bend;
    const tipY = base - tall;
    const ripe = isRipe(plot);
    const pulse = ripe ? 1 + Math.sin(clock * 3) * 0.05 : 1;

    if (seed.kind === 'root') {
      // The root swells in the soil and pushes its shoulder into daylight: a rounded
      // shoulder and a long taper, not a triangle.
      const r = field.unit * seed.fruitR * t * pulse;
      g.fillStyle = seed.bloom;
      g.beginPath();
      g.moveTo(x - r, base - r * 0.35);
      g.quadraticCurveTo(x, base - r * 0.95, x + r, base - r * 0.35);
      g.quadraticCurveTo(x + r * 0.55, base + r * 1.5, x, base + r * 2.6);
      g.quadraticCurveTo(x - r * 0.55, base + r * 1.5, x - r, base - r * 0.35);
      g.closePath();
      g.fill();
      g.strokeStyle = seed.heart;
      g.lineWidth = Math.max(1, r * 0.13);
      for (let i = 1; i < 4; i++) {
        const along = i / 4;
        const half = r * (1 - along) * 0.72;
        g.beginPath();
        g.moveTo(x - half, base - r * 0.2 + along * r * 2.4);
        g.quadraticCurveTo(x, base - r * 0.05 + along * r * 2.4, x + half, base - r * 0.2 + along * r * 2.4);
        g.stroke();
      }
    }

    // Stem.
    g.fillStyle = seed.stem;
    ribbon(g, x, base, tipX, tipY, bend * 0.6, field.unit * 0.09 * t, field.unit * 0.04 * t);

    // Leaves up the stem, alternating sides.
    const leaves = seed.kind === 'root' ? 4 : 3;
    for (let i = 0; i < leaves; i++) {
      const along = 0.25 + (i / Math.max(1, leaves - 1)) * 0.55;
      if (t < along * 0.7) continue;
      const side = i % 2 === 0 ? -1 : 1;
      const lx = x + (tipX - x) * along;
      const ly = base - tall * along;
      const size = field.unit * (seed.kind === 'root' ? 0.75 : 0.52) * t;
      g.save();
      g.translate(lx, ly);
      g.rotate(side * (0.7 + Math.sin(clock * 1.4 + plot.sway + i) * 0.08) - Math.PI / 2);
      g.fillStyle = seed.leaf;
      g.beginPath();
      g.ellipse(size * 0.5 * side, 0, size * 0.5, size * 0.28, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    if (t < 0.55) return;
    const open = Math.min(1, (t - 0.55) / 0.45);

    if (seed.kind === 'flower') {
      const r = field.unit * 0.34 * open * pulse;
      g.fillStyle = seed.bloom;
      for (let i = 0; i < seed.petals; i++) {
        const a = (i / seed.petals) * Math.PI * 2 + clock * 0.15;
        g.save();
        g.translate(tipX, tipY);
        g.rotate(a);
        g.beginPath();
        g.ellipse(r * 0.85, 0, r * 0.62, r * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.fillStyle = seed.heart;
      g.beginPath();
      g.arc(tipX, tipY, r * 0.55, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(tipX - r * 0.18, tipY - r * 0.2, r * 0.18, 0, Math.PI * 2);
      g.fill();
      return;
    }

    // Fruit: hung along the top of the stem, swelling as it ripens.
    const r = field.unit * seed.fruitR * open * pulse;
    for (let i = 0; i < seed.fruits; i++) {
      const along = seed.fruits === 1 ? 1 : 0.55 + (i / (seed.fruits - 1)) * 0.45;
      const side = i % 2 === 0 ? -1 : 1;
      const fx = x + (tipX - x) * along + (seed.fruits === 1 ? 0 : side * field.unit * 0.22);
      const fy = base - tall * along + r * 0.5;
      drawFruit(g, seed, fx, fy, r);
    }
  }

  /** A red circle is not a strawberry: each thing gets its own outline. */
  function drawFruit(g: CanvasRenderingContext2D, seed: Seed, fx: number, fy: number, r: number): void {
    g.strokeStyle = seed.stem;
    g.lineWidth = Math.max(1, r * 0.13);
    if (seed.shape === 'berry') {
      g.beginPath();
      g.moveTo(fx, fy + r * 1.3);
      g.bezierCurveTo(fx - r * 1.1, fy + r * 0.3, fx - r * 0.9, fy - r * 0.85, fx, fy - r * 0.68);
      g.bezierCurveTo(fx + r * 0.9, fy - r * 0.85, fx + r * 1.1, fy + r * 0.3, fx, fy + r * 1.3);
      g.closePath();
      g.fillStyle = seed.bloom;
      g.fill();
      g.fillStyle = '#fde047';
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.arc(fx + Math.cos(i * 2.1) * r * 0.42, fy + Math.sin(i * 2.1) * r * 0.5 + r * 0.15, r * 0.09, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = seed.leaf;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.55;
        g.beginPath();
        g.ellipse(fx + Math.cos(a) * r * 0.5, fy - r * 0.68 + Math.sin(a) * r * 0.2, r * 0.36, r * 0.15, a + Math.PI / 2, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    if (seed.shape === 'cob') {
      g.fillStyle = seed.leaf;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(fx + side * r * 0.52, fy + r * 0.1, r * 0.4, r * 1.15, side * 0.22, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = seed.bloom;
      g.beginPath();
      g.ellipse(fx, fy, r * 0.52, r * 1.1, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      for (let row = 0; row < 6; row++) {
        for (const col of [-0.5, 0, 0.5]) {
          g.beginPath();
          g.arc(fx + col * r * 0.32, fy - r * 0.78 + row * r * 0.32, r * 0.1, 0, Math.PI * 2);
          g.fill();
        }
      }
      return;
    }
    if (seed.shape === 'pumpkin') {
      g.fillStyle = seed.bloom;
      g.beginPath();
      g.ellipse(fx, fy, r * 1.1, r * 0.88, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(154,52,18,0.5)';
      g.lineWidth = Math.max(1, r * 0.08);
      for (const off of [-0.62, -0.21, 0.21, 0.62]) {
        g.beginPath();
        g.moveTo(fx + off * r * 0.55, fy - r * 0.83);
        g.quadraticCurveTo(fx + off * r * 1.5, fy, fx + off * r * 0.55, fy + r * 0.83);
        g.stroke();
      }
      g.fillStyle = seed.stem;
      g.fillRect(fx - r * 0.1, fy - r * 1.12, r * 0.2, r * 0.3);
      return;
    }
    // A plain fruit: a ball with a green star on top.
    g.fillStyle = seed.bloom;
    g.beginPath();
    g.arc(fx, fy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = seed.heart;
    g.beginPath();
    g.arc(fx - r * 0.3, fy - r * 0.32, r * 0.26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = seed.leaf;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.beginPath();
      g.ellipse(fx + Math.cos(a) * r * 0.34, fy - r * 0.8 + Math.sin(a) * r * 0.12, r * 0.3, r * 0.12, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = seed.stem;
    g.fillRect(fx - r * 0.07, fy - r * 1.15, r * 0.14, r * 0.3);
  }

  function drawWatering(g: CanvasRenderingContext2D, plot: Plot): void {
    if (plot.watering <= 0 || !plot.seed) return;
    const x = plotX(plot);
    const y = plantTop(plot) - field.unit * 0.7;
    const tip = Math.min(1, plot.watering * 3) * 0.5;
    g.save();
    g.translate(x - field.unit * 0.55, y);
    g.rotate(tip);
    g.fillStyle = '#38bdf8';
    g.fillRect(0, 0, field.unit * 0.55, field.unit * 0.4);
    g.fillStyle = '#0ea5e9';
    g.beginPath();
    g.moveTo(field.unit * 0.5, field.unit * 0.08);
    g.lineTo(field.unit * 0.9, field.unit * 0.22);
    g.lineTo(field.unit * 0.5, field.unit * 0.3);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(56,189,248,0.85)';
    for (let i = 0; i < 5; i++) {
      const fall = ((1 - plot.watering) * 3 + i * 0.2) % 1;
      g.beginPath();
      g.ellipse(
        x + (i - 2) * field.unit * 0.09,
        y + field.unit * 0.35 + fall * field.unit * 0.8,
        field.unit * 0.035,
        field.unit * 0.06,
        0,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  }

  function drawSparkle(g: CanvasRenderingContext2D, plot: Plot): void {
    if (!isRipe(plot)) return;
    const x = plotX(plot);
    const y = plantTop(plot);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 3; i++) {
      const a = clock * 1.6 + (i / 3) * Math.PI * 2;
      const r = field.unit * 0.5;
      const s = field.unit * (0.05 + 0.02 * Math.sin(clock * 4 + i));
      g.beginPath();
      g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, s, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ---- what crawls and flies ----

  function drawBug(g: CanvasRenderingContext2D, bug: Bug): void {
    const u = field.unit;
    if (bug.kind === 'ladybug') {
      const len = u * 0.34;
      const facing = bug.vx >= 0 ? 1 : -1;
      const bodyY = bug.y - len * 0.5;
      g.strokeStyle = '#1f2937';
      g.lineWidth = Math.max(1.5, len * 0.14);
      g.lineCap = 'round';
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const hipX = bug.x + (i - 1) * len * 0.4;
          const step = bug.phase * 2 + i * 2.1 + (side > 0 ? Math.PI : 0);
          const footX = hipX + facing * Math.cos(step) * len * 0.35;
          const footY = bug.y + len * 0.45 - Math.max(0, Math.sin(step)) * len * 0.3;
          // -side, so the knee lifts above the hip-to-foot line instead of buckling under it.
          const knee = solveTwoBone(hipX, bodyY + len * 0.2, footX, footY, len * 0.45, len * 0.5, -side);
          g.beginPath();
          g.moveTo(hipX, bodyY + len * 0.2);
          g.lineTo(knee.x, knee.y);
          g.lineTo(footX, footY);
          g.stroke();
        }
      }
      g.fillStyle = '#dc2626';
      g.beginPath();
      g.ellipse(bug.x, bodyY, len, len * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1f2937';
      g.beginPath();
      g.ellipse(bug.x + facing * len * 0.75, bodyY - len * 0.1, len * 0.42, len * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(bug.x - len * 0.04, bodyY - len * 0.8, len * 0.08, len * 1.6);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(bug.x + (i % 2 ? 0.42 : -0.42) * len, bodyY + (i < 2 ? -0.3 : 0.32) * len, len * 0.15, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }

    const flap = Math.sin(bug.phase);
    const facing = bug.vx >= 0 ? 1 : -1;
    g.save();
    g.translate(bug.x, bug.y);
    if (bug.kind !== 'butterfly') g.scale(facing, 1);
    if (bug.kind === 'butterfly') {
      // Seen from above, wings either side of the body: the flap is the wings
      // squashing towards each other, which is what makes it read as flying.
      const s = u * 0.34;
      const spread = 0.35 + Math.abs(flap) * 0.65;
      const hue = bug.hue * 320;
      for (const side of [-1, 1]) {
        g.fillStyle = `hsl(${hue} 85% 66%)`;
        g.beginPath();
        g.moveTo(0, -s * 0.15);
        g.quadraticCurveTo(side * s * 1.25 * spread, -s * 1.05, side * s * 1.35 * spread, -s * 0.1);
        g.quadraticCurveTo(side * s * 0.9 * spread, s * 0.12, 0, 0);
        g.closePath();
        g.fill();
        g.fillStyle = `hsl(${hue} 80% 55%)`;
        g.beginPath();
        g.moveTo(0, s * 0.05);
        g.quadraticCurveTo(side * s * 0.95 * spread, s * 0.35, side * s * 0.8 * spread, s * 0.85);
        g.quadraticCurveTo(side * s * 0.3 * spread, s * 0.6, 0, s * 0.3);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.beginPath();
        g.arc(side * s * 0.85 * spread, -s * 0.45, s * 0.13, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#3f3f46';
      g.beginPath();
      g.ellipse(0, s * 0.05, s * 0.1, s * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      for (const side of [-1, 1]) {
        g.strokeStyle = '#3f3f46';
        g.lineWidth = Math.max(1, s * 0.06);
        g.beginPath();
        g.moveTo(0, -s * 0.4);
        g.quadraticCurveTo(side * s * 0.25, -s * 0.8, side * s * 0.35, -s * 0.6);
        g.stroke();
      }
    } else {
      const s = u * 0.22;
      g.fillStyle = 'rgba(255,255,255,0.6)';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.ellipse(-s * 0.2, side * s * 0.5 * (0.6 + Math.abs(flap) * 0.6), s * 0.7, s * 0.32, side * 0.3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#facc15';
      g.beginPath();
      g.ellipse(0, 0, s, s * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1f2937';
      for (let i = 0; i < 2; i++) {
        g.beginPath();
        g.ellipse(-s * 0.2 + i * s * 0.55, 0, s * 0.16, s * 0.68, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.ellipse(s * 0.9, 0, s * 0.32, s * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // ---- the loop ----

  function step(dt: number): void {
    clock += dt;
    for (const plot of plots) settle(plot, dt);
    const open = blooms();
    for (const bug of bugs) stepBug(bug, dt, field, open);
  }

  function draw(g: CanvasRenderingContext2D): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(g);
    drawSoil(g);
    for (const plot of plots) drawMound(g, plot);
    for (const plot of plots) drawPlant(g, plot);
    for (const plot of plots) drawSparkle(g, plot);
    for (const bug of bugs) drawBug(g, bug);
    for (const plot of plots) drawWatering(g, plot);
    // The basket goes under the night with everything else; the fireflies do not.
    drawBasket(g);
    drawNight(g);
  }

  let raf = 0;
  let last = 0;
  function loop(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(MAX_STEP, (now - last) / 1000) : 0.016;
    last = now;
    build();
    if (!c || !field.w) return;
    step(dt);
    draw(c);
  }

  // ---- the child ----

  function pointAt(e: PointerEvent): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: (e.clientX - rect.left) * (field.w / rect.width),
      y: (e.clientY - rect.top) * (field.h / rect.height),
    };
  }

  function plotAt(x: number, y: number): Plot | null {
    if (y < field.h * 0.12) return null;
    let best: Plot | null = null;
    let bestAway = field.unit * 1.1;
    for (const plot of plots) {
      const away = Math.abs(plotX(plot) - x);
      if (away < bestAway) {
        bestAway = away;
        best = plot;
      }
    }
    return best;
  }

  function touch(plot: Plot): void {
    switch (actionFor(plot)) {
      case 'plant':
        plant(plot, chosen);
        ctx.audio.pop(0.8);
        navigator.vibrate?.(10);
        ctx.speak(`Trồng ${chosen.name}`);
        return;
      case 'water': {
        const done = water(plot);
        ctx.audio.puff();
        navigator.vibrate?.(10);
        if (done) {
          ctx.audio.ding();
          ctx.speak(plot.seed!.ripe);
        }
        return;
      }
      case 'harvest': {
        const seed = harvest(plot);
        if (!seed) return;
        picked = [...picked, seed].slice(-BASKET);
        ctx.audio.pop(1.4);
        navigator.vibrate?.(15);
        ctx.speak(seed.name);
        harvested++;
        if (harvested % HARVEST_FOR_STAR === 0) {
          void ctx.celebrate().then(() => {
            if (alive) ctx.addStar();
          });
        }
      }
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = pointAt(e);
    if (!p) return;
    // Whatever is flying comes first: it is on top, and it is what the finger meant.
    const bug = bugs.find((b) => hitsBug(b, p.x, p.y, field));
    if (bug) {
      shooBug(bug, p.x, p.y, field);
      ctx.audio.pop(1.5);
      navigator.vibrate?.(10);
      ctx.speak(BUG_NAMES[bug.kind]);
      return;
    }
    const plot = plotAt(p.x, p.y);
    if (plot) touch(plot);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  ctx.hint.arm(() => {
    const ripe = plots.find(isRipe);
    if (ripe) {
      ripe.sway += 0.4;
      return;
    }
    const btn = buttons.find((b) => b.dataset.seed === chosen.id) ?? buttons[randInt(0, buttons.length - 1)];
    if (btn) replay(btn, 'anim-wiggle');
  });

  const onResize = (): void => {
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
