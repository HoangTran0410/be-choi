import { h, replay } from '../../core/dom';
import { solveTwoBone, type Point } from '../../core/creature';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  Creature,
  FOOD_PER_FEED,
  INTEREST_SECONDS,
  MAX_CREATURES,
  POKE_SECONDS,
  SHAKE_SECONDS,
  SPECIES,
  STAR_EVERY_TAP,
  decorAt,
  makeBubble,
  makeDecor,
  makeFood,
  makePlants,
  makeRocks,
  makeTank,
  plantAt,
  pokeDecor,
  settleScenery,
  sheltersFrom,
  stocking,
  type Bubble,
  type Decor,
  type Food,
  type Interest,
  type Nudge,
  type Plant,
  type Rock,
  type Shelter,
  type Species,
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
  // The net only appears while a fish is in the child's fingers, so it can never
  // be pressed by accident — and a fish can only leave the tank deliberately.
  const net = h('div', { class: 'aquarium-net', 'aria-hidden': 'true' }, '🪣');
  // One button rather than a row of them: a tray of thirteen fish took the whole
  // bottom of the tank, which is where the fish are.
  const add = h('button', { class: 'aquarium-add', type: 'button', 'aria-label': 'thêm cá' }, '🐟');
  const root = h('div', { class: 'aquarium' }, canvas, feed, add, net);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  let alive = true;
  let dpr = 1;
  let tank: Tank = makeTank(1, 1);
  let creatures: Creature[] = [];
  let plants: Plant[] = [];
  let decor: Decor[] = [];
  let rocks: Rock[] = [];
  let sand: number[] = [];
  const bubbles: Bubble[] = [];
  let foods: Food[] = [];
  let nudge: Nudge | null = null;
  let shelters: Shelter[] = [];
  /** Something that was just poked, and is worth a look. */
  let interest: Interest | null = null;
  /** The fish in the child's fingers, and where the finger went down. */
  let held: Creature | null = null;
  let grabFrom: Point | null = null;
  let grabCandidate: Creature | null = null;
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
    decor = makeDecor(tank);
    rocks = makeRocks(tank);
    // The sand line, as a handful of heights the floor is drawn through.
    sand = Array.from({ length: 9 }, (_, i) => tank.floor + Math.sin(i * 1.7) * tank.unit * 0.09);
    creatures = stocking(tank).map((species) => new Creature(species, tank));
    shelters = sheltersFrom(tank, plants, decor);
    bubbles.length = 0;
    foods = [];
    feeding = false;
    held = null;
    grabCandidate = null;
    grabFrom = null;
    root.classList.remove('aquarium-dragging');
    net.classList.remove('aquarium-net-over');
  }

  // ---- choosing a fish to add ----

  /** One little picture per species, drawn once and kept for the picker. */
  const portraits = new Map<string, HTMLCanvasElement>();
  /** The open picker, so leaving the game takes it with us. */
  let closePicker: (() => void) | null = null;

  /**
   * A portrait of one species, drawn with the same code that draws it swimming.
   * The child picks the fish they can see rather than a word they cannot read.
   */
  function portrait(species: Species): HTMLCanvasElement {
    const found = portraits.get(species.id);
    if (found) return found;
    const px = 64;
    const art = h('canvas', { class: 'aquarium-chip-art', width: px * 2, height: px * 2 });
    const cc = art.getContext('2d');
    if (cc) {
      const mini = makeTank(px * 2, px * 2);
      const posed = new Creature(species, mini, () => 0.5, { x: px, y: mini.floor - px * 0.55 });
      posed.heading = 0;
      posed.spine.replant(posed.x, posed.y, 0);
      const keep = tank;
      // The crab stands on the sand, so give it one for the length of the drawing.
      tank = mini;
      // A creature's x is its head, not its middle, and every species is a
      // different size and shape. Fit the whole body to the button instead, so
      // a guppy is as easy to hit as a shark and nothing hangs off the edge.
      const box = bodyBox(posed);
      const zoom = Math.min((px * 1.7) / box.w, (px * 1.7) / box.h);
      cc.setTransform(zoom, 0, 0, zoom, px - box.cx * zoom, px - box.cy * zoom);
      drawCreature(cc, posed, 0);
      cc.setTransform(1, 0, 0, 1, 0, 0);
      tank = keep;
    }
    portraits.set(species.id, art);
    return art;
  }

  /**
   * The picker. Choosing closes it, because the point of choosing a fish is
   * watching it swim in — which cannot be seen from behind a panel.
   */
  function openPicker(): void {
    if (closePicker) return;
    let done = false;
    // The tap that opened this must not also choose from it. Even opening on
    // pointerup, a finger held down over a tile would land on it the moment the
    // panel appeared underneath.
    const opened = Date.now();
    const settled = (): boolean => Date.now() - opened > 250;
    const finish = (species: Species | null): void => {
      if (done) return;
      done = true;
      overlay.remove();
      closePicker = null;
      if (species) addFish(species);
    };
    const tiles = SPECIES.map((species) => {
      const tile = h(
        'button',
        { class: 'pp-tile aquarium-pick', type: 'button', 'aria-label': species.name, 'data-species': species.id },
        portrait(species),
      );
      tile.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (settled()) finish(species);
      });
      return tile;
    });
    const shut = h('button', { class: 'pp-close btn-round', type: 'button', 'aria-label': 'Đóng' }, '✕');
    shut.addEventListener('pointerup', (e) => {
      e.preventDefault();
      if (settled()) finish(null);
    });
    const overlay = h(
      'div',
      { class: 'pp-overlay aquarium-picker' },
      h('div', { class: 'pp-panel' }, h('div', { class: 'pp-grid' }, ...tiles)),
      shut,
    );
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay && settled()) finish(null);
    });
    root.append(overlay);
    closePicker = () => finish(null);
    ctx.audio.tick();
  }

  // Opened on pointerup, not pointerdown: opening on the press means the release
  // of that same tap lands on whichever fish the panel put under the finger.
  add.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    replay(add, 'anim-bounce');
  });
  add.addEventListener('pointerup', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    openPicker();
  });

  /** Where a creature's whole body sits, fins and all, so it can be framed. */
  function bodyBox(cr: Creature): { cx: number; cy: number; w: number; h: number } {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    cr.spine.joints.forEach((joint, i) => {
      // Fins and tentacles reach well past the spine, so pad by the body's width there.
      const pad = Math.max(cr.spine.widthAt(i) * 2.4, cr.length * 0.12);
      left = Math.min(left, joint.x - pad);
      right = Math.max(right, joint.x + pad);
      top = Math.min(top, joint.y - pad);
      bottom = Math.max(bottom, joint.y + pad);
    });
    return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
  }

  /** A new fish swims in from whichever wall is nearer. */
  function addFish(species: Species): void {
    ctx.hint.touch();
    if (creatures.length >= MAX_CREATURES) {
      replay(add, 'anim-shake');
      ctx.audio.boing();
      ctx.speak('Bể đầy cá rồi!');
      return;
    }
    const fromLeft = Math.random() < 0.5;
    const cr = new Creature(species, tank, Math.random, {
      x: fromLeft ? -tank.unit : tank.w + tank.unit,
      y: tank.h * (0.25 + Math.random() * 0.45),
    });
    cr.heading = fromLeft ? 0 : Math.PI;
    cr.spine.replant(cr.x, cr.y, cr.heading);
    cr.joy = 1.4;
    creatures.push(cr);
    ctx.audio.pop(1.3);
    navigator.vibrate?.(10);
    ctx.speak(species.name);
    for (let i = 0; i < 3; i++) bubbles.push(makeBubble(cr.x, cr.y, tank));
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
    // Just brushed: the blades whip about far harder and far faster, then settle.
    // Brushed: a little more wave and a little more hurry. Anything stronger and
    // a tap on a weed reads as the tank being shaken rather than the weed.
    const stirred = plant.shake / SHAKE_SECONDS;
    const amp = tank.unit * 0.28 * (1 + stirred * 0.3);
    const rate = plant.sway * 2 * (1 + stirred * 0.4);
    for (let b = 0; b < plant.blades; b++) {
      const lean = (b - (plant.blades - 1) / 2) * 0.22;
      const base = plant.x + lean * plant.w * 3;
      const tall = plant.h * (0.7 + hash(plant.x, b) * 0.5);
      g.beginPath();
      g.moveTo(base - plant.w, tank.floor + tank.unit * 0.1);
      for (let s = 0; s <= 6; s++) {
        const along = s / 6;
        const wave = Math.sin(clock * rate + plant.phase + b + along * 2.4) * amp * along * along;
        g.lineTo(base + wave - plant.w * (1 - along), tank.floor + tank.unit * 0.1 - tall * along);
      }
      for (let s = 6; s >= 0; s--) {
        const along = s / 6;
        const wave = Math.sin(clock * rate + plant.phase + b + along * 2.4) * amp * along * along;
        g.lineTo(base + wave + plant.w * (1 - along), tank.floor + tank.unit * 0.1 - tall * along);
      }
      g.closePath();
      g.fillStyle = `hsl(${plant.hue} 65% ${28 + b * 6}%)`;
      g.fill();
    }
  }

  // ---- the furniture ----

  /** Where a piece of decor stands: further back sits a little higher up the sand. */
  function decorBase(d: Decor): number {
    const lift = d.layer === 'far' ? -0.3 : d.layer === 'near' ? 0.35 : 0;
    return tank.floor + tank.unit * (0.14 + lift);
  }

  function drawBoulder(g: CanvasRenderingContext2D, d: Decor, base: number): void {
    const r = d.size * tank.unit * 0.5;
    const shade = (d.layer === 'near' ? 58 : 96) + d.hue * 40;
    g.fillStyle = `rgb(${shade},${shade + 10},${shade + 22})`;
    g.beginPath();
    g.moveTo(d.x - r * 1.15, base);
    g.bezierCurveTo(d.x - r * 1.2, base - r * 0.9, d.x - r * 0.5, base - r * 1.35, d.x, base - r * 1.25);
    g.bezierCurveTo(d.x + r * 0.65, base - r * 1.4, d.x + r * 1.2, base - r * 0.8, d.x + r * 1.1, base);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    g.ellipse(d.x - r * 0.35, base - r * 0.85, r * 0.4, r * 0.22, -0.4, 0, Math.PI * 2);
    g.fill();
  }

  /** The ornament every fish tank has: a little stone castle to swim round. */
  function drawCastle(g: CanvasRenderingContext2D, d: Decor, base: number): void {
    const u = d.size * tank.unit;
    const stone = '#cbd5e1';
    const shade = '#94a3b8';
    const roof = `hsl(${330 + d.hue * 40} 70% 66%)`;
    const tower = (x: number, w: number, hgt: number): void => {
      g.fillStyle = stone;
      g.fillRect(x - w / 2, base - hgt, w, hgt);
      g.fillStyle = shade;
      g.fillRect(x - w / 2, base - hgt, w * 0.3, hgt);
      g.fillStyle = roof;
      g.beginPath();
      g.moveTo(x - w * 0.72, base - hgt);
      g.lineTo(x, base - hgt - w * 0.85);
      g.lineTo(x + w * 0.72, base - hgt);
      g.closePath();
      g.fill();
      g.fillStyle = '#334155';
      g.beginPath();
      g.arc(x, base - hgt * 0.72, w * 0.16, 0, Math.PI * 2);
      g.fill();
    };
    // Curtain wall with battlements.
    g.fillStyle = stone;
    g.fillRect(d.x - u * 0.42, base - u * 0.62, u * 0.84, u * 0.62);
    for (let i = 0; i < 4; i++) {
      g.fillRect(d.x - u * 0.42 + i * u * 0.24, base - u * 0.74, u * 0.13, u * 0.14);
    }
    g.fillStyle = '#334155';
    g.beginPath();
    g.moveTo(d.x - u * 0.13, base);
    g.lineTo(d.x - u * 0.13, base - u * 0.28);
    g.quadraticCurveTo(d.x, base - u * 0.5, d.x + u * 0.13, base - u * 0.28);
    g.lineTo(d.x + u * 0.13, base);
    g.closePath();
    g.fill();
    tower(d.x - u * 0.5, u * 0.3, u * 0.95);
    tower(d.x + u * 0.5, u * 0.3, u * 0.78);
    tower(d.x, u * 0.34, u * 1.25);
  }

  /** A rock arch: the hiding place, and something to swim through. */
  function drawArch(g: CanvasRenderingContext2D, d: Decor, base: number): void {
    const u = d.size * tank.unit;
    const w = u * 0.72;
    const hgt = u * 1.15;
    const leg = u * 0.26;
    const shade = 104 + d.hue * 30;
    g.fillStyle = `rgb(${shade},${shade + 12},${shade + 20})`;
    g.beginPath();
    g.moveTo(d.x - w, base);
    g.lineTo(d.x - w, base - hgt * 0.5);
    g.quadraticCurveTo(d.x, base - hgt * 1.5, d.x + w, base - hgt * 0.5);
    g.lineTo(d.x + w, base);
    g.lineTo(d.x + w - leg, base);
    g.lineTo(d.x + w - leg, base - hgt * 0.45);
    g.quadraticCurveTo(d.x, base - hgt * 1.02, d.x - w + leg, base - hgt * 0.45);
    g.lineTo(d.x - w + leg, base);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(d.x - w, base - hgt * 0.45, leg * 0.4, hgt * 0.45);
  }

  /** Treasure, breathing bubbles as its lid creaks. */
  function drawChest(g: CanvasRenderingContext2D, d: Decor, base: number): void {
    const u = d.size * tank.unit;
    // The lid is where the child left it, breathing a little rather than flapping.
    const rest = d.open ? 1.15 : 0.12;
    const open = rest + Math.sin(clock * 0.7 + d.phase) * 0.06;
    g.fillStyle = '#92400e';
    g.fillRect(d.x - u * 0.5, base - u * 0.5, u, u * 0.5);
    g.fillStyle = '#fcd34d';
    g.fillRect(d.x - u * 0.5, base - u * 0.3, u, u * 0.08);
    g.fillRect(d.x - u * 0.08, base - u * 0.5, u * 0.16, u * 0.5);
    g.save();
    g.translate(d.x - u * 0.5, base - u * 0.5);
    g.rotate(-open);
    g.fillStyle = '#b45309';
    g.beginPath();
    g.ellipse(u * 0.5, 0, u * 0.5, u * 0.3, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#fcd34d';
    g.fillRect(u * 0.42, -u * 0.28, u * 0.16, u * 0.28);
    g.restore();
    // An open chest lets its treasure breathe.
    if (Math.random() < (d.open ? 0.14 : 0.02) && bubbles.length < MAX_BUBBLES) {
      bubbles.push(makeBubble(d.x, base - u * 0.55, tank));
    }
  }

  /** A hoop on a stand: fish swim through it whether they mean to or not. */
  function drawHoop(g: CanvasRenderingContext2D, d: Decor, base: number): void {
    const r = d.size * tank.unit * 0.42;
    g.fillStyle = '#e2e8f0';
    g.fillRect(d.x - r * 0.35, base - r * 0.45, r * 0.7, r * 0.45);
    g.strokeStyle = `hsl(${d.hue * 360} 85% 62%)`;
    g.lineWidth = r * 0.2;
    g.beginPath();
    g.arc(d.x, base - r * 1.45, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = r * 0.07;
    g.beginPath();
    g.arc(d.x, base - r * 1.45, r, Math.PI * 1.1, Math.PI * 1.6);
    g.stroke();
  }

  function drawAnemone(g: CanvasRenderingContext2D, d: Decor, base: number): void {
    const u = d.size * tank.unit;
    // Touched, it pulls its tentacles in — the one ornament that shrinks from a finger.
    const shy = d.poke / POKE_SECONDS;
    g.strokeStyle = `hsl(${300 + d.hue * 70} 78% 70%)`;
    g.lineWidth = u * 0.16 * (1 + shy * 0.4);
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const lean = (i / 8 - 0.5) * 1.4 * (1 - shy * 0.75);
      g.beginPath();
      g.moveTo(d.x, base);
      for (let sgmt = 1; sgmt <= 3; sgmt++) {
        const along = sgmt / 3;
        const wave = Math.sin(clock * 1.6 + d.phase + i) * u * 0.22 * along * (1 - shy);
        g.lineTo(d.x + lean * u * 0.55 * along + wave, base - u * 0.95 * along * (1 - shy * 0.7));
      }
      g.stroke();
    }
    g.fillStyle = `hsl(${300 + d.hue * 70} 60% 55%)`;
    g.beginPath();
    g.ellipse(d.x, base, u * 0.42, u * 0.2, 0, Math.PI, Math.PI * 2);
    g.fill();
  }

  /** The dark clump right against the glass. */
  function drawWeed(g: CanvasRenderingContext2D, d: Decor, base: number): void {
    const u = d.size * tank.unit;
    for (let i = 0; i < 7; i++) {
      const lean = (i / 6 - 0.5) * 1.6;
      const tall = u * (0.6 + ((i * 37) % 10) / 22);
      g.fillStyle = `hsl(${140 + d.hue * 30} 55% ${13 + i}%)`;
      g.beginPath();
      g.moveTo(d.x + lean * u * 0.2 - u * 0.09, base);
      for (const dir of [1, -1]) {
        for (let s = dir > 0 ? 0 : 5; dir > 0 ? s <= 5 : s >= 0; s += dir) {
          const along = s / 5;
          const wave = Math.sin(clock * 0.9 + d.phase + i + along * 2) * u * 0.16 * along * along;
          g.lineTo(d.x + lean * u * 0.2 + wave + dir * u * 0.09 * (1 - along), base - tall * along);
        }
      }
      g.closePath();
      g.fill();
    }
  }

  function drawDecor(g: CanvasRenderingContext2D, d: Decor): void {
    const base = decorBase(d);
    // A poked ornament rocks on its base for a moment, so a tap always lands
    // somewhere visible even on the things that cannot open or curl.
    if (d.poke > 0) {
      g.save();
      g.translate(d.x, base);
      g.rotate(Math.sin(d.poke * 30) * 0.06 * d.poke);
      g.translate(-d.x, -base);
      drawDecorBody(g, d, base);
      g.restore();
      return;
    }
    drawDecorBody(g, d, base);
  }

  function drawDecorBody(g: CanvasRenderingContext2D, d: Decor, base: number): void {
    switch (d.kind) {
      case 'boulder':
        return drawBoulder(g, d, base);
      case 'castle':
        return drawCastle(g, d, base);
      case 'arch':
        return drawArch(g, d, base);
      case 'chest':
        return drawChest(g, d, base);
      case 'hoop':
        return drawHoop(g, d, base);
      case 'anemone':
        return drawAnemone(g, d, base);
      case 'weed':
        return drawWeed(g, d, base);
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
    const bodyY = cr.y - len * 0.12;
    // Held up in the child's fingers there is no sand to stand on, so the legs
    // dangle from the body instead of stretching down to where the floor is.
    const ground = cr.held ? cr.y + len * 0.34 : tank.floor;
    // Long enough bones that the knee has somewhere to lift to: a crab's legs are
    // read from the peak above the body, not from the foot.
    const upper = len * 0.42;
    const lower = len * 0.42;
    g.strokeStyle = '#7f1d1d';
    g.lineWidth = Math.max(2.5, len * 0.07);
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
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
      g.rotate(Math.sin(clock * 22) * 0.16);
      g.translate(-cr.x, -cr.y);
      g.shadowColor = 'rgba(3,32,54,0.45)';
      g.shadowBlur = cr.length * 0.35;
    }
    if (cr.species.kind === 'jelly') drawJelly(g, cr);
    else if (cr.species.kind === 'ray') drawRay(g, cr, index);
    else if (cr.species.kind === 'crab') drawCrab(g, cr);
    else drawFish(g, cr, index);
    g.restore();
    drawMood(g, cr);
  }

  /**
   * What the fish is feeling, above its head, for a child who cannot read. Only
   * hunger and delight are shown: fright already reads perfectly well from a fish
   * bolting into the weeds.
   */
  function drawMood(g: CanvasRenderingContext2D, cr: Creature): void {
    const mood = cr.mood;
    if (cr.held || (mood !== 'hungry' && mood !== 'excited')) return;
    const size = Math.max(tank.unit * 0.34, 15);
    const bob = Math.sin(clock * 3 + cr.x * 0.01) * size * 0.12;
    g.save();
    g.globalAlpha = mood === 'hungry' ? 0.55 + 0.35 * Math.sin(clock * 2.2) : 0.9;
    g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(mood === 'hungry' ? '🍤' : '✨', cr.x, cr.y - cr.length * 0.55 + bob);
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

  /** Light through the whole body of water. */
  function drawCaustics(g: CanvasRenderingContext2D): void {
    if (!tileCtx) return;
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.12;
    tileCaustics(g, tank.unit * 3.4, clock * 16, Math.sin(clock * 0.3) * tank.unit, 0, tank.h);
    g.restore();
  }

  /**
   * The bright pass on the sand. It rides with the sand's own layer, or the band
   * lands above the floor and reads as a strip of haze across the tank.
   */
  function drawSandCaustics(g: CanvasRenderingContext2D): void {
    if (!tileCtx) return;
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.45;
    g.beginPath();
    g.rect(0, tank.floor + tank.unit * 0.08, tank.w, tank.h - tank.floor);
    g.clip();
    tileCaustics(g, tank.unit * 2.2, clock * -10, 0, tank.floor, tank.h);
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
    settleScenery(plants, decor, dt);
    if (interest) {
      interest.life -= dt;
      if (interest.life <= 0) interest = null;
    }
    const world = { foods, nudge, shelters, interest };
    for (const cr of creatures) {
      if (cr.update(dt, tank, world)) {
        ctx.audio.pop(1.4);
        for (let i = 0; i < 2; i++) bubbles.push(makeBubble(cr.x, cr.y, tank));
      }
      // A fish brushing past a weed sets it waving, which is what makes the
      // planting feel like part of the water rather than wallpaper.
      if (cr.y > tank.floor - tank.unit * 2.2) {
        const brushed = plantAt(plants, cr.x, cr.y, tank);
        if (brushed) brushed.shake = Math.max(brushed.shake, SHAKE_SECONDS * 0.45);
      }
      // A hungry fish lets out a small bubble now and then: the tank asking to be fed.
      if (cr.mood === 'hungry' && Math.random() < dt * 0.5 && bubbles.length < MAX_BUBBLES) {
        bubbles.push(makeBubble(cr.x, cr.y - cr.length * 0.2, tank));
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

  /**
   * Depth here is drawing order and haze, not motion. Sliding the layers against
   * each other did read as depth, but with a fixed tank there is nothing for the
   * camera to be moving *for*, and the nudge it took from the finger made the
   * whole scene twitch. Ordering alone carries it.
   */
  function draw(g: CanvasRenderingContext2D): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWater(g);
    drawRays(g);
    for (const d of decor) if (d.layer === 'far') drawDecor(g, d);
    // Distance haze: everything above this line reads as further away, which is
    // what stops the castle from looking like it stands among the fish.
    g.fillStyle = 'rgba(13,110,140,0.24)';
    g.fillRect(0, 0, tank.w, tank.h);
    drawSand(g);
    drawSandCaustics(g);
    // Every plant goes behind the animals: a weed in front of a fish for no reason
    // reads as a mistake. What belongs in front is the near layer, in the corners.
    for (const plant of plants) drawPlant(g, plant);
    for (const d of decor) if (d.layer === 'mid') drawDecor(g, d);
    drawFood(g);
    // The fish in the child's hand is drawn last, so it is never lost behind another.
    creatures.forEach((cr, i) => {
      if (!cr.held) drawCreature(g, cr, i);
    });
    drawBubbles(g);
    for (const d of decor) if (d.layer === 'near') drawDecor(g, d);
    creatures.forEach((cr, i) => {
      if (cr.held) drawCreature(g, cr, i);
    });
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

  /** How far a finger must travel before a tap on a fish becomes a grab. */
  const GRAB_SLOP = 14;

  /** Is the finger over the net in the corner? */
  function overNet(e: PointerEvent): boolean {
    const r = net.getBoundingClientRect();
    const pad = r.width * 0.35;
    return e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
  }

  /** Everything a poke does, wherever it lands. */
  function poke(p: Point): void {
    const d = decorAt(decor, p.x, p.y, tank);
    if (d) {
      pokeDecor(d);
      interest = { x: d.x, y: tank.floor - d.size * tank.unit * 0.5, life: INTEREST_SECONDS };
      ctx.audio.pop(d.kind === 'chest' ? 1.6 : 0.9);
      navigator.vibrate?.(10);
      const n = d.kind === 'chest' ? 7 : 4;
      for (let i = 0; i < n; i++) {
        bubbles.push(makeBubble(d.x + (Math.random() - 0.5) * d.size * tank.unit, tank.floor - d.size * tank.unit * 0.6, tank));
      }
      // A hoop is an invitation: the nearest fish is sent through it.
      if (d.kind === 'hoop') {
        const guest = nearestTo(d.x, tank.floor - d.size * tank.unit * 0.6);
        if (guest) guest.joy = 2;
      }
      return;
    }
    const plant = plantAt(plants, p.x, p.y, tank);
    if (plant) {
      plant.shake = SHAKE_SECONDS;
      interest = { x: plant.x, y: tank.floor - plant.h * 0.6, life: INTEREST_SECONDS };
      ctx.audio.tick();
      for (let i = 0; i < 3; i++) bubbles.push(makeBubble(plant.x, tank.floor - plant.h * Math.random(), tank));
      return;
    }
    if (p.y > tank.floor - tank.unit * 0.3) {
      // The sand: a puff, and every plant near the hand waves.
      ctx.audio.puff();
      for (const near of plants) if (Math.abs(near.x - p.x) < tank.unit * 1.4) near.shake = SHAKE_SECONDS * 0.6;
      for (let i = 0; i < 5; i++) bubbles.push(makeBubble(p.x + (Math.random() - 0.5) * tank.unit, tank.floor, tank));
      return;
    }
    ctx.audio.tick();
    for (let i = 0; i < 3; i++) bubbles.push(makeBubble(p.x, p.y, tank));
  }

  function nearestTo(x: number, y: number): Creature | null {
    let best: Creature | null = null;
    let bestAway = Infinity;
    for (const cr of creatures) {
      const away = Math.hypot(cr.x - x, cr.y - y);
      if (away < bestAway) {
        bestAway = away;
        best = cr;
      }
    }
    return best;
  }

  /** Lift a fish out of the water into the child's fingers. */
  function grab(cr: Creature, p: Point): void {
    held = cr;
    cr.hold(p.x, p.y);
    root.classList.add('aquarium-dragging');
    ctx.audio.pop(1.7);
    navigator.vibrate?.(14);
    // Everybody else saw that. Nothing frightens a fish like a neighbour vanishing upwards.
    for (const other of creatures) {
      // Only the neighbours who really saw it. Frightening half the tank at once
      // empties the water and leaves the child holding a fish in a dead room.
      if (other !== cr && Math.hypot(other.x - cr.x, other.y - cr.y) < tank.unit * 2) other.startle(cr.x, cr.y, true);
    }
    for (let i = 0; i < 5; i++) bubbles.push(makeBubble(cr.x, cr.y, tank));
  }

  /** Scooped out of the tank for good. */
  function scoop(cr: Creature): void {
    creatures = creatures.filter((other) => other !== cr);
    ctx.audio.puff();
    navigator.vibrate?.(20);
    ctx.speak('Tạm biệt!');
    replay(net, 'anim-bounce');
    for (let i = 0; i < 6; i++) bubbles.push(makeBubble(cr.x, cr.y, tank));
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = at(e);
    nudge = { x: p.x, y: p.y, held: true };
    grabFrom = p;
    grabCandidate = creatures.find((cr) => cr.hits(p.x, p.y)) ?? null;
    if (!grabCandidate) poke(p);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!nudge?.held) return;
    const p = at(e);
    nudge.x = p.x;
    nudge.y = p.y;

    // A press that travels turns into a grab; a press that stays put is a hello.
    if (!held && grabCandidate && grabFrom && Math.hypot(p.x - grabFrom.x, p.y - grabFrom.y) > GRAB_SLOP) {
      grab(grabCandidate, p);
    }
    if (held) {
      held.hold(p.x, p.y);
      net.classList.toggle('aquarium-net-over', overNet(e));
      if (Math.random() < 0.4 && bubbles.length < MAX_BUBBLES) bubbles.push(makeBubble(p.x, p.y, tank));
      return;
    }
    // A finger dragged through the weeds sets them waving.
    const brushed = plantAt(plants, p.x, p.y, tank);
    if (brushed) brushed.shake = Math.max(brushed.shake, SHAKE_SECONDS * 0.7);
    if (Math.random() < 0.25 && bubbles.length < MAX_BUBBLES) bubbles.push(makeBubble(p.x, p.y, tank));
  });

  const release = (e?: PointerEvent): void => {
    if (held) {
      if (e && overNet(e)) scoop(held);
      else held.release();
      held = null;
      root.classList.remove('aquarium-dragging');
      net.classList.remove('aquarium-net-over');
    } else if (grabCandidate && grabFrom) {
      // Never moved: that was a hello, not a lift.
      greet(grabCandidate, grabFrom);
    }
    grabCandidate = null;
    grabFrom = null;
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
    // Point at whatever the tank needs: food when they are hungry, a new friend otherwise.
    const starving = creatures.filter((cr) => cr.mood === 'hungry').length;
    replay(starving > creatures.length / 3 ? feed : add, 'anim-wiggle');
    const cr = creatures[Math.floor(Math.random() * creatures.length)];
    if (cr) cr.joy = 0.8;
  });

  const onResize = (): void => {
    // Force a rebuild on the next frame.
    canvas.width = 0;
  };
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    closePicker?.();
    window.removeEventListener('resize', onResize);
    if (raf) cancelAnimationFrame(raf);
  });

  build();
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
}

const game: GameModule = { ...meta, start };
export default game;
