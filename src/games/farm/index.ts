import { h, replay } from '../../core/dom';
import { solveTwoBone } from '../../core/creature';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  EGGS_FOR_STAR,
  GRAIN_PER_FEED,
  TAPS_FOR_STAR,
  hitsAnimal,
  hitsEgg,
  makeAnimals,
  makeGrain,
  makeScenery,
  makeYard,
  pondY,
  scaleAt,
  stepAnimal,
  tickLaying,
  walkFoot,
  type Animal,
  type Egg,
  type Grain,
  type Scenery,
  type Yard,
} from './logic';
import './style.css';

/** Longest frame the yard will take in one step. */
const MAX_STEP = 0.05;
const EGG_POP_MS = 500;

/** How each animal is put together on top of the plain body. */
interface Look {
  ear: 'flop' | 'point' | 'round' | 'horn' | 'none';
  tail: 'tuft' | 'curl' | 'long' | 'puff';
  /** Woolly outline (sheep), spots (cow), neither. */
  coat: 'wool' | 'spots' | 'plain';
  /** Head size as a fraction of the body length. */
  head: number;
}

const LOOKS: Readonly<Record<string, Look>> = {
  cow: { ear: 'point', tail: 'long', coat: 'spots', head: 0.24 },
  pig: { ear: 'flop', tail: 'curl', coat: 'plain', head: 0.25 },
  sheep: { ear: 'flop', tail: 'puff', coat: 'wool', head: 0.21 },
  horse: { ear: 'point', tail: 'long', coat: 'plain', head: 0.23 },
  rabbit: { ear: 'round', tail: 'puff', coat: 'plain', head: 0.27 },
  goat: { ear: 'horn', tail: 'tuft', coat: 'plain', head: 0.23 },
};

/**
 * Nông trại: a yard that gets on with its day whether or not anybody is watching.
 *
 * Every four-legged animal walks on two-bone IK legs — the hoof is planted and slides
 * back while the body carries on, then lifts and swings forward — so a cow crossing
 * the grass really walks rather than sliding along.
 *
 * The child can tap an animal to hear what it is, press 🌾 to scatter feed (everybody
 * comes running, and the last grain eaten is confetti and a star) and pick up the eggs
 * the hens leave in the grass.
 */
function start(ctx: GameContext): void {
  const canvas = h('canvas', { class: 'farm-canvas' });
  const feed = h('button', { class: 'farm-feed', type: 'button', 'aria-label': 'cho ăn' }, '🌾');
  const basket = h('div', { class: 'farm-basket' }, '🧺 0');
  const root = h('div', { class: 'farm' }, canvas, feed, basket);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  let alive = true;
  let dpr = 1;
  let yard: Yard = makeYard(1, 1);
  let animals: Animal[] = [];
  let scenery: Scenery = { posts: [], tufts: [] };
  let grains: Grain[] = [];
  let eggs: Egg[] = [];
  let clock = 0;
  let taps = 0;
  let collected = 0;
  let feeding = false;

  function build(): void {
    const w = root.clientWidth;
    const hgt = root.clientHeight;
    if (!w || !hgt) return;
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width === Math.round(w * nextDpr) && canvas.height === Math.round(hgt * nextDpr)) return;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    yard = makeYard(w, hgt);
    animals = makeAnimals(yard);
    scenery = makeScenery(yard);
    grains = [];
    eggs = [];
    feeding = false;
  }

  // ---- the day ----

  async function fed(): Promise<void> {
    feeding = false;
    ctx.speak('Các bạn ăn no rồi!');
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
  }

  function step(dt: number): void {
    clock += dt;
    for (const grain of grains) if (grain.drop > 0) grain.drop = Math.max(0, grain.drop - dt * 3);
    for (const egg of eggs) egg.age = Math.min(1, egg.age + dt / (EGG_POP_MS / 1000));
    for (const animal of animals) {
      const eaten = stepAnimal(animal, dt, yard, grains, Math.random);
      if (eaten) {
        eaten.eaten = true;
        ctx.audio.chomp();
      }
      const egg = tickLaying(animal, dt, eggs);
      if (egg) {
        eggs.push(egg);
        ctx.audio.pop(1.4);
        animal.happy = 1;
      }
    }
    if (feeding && grains.every((g) => g.eaten)) void fed();
    grains = grains.filter((g) => !g.eaten);
  }

  // ---- scenery ----

  function drawSky(g: CanvasRenderingContext2D): void {
    const sky = g.createLinearGradient(0, 0, 0, yard.horizon);
    sky.addColorStop(0, '#7dd3fc');
    sky.addColorStop(1, '#e0f2fe');
    g.fillStyle = sky;
    g.fillRect(0, 0, yard.w, yard.horizon + 1);
    g.fillStyle = '#fde68a';
    g.beginPath();
    g.arc(yard.w * 0.16, yard.h * 0.1, yard.unit * 0.42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 3; i++) {
      const span = yard.w + yard.unit * 4;
      const x = ((clock * yard.unit * 0.12 + (i * span) / 3) % span) - yard.unit * 2;
      const y = yard.h * (0.08 + i * 0.06);
      const r = yard.unit * (0.22 + (i % 2) * 0.1);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.arc(x + r * 0.9, y - r * 0.3, r * 0.7, 0, Math.PI * 2);
      g.arc(x + r * 1.7, y, r * 0.55, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawBarn(g: CanvasRenderingContext2D): void {
    const u = yard.unit;
    const x = yard.w * 0.2;
    const y = yard.horizon;
    const w = u * 1.7;
    const hgt = u * 1.1;
    g.fillStyle = '#b91c1c';
    g.fillRect(x - w / 2, y - hgt, w, hgt);
    g.fillStyle = '#7f1d1d';
    g.beginPath();
    g.moveTo(x - w * 0.62, y - hgt);
    g.lineTo(x, y - hgt - u * 0.62);
    g.lineTo(x + w * 0.62, y - hgt);
    g.closePath();
    g.fill();
    g.fillStyle = '#fef3c7';
    g.fillRect(x - w * 0.2, y - hgt * 0.66, w * 0.4, hgt * 0.66);
    g.strokeStyle = '#b91c1c';
    g.lineWidth = Math.max(1.5, u * 0.05);
    g.beginPath();
    g.moveTo(x - w * 0.2, y - hgt * 0.66);
    g.lineTo(x + w * 0.2, y);
    g.moveTo(x + w * 0.2, y - hgt * 0.66);
    g.lineTo(x - w * 0.2, y);
    g.stroke();
    // Hay loft window.
    g.fillStyle = '#fde68a';
    g.beginPath();
    g.arc(x, y - hgt - u * 0.12, u * 0.13, 0, Math.PI * 2);
    g.fill();
  }

  function drawHills(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#bbf7d0';
    g.beginPath();
    g.moveTo(0, yard.horizon);
    for (let x = 0; x <= yard.w; x += 10) {
      const t = x / (yard.unit * 4);
      g.lineTo(x, yard.horizon - yard.unit * (0.5 + Math.sin(t) * 0.28 + Math.sin(t * 2.3 + 1) * 0.12));
    }
    g.lineTo(yard.w, yard.horizon);
    g.closePath();
    g.fill();
  }

  function drawFence(g: CanvasRenderingContext2D): void {
    const u = yard.unit;
    const y = yard.horizon;
    g.strokeStyle = '#fef3c7';
    g.lineWidth = Math.max(2, u * 0.07);
    for (const rail of [0.22, 0.42]) {
      g.beginPath();
      g.moveTo(0, y - u * rail);
      g.lineTo(yard.w, y - u * rail);
      g.stroke();
    }
    g.strokeStyle = '#fde68a';
    g.lineWidth = Math.max(2, u * 0.09);
    for (const x of scenery.posts) {
      g.beginPath();
      g.moveTo(x, y - u * 0.55);
      g.lineTo(x, y + u * 0.04);
      g.stroke();
    }
  }

  function drawGrass(g: CanvasRenderingContext2D): void {
    const grass = g.createLinearGradient(0, yard.horizon, 0, yard.h);
    grass.addColorStop(0, '#86efac');
    grass.addColorStop(1, '#4ade80');
    g.fillStyle = grass;
    g.fillRect(0, yard.horizon, yard.w, yard.h - yard.horizon);
  }

  function drawTufts(g: CanvasRenderingContext2D): void {
    const u = yard.unit;
    for (const tuft of scenery.tufts) {
      const s = 0.5 + (tuft.y - yard.horizon) / Math.max(1, yard.h - yard.horizon);
      const blade = u * 0.16 * s;
      const sway = Math.sin(clock * 1.3 + tuft.x) * blade * 0.15;
      g.strokeStyle = tuft.seed > 0.5 ? '#22c55e' : '#16a34a';
      g.lineWidth = Math.max(1.5, u * 0.028 * s);
      g.lineCap = 'round';
      for (const lean of [-0.4, 0, 0.4]) {
        g.beginPath();
        g.moveTo(tuft.x, tuft.y);
        g.quadraticCurveTo(tuft.x + lean * blade, tuft.y - blade * 0.6, tuft.x + lean * blade * 2 + sway, tuft.y - blade);
        g.stroke();
      }
      g.lineCap = 'butt';
      if (tuft.seed > 0.86) {
        g.fillStyle = tuft.seed > 0.94 ? '#fda4af' : '#fef08a';
        g.beginPath();
        g.arc(tuft.x + blade * 0.8 + sway, tuft.y - blade * 1.1, blade * 0.26, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function drawPond(g: CanvasRenderingContext2D): void {
    const y = pondY(yard);
    g.fillStyle = '#38bdf8';
    g.beginPath();
    g.ellipse(yard.pondX, y, yard.pondR, yard.pondR * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = Math.max(1.5, yard.unit * 0.03);
    for (let i = 0; i < 3; i++) {
      const t = (clock * 0.25 + i / 3) % 1;
      g.globalAlpha = 1 - t;
      g.beginPath();
      g.ellipse(yard.pondX, y, yard.pondR * (0.25 + t * 0.7), yard.pondR * 0.42 * (0.25 + t * 0.7), 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  // ---- the animals ----

  /** One leg, hip to hoof, drawn as two bones with a knee between them. */
  function leg(
    g: CanvasRenderingContext2D,
    hipX: number,
    hipY: number,
    footX: number,
    footY: number,
    bone: number,
    bend: number,
    width: number,
    colour: string,
  ): void {
    const knee = solveTwoBone(hipX, hipY, footX, footY, bone, bone, bend);
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(hipX, hipY);
    g.lineTo(knee.x, knee.y);
    g.lineTo(footX, footY);
    g.stroke();
    g.lineCap = 'butt';
  }

  function drawQuadruped(g: CanvasRenderingContext2D, a: Animal, L: number): void {
    const look = LOOKS[a.species.id] ?? { ear: 'point', tail: 'tuft', coat: 'plain', head: 0.28 };
    const dir = a.dir;
    const ground = L * 0.62;
    const hipY = L * 0.18;
    const bone = L * 0.25;
    const stride = a.species.gait === 'hop' ? L * 0.1 : L * 0.28;
    const lift = L * 0.16;
    const shade = 'rgba(0,0,0,0.18)';

    // Ground shadow first, so nothing floats.
    g.fillStyle = shade;
    g.beginPath();
    g.ellipse(0, ground, L * 0.42, L * 0.08, 0, 0, Math.PI * 2);
    g.fill();

    const pairs: [number, number][] = [
      [L * 0.33 * dir, 0],
      [-L * 0.33 * dir, 0.5],
    ];
    // Far legs are drawn behind the body and darkened; near legs on top.
    for (const far of [true, false]) {
      pairs.forEach(([hipX, offset], i) => {
        const foot = walkFoot(a.phase + offset + (far ? 0.5 : 0), stride, lift);
        const front = i === 0;
        g.globalAlpha = far ? 0.5 : 1;
        leg(g, hipX, hipY, hipX + foot.x * dir, ground + foot.y, bone, front ? dir : -dir, L * (far ? 0.075 : 0.09), a.species.spot);
        g.globalAlpha = 1;
      });
      if (far) {
        // Body over the far legs.
        g.fillStyle = a.species.coat;
        g.beginPath();
        g.ellipse(0, 0, L * 0.47, L * 0.27, 0, 0, Math.PI * 2);
        g.fill();
        if (look.coat === 'wool') {
          g.fillStyle = a.species.coat;
          for (let i = 0; i < 7; i++) {
            const ang = (i / 7) * Math.PI * 2;
            g.beginPath();
            g.arc(Math.cos(ang) * L * 0.36, Math.sin(ang) * L * 0.2, L * 0.13, 0, Math.PI * 2);
            g.fill();
          }
        }
        if (look.coat === 'spots') {
          g.fillStyle = a.species.spot;
          for (const [px, py, pr] of [
            [-0.16, -0.06, 0.12],
            [0.12, 0.08, 0.09],
            [0.02, -0.14, 0.07],
          ] as const) {
            g.beginPath();
            g.ellipse(px * L * dir, py * L, pr * L, pr * L * 0.8, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }

    // Tail, at the back.
    g.strokeStyle = a.species.spot;
    g.lineWidth = L * 0.05;
    g.lineCap = 'round';
    const tailX = -L * 0.47 * dir;
    const swish = Math.sin(clock * 2.4 + a.x) * L * 0.08;
    if (look.tail === 'long') {
      g.beginPath();
      g.moveTo(tailX, -L * 0.14);
      g.quadraticCurveTo(tailX - L * 0.12 * dir + swish, L * 0.02, tailX - L * 0.06 * dir + swish, L * 0.24);
      g.stroke();
    } else if (look.tail === 'curl') {
      g.beginPath();
      g.arc(tailX - L * 0.06 * dir, -L * 0.12, L * 0.08, 0, Math.PI * 1.6);
      g.stroke();
    } else if (look.tail === 'puff') {
      g.fillStyle = a.species.coat;
      g.beginPath();
      g.arc(tailX - L * 0.04 * dir, -L * 0.1, L * 0.11, 0, Math.PI * 2);
      g.fill();
    } else {
      g.beginPath();
      g.moveTo(tailX, -L * 0.12);
      g.lineTo(tailX - L * 0.1 * dir + swish, L * 0.04);
      g.stroke();
    }
    g.lineCap = 'butt';

    // Neck and head. A grazing animal drops its head to the grass.
    const graze = a.rest > 0 && a.species.gait !== 'hop' ? 1 : 0;
    const headR = L * look.head;
    const headX = dir * L * (0.54 + graze * 0.04);
    const headY = -L * 0.4 + graze * L * 0.76;
    g.strokeStyle = a.species.coat;
    g.lineWidth = L * 0.15;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(dir * L * 0.26, -L * 0.12);
    g.lineTo(headX, headY);
    g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = a.species.coat;
    g.beginPath();
    g.arc(headX, headY, headR, 0, Math.PI * 2);
    g.fill();
    // Muzzle.
    g.fillStyle = a.species.spot;
    g.beginPath();
    g.ellipse(headX + dir * headR * 0.72, headY + headR * 0.28, headR * 0.5, headR * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.arc(headX + dir * headR * 0.92, headY + headR * 0.28, headR * 0.06, 0, Math.PI * 2);
    g.arc(headX + dir * headR * 0.66, headY + headR * 0.44, headR * 0.06, 0, Math.PI * 2);
    g.fill();
    // Eye.
    g.fillStyle = '#1f2937';
    g.beginPath();
    g.arc(headX + dir * headR * 0.3, headY - headR * 0.2, headR * 0.13, 0, Math.PI * 2);
    g.fill();
    // Ears and horns.
    g.fillStyle = a.species.spot;
    if (look.ear === 'flop') {
      g.beginPath();
      g.ellipse(headX - dir * headR * 0.35, headY - headR * 0.45, headR * 0.28, headR * 0.42, dir * 0.4, 0, Math.PI * 2);
      g.fill();
    } else if (look.ear === 'point') {
      g.beginPath();
      g.moveTo(headX - dir * headR * 0.15, headY - headR * 0.85);
      g.lineTo(headX - dir * headR * 0.6, headY - headR * 1.15);
      g.lineTo(headX - dir * headR * 0.62, headY - headR * 0.55);
      g.closePath();
      g.fill();
    } else if (look.ear === 'round') {
      for (const side of [-0.25, 0.35]) {
        g.beginPath();
        g.ellipse(headX + dir * headR * side, headY - headR * 1.25, headR * 0.2, headR * 0.7, dir * side * 0.6, 0, Math.PI * 2);
        g.fill();
      }
    } else if (look.ear === 'horn') {
      g.strokeStyle = a.species.spot;
      g.lineWidth = L * 0.045;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(headX - dir * headR * 0.2, headY - headR * 0.85);
      g.quadraticCurveTo(headX - dir * headR * 0.7, headY - headR * 1.3, headX - dir * headR * 1.1, headY - headR * 0.8);
      g.stroke();
      g.lineCap = 'butt';
      // A little beard, which is what makes a goat a goat.
      g.fillStyle = a.species.coat;
      g.beginPath();
      g.ellipse(headX + dir * headR * 0.2, headY + headR * 0.9, headR * 0.14, headR * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    }
    // The horse gets a mane.
    if (a.species.id === 'horse') {
      g.strokeStyle = a.species.spot;
      g.lineWidth = L * 0.045;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(headX - dir * headR * 0.7, headY - headR * 0.5);
      g.quadraticCurveTo(dir * L * 0.34, -L * 0.42, dir * L * 0.16, -L * 0.24);
      g.stroke();
      g.lineCap = 'butt';
    }
  }

  function drawBird(g: CanvasRenderingContext2D, a: Animal, L: number): void {
    const dir = a.dir;
    const swimming = a.species.swims;
    const ground = L * 0.62;
    const peck = a.rest > 0 && a.species.gait === 'peck' ? Math.max(0, Math.sin(clock * 6)) : 0;

    if (!swimming) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.ellipse(0, ground, L * 0.34, L * 0.07, 0, 0, Math.PI * 2);
      g.fill();
      // Two thin legs, same IK as the big animals.
      for (const [hipX, offset] of [
        [L * 0.08, 0],
        [-L * 0.08, 0.5],
      ] as const) {
        const foot = walkFoot(a.phase + offset, L * 0.16, L * 0.1);
        leg(g, hipX, L * 0.2, hipX + foot.x * dir, ground + foot.y, L * 0.16, dir, L * 0.045, '#f59e0b');
      }
    }

    // Body, tipped forward when pecking.
    g.save();
    g.rotate(peck * dir * 0.45);
    g.fillStyle = a.species.coat;
    g.beginPath();
    g.ellipse(0, 0, L * 0.42, L * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    // Wing.
    g.fillStyle = a.species.spot;
    g.globalAlpha = 0.35;
    g.beginPath();
    g.ellipse(-L * 0.06 * dir, L * 0.02, L * 0.24, L * 0.17, dir * 0.2, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    // Tail feathers.
    g.fillStyle = a.species.coat;
    g.beginPath();
    g.moveTo(-L * 0.36 * dir, -L * 0.05);
    g.lineTo(-L * 0.62 * dir, -L * 0.3);
    g.lineTo(-L * 0.3 * dir, -L * 0.22);
    g.closePath();
    g.fill();
    // Head, comb and beak.
    const headX = dir * L * 0.34;
    const headY = -L * 0.34;
    const headR = L * 0.22;
    g.fillStyle = a.species.coat;
    g.beginPath();
    g.arc(headX, headY, headR, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = a.species.spot;
    if (a.species.id === 'chicken') {
      for (const off of [-0.3, 0, 0.3]) {
        g.beginPath();
        g.arc(headX + dir * headR * off, headY - headR * 0.95, headR * 0.28, 0, Math.PI * 2);
        g.fill();
      }
      // Wattle under the beak.
      g.beginPath();
      g.arc(headX + dir * headR * 0.7, headY + headR * 0.7, headR * 0.22, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(headX + dir * headR * 0.8, headY);
      g.lineTo(headX + dir * headR * 1.7, headY + headR * 0.2);
      g.lineTo(headX + dir * headR * 0.8, headY + headR * 0.4);
      g.closePath();
      g.fill();
    } else {
      // A duck's bill is long and flat.
      g.beginPath();
      g.ellipse(headX + dir * headR * 1.1, headY + headR * 0.25, headR * 0.62, headR * 0.28, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#1f2937';
    g.beginPath();
    g.arc(headX + dir * headR * 0.35, headY - headR * 0.15, headR * 0.15, 0, Math.PI * 2);
    g.fill();
    g.restore();

    if (swimming) {
      // The waterline cuts the body off, with a ripple around it.
      g.fillStyle = '#38bdf8';
      g.beginPath();
      g.ellipse(0, L * 0.18, L * 0.55, L * 0.2, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = L * 0.03;
      g.beginPath();
      g.ellipse(0, L * 0.2, L * 0.62 + Math.sin(clock * 2) * L * 0.05, L * 0.16, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }

  function drawAnimal(g: CanvasRenderingContext2D, a: Animal): void {
    const s = scaleAt(yard, a.y);
    const L = yard.unit * a.species.size * s;
    const hop = a.species.gait === 'hop' && a.goal ? Math.abs(Math.sin(a.phase * Math.PI * 2)) * L * 0.22 : 0;
    const cheer = a.happy > 0 ? Math.abs(Math.sin(clock * 12)) * a.happy * L * 0.14 : 0;
    g.save();
    g.translate(a.x, a.y - hop - cheer);
    if (a.species.legs === 2) drawBird(g, a, L);
    else drawQuadruped(g, a, L);
    g.restore();
  }

  function drawGrains(g: CanvasRenderingContext2D): void {
    const u = yard.unit;
    for (const grain of grains) {
      g.fillStyle = '#fbbf24';
      const y = grain.y - grain.drop * u * 1.2;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + grain.x;
        g.beginPath();
        g.ellipse(grain.x + Math.cos(a) * u * 0.07, y + Math.sin(a) * u * 0.04, u * 0.045, u * 0.03, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function drawEggs(g: CanvasRenderingContext2D): void {
    const u = yard.unit;
    for (const egg of eggs) {
      const s = 0.4 + egg.age * 0.6;
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.beginPath();
      g.ellipse(egg.x, egg.y + u * 0.12, u * 0.16 * s, u * 0.05 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fffbeb';
      g.beginPath();
      g.ellipse(egg.x, egg.y, u * 0.15 * s, u * 0.19 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.ellipse(egg.x - u * 0.05 * s, egg.y - u * 0.06 * s, u * 0.04 * s, u * 0.06 * s, 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }

  function draw(g: CanvasRenderingContext2D): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, yard.w, yard.h);
    drawSky(g);
    drawHills(g);
    drawBarn(g);
    drawGrass(g);
    drawFence(g);
    drawPond(g);
    drawTufts(g);
    drawGrains(g);
    drawEggs(g);
    // Painter's algorithm: whoever stands further back is drawn first.
    for (const a of [...animals].sort((p, q) => p.y - q.y)) drawAnimal(g, a);
  }

  let raf = 0;
  let last = 0;
  function loop(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(MAX_STEP, (now - last) / 1000) : 0.016;
    last = now;
    build();
    if (!c || !yard.w) return;
    step(dt);
    draw(c);
  }

  // ---- the child ----

  function at(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? yard.w / rect.width : 1;
    const sy = rect.height ? yard.h / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function star(x: number, y: number): void {
    const el = h('div', { class: 'farm-star', style: `left:${(x / yard.w) * 100}%;top:${(y / yard.h) * 100}%` }, '⭐');
    root.append(el);
    setTimeout(() => el.remove(), 900);
  }

  async function collect(i: number): Promise<void> {
    eggs.splice(i, 1);
    collected++;
    basket.textContent = `🧺 ${collected}`;
    replay(basket, 'anim-bounce');
    ctx.audio.ding();
    navigator.vibrate?.(15);
    ctx.speak('Quả trứng!');
    if (collected % EGGS_FOR_STAR === 0) {
      await ctx.celebrate();
      if (!alive) return;
      ctx.addStar();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    const p = at(e);
    const eggIndex = eggs.findIndex((egg) => hitsEgg(egg, p.x, p.y, yard));
    if (eggIndex >= 0) {
      void collect(eggIndex);
      return;
    }
    // Nearest first, so a tap between two animals goes to the one under the finger.
    const hit = [...animals].sort((a, b) => b.y - a.y).find((a) => hitsAnimal(a, p.x, p.y, yard));
    if (hit) {
      hit.happy = 1;
      ctx.audio.fx(hit.species.voice);
      ctx.speak(hit.species.name);
      navigator.vibrate?.(10);
      taps++;
      if (taps % TAPS_FOR_STAR === 0) {
        ctx.addStar();
        ctx.audio.jingle();
        star(hit.x, hit.y);
      }
      return;
    }
    ctx.audio.tick();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  feed.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    if (feeding) return;
    feeding = true;
    grains = makeGrain(yard, GRAIN_PER_FEED);
    replay(feed, 'anim-bounce');
    ctx.audio.tick();
    ctx.speak('Cho các bạn ăn nào!');
  });

  ctx.hint.arm(() => {
    replay(feed, 'anim-wiggle');
    const a = animals[Math.floor(Math.random() * animals.length)];
    if (a) a.happy = 0.8;
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
