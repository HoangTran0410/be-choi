import { h, replay } from '../../core/dom';
import { voiceOf } from '../../core/content';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  DELIVERIES_FOR_STAR,
  LIGHT_STOP_UNITS,
  RED_MS,
  VEHICLES,
  homeSlot,
  makeCar,
  makeRoad,
  propsIn,
  reached,
  riderAt,
  roadTilt,
  roadY,
  stepCar,
  type Car,
  type Prop,
  type Road,
  type Vehicle,
} from './logic';
import './style.css';

/** Longest frame the drive will take in one step. */
const MAX_STEP = 0.05;
/** The car sits this far across the screen, so there is road to see ahead. */
const CAMERA_AT = 0.34;
/** How fast the camera catches up with the car. */
const CAMERA_LAG = 6;
const PUDDLE_SPLASH_MS = 500;
const DROP_WAVE_MS = 1400;

interface Splash {
  x: number;
  y: number;
  life: number;
}

/** A light the car has already sat at: when it went red, and whether it is green yet. */
interface Light {
  redAt: number;
  green: boolean;
}

/** A rounded box, falling back to a square one where `roundRect` is missing. */
function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, hgt: number, r: number): void {
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(x, y, w, hgt, r);
  else g.rect(x, y, w, hgt);
}

/**
 * Bé lái xe: put a finger where the car should go and it drives there — the road,
 * the hills and the houses scroll past, the wheels turn with the distance covered
 * and the body leans into every slope.
 *
 * There is always somebody waiting a little way ahead. Stop next to them and they
 * climb in; their house is three lamp-posts further on. Traffic lights go red as
 * you come up to them and green again after a moment, which is most of the fun.
 */
function start(ctx: GameContext): void {
  const canvas = h('canvas', { class: 'drive-canvas' });
  const horn = h('button', { class: 'drive-horn', type: 'button', 'aria-label': 'bấm còi' }, '📢');
  const badge = h('div', { class: 'drive-badge', hidden: true });
  const tray = h('div', { class: 'g-tray drive-tray' });
  const root = h('div', { class: 'drive' }, h('div', { class: 'drive-view' }, canvas, horn, badge), tray);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  let alive = true;
  let dpr = 1;
  let road: Road = makeRoad(1, 1);
  let car: Car = makeCar(road);
  let vehicle: Vehicle = VEHICLES[0]!;
  let camX = 0;
  let clock = 0;
  /**
   * Where the finger is, measured across the canvas rather than along the road:
   * the world scrolls under a finger that stays put, so a held finger keeps
   * driving instead of stopping at the spot it first touched.
   */
  let hold: number | null = null;
  /** A world x the hint is coaxing the car towards, ignored once it is reached. */
  let nudge = 0;
  /** The passenger on board, if any. */
  let ride: { slot: number; home: number; emoji: string; name: string } | null = null;
  /** Stops already served, so a house is not paid twice. */
  const served = new Set<number>();
  const lights = new Map<number, Light>();
  const splashes: Splash[] = [];
  const wet = new Set<number>();
  let deliveries = 0;
  let waved = 0;

  // ---- the road ----

  function build(): void {
    const view = canvas.parentElement;
    const w = view?.clientWidth ?? 0;
    const hgt = view?.clientHeight ?? 0;
    if (!w || !hgt) return;
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width === Math.round(w * nextDpr) && canvas.height === Math.round(hgt * nextDpr)) return;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    const before = road.unit ? car.x / road.unit : 2;
    road = makeRoad(w, hgt);
    car.x = before * road.unit;
    camX = car.x - w * CAMERA_AT;
  }

  // ---- steering ----

  /** The red light the car must wait at, or null when the way is clear. */
  function stopLine(): number | null {
    for (const prop of propsIn(road, car.x - road.unit, car.x + road.unit * 6)) {
      if (prop.kind !== 'light' || prop.x < car.x - road.unit * 0.2) continue;
      let light = lights.get(prop.slot);
      if (!light) {
        if (prop.x - car.x > road.unit * 3) continue;
        light = { redAt: clock, green: false };
        lights.set(prop.slot, light);
        ctx.audio.tick();
        ctx.speak('Đèn đỏ, dừng lại nào!');
      }
      if (light.green) continue;
      if (clock - light.redAt >= RED_MS / 1000) {
        light.green = true;
        ctx.audio.pop(1.3);
        ctx.speak('Đèn xanh, đi thôi!');
        continue;
      }
      return prop.x - road.unit * LIGHT_STOP_UNITS;
    }
    return null;
  }

  function pickUp(prop: Prop): void {
    const rider = riderAt(prop.slot);
    ride = { slot: prop.slot, home: homeSlot(prop.slot), emoji: rider.emoji, name: rider.name };
    badge.textContent = rider.emoji;
    badge.hidden = false;
    replay(badge, 'anim-bounce');
    ctx.audio.pop(1.2);
    ctx.audio.fx(voiceOf(rider));
    ctx.speak(`Chở ${rider.name} về nhà nhé!`);
    navigator.vibrate?.(12);
  }

  async function dropOff(): Promise<void> {
    const rider = ride;
    if (!rider) return;
    served.add(rider.slot);
    ride = null;
    badge.hidden = true;
    waved = clock;
    deliveries++;
    ctx.audio.ding();
    ctx.speak(`${rider.name} về tới nhà rồi!`);
    navigator.vibrate?.(20);
    if (deliveries % DELIVERIES_FOR_STAR === 0) {
      await ctx.celebrate();
      if (!alive) return;
      ctx.addStar();
    }
  }

  function errands(): void {
    for (const prop of propsIn(road, car.x - road.unit * 2, car.x + road.unit * 2)) {
      if (!reached(car, prop.x, road)) continue;
      if (!ride && prop.kind === 'stop' && !served.has(prop.slot)) pickUp(prop);
      if (ride && prop.kind === 'house' && prop.slot === ride.home) void dropOff();
      if (prop.kind === 'puddle' && !wet.has(prop.slot) && Math.abs(car.v) > road.unit) {
        wet.add(prop.slot);
        splashes.push({ x: prop.x, y: roadY(road, prop.x), life: 1 });
        ctx.audio.puff();
      }
    }
  }

  function step(dt: number): void {
    clock += dt;
    const target = hold !== null ? camX + hold : Math.max(car.x, nudge);
    stepCar(car, target, dt, road, vehicle, stopLine());
    camX += (car.x - road.w * CAMERA_AT - camX) * Math.min(1, dt * CAMERA_LAG);
    errands();
    for (const s of splashes) s.life -= dt / (PUDDLE_SPLASH_MS / 1000);
    while (splashes.length && (splashes[0]?.life ?? 0) <= 0) splashes.shift();
  }

  // ---- drawing ----

  /** World x → screen x. */
  const sx = (x: number): number => x - camX;

  function drawSky(g: CanvasRenderingContext2D): void {
    const sky = g.createLinearGradient(0, 0, 0, road.h);
    sky.addColorStop(0, '#7dd3fc');
    sky.addColorStop(0.6, '#bae6fd');
    sky.addColorStop(1, '#e0f2fe');
    g.fillStyle = sky;
    g.fillRect(0, 0, road.w, road.h);
    g.fillStyle = '#fef9c3';
    g.beginPath();
    g.arc(road.w * 0.82, road.h * 0.14, road.unit * 0.55, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fde68a';
    g.beginPath();
    g.arc(road.w * 0.82, road.h * 0.14, road.unit * 0.4, 0, Math.PI * 2);
    g.fill();
  }

  function cloud(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.arc(x + r * 0.9, y - r * 0.35, r * 0.75, 0, Math.PI * 2);
    g.arc(x + r * 1.7, y, r * 0.6, 0, Math.PI * 2);
    g.arc(x + r * 0.85, y + r * 0.3, r * 0.8, 0, Math.PI * 2);
    g.fill();
  }

  function drawClouds(g: CanvasRenderingContext2D): void {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    const span = road.unit * 5;
    const shift = camX * 0.12;
    const first = Math.floor((shift - span) / span);
    for (let i = first; i < first + Math.ceil(road.w / span) + 3; i++) {
      const wobble = Math.sin(i * 2.7) * 0.5 + 0.5;
      const drift = Math.sin(i * 5.1) * 0.5 + 0.5;
      cloud(g, i * span - shift, road.h * (0.05 + wobble * 0.3), road.unit * (0.26 + drift * 0.22));
    }
  }

  /** Rolling hills behind the road: two rows, the far one paler and slower. */
  function drawHills(g: CanvasRenderingContext2D, depth: number, colour: string, lift: number): void {
    const shift = camX * depth;
    const base = road.ground + road.unit * 0.1;
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(0, road.h);
    for (let x = 0; x <= road.w; x += 12) {
      const wx = (x + shift) / (road.unit * 6);
      const y = base - lift * road.unit * (1.1 + Math.sin(wx) * 0.45 + Math.sin(wx * 2.3 + 1.2) * 0.2);
      g.lineTo(x, y);
    }
    g.lineTo(road.w, road.h);
    g.closePath();
    g.fill();
  }

  function drawGround(g: CanvasRenderingContext2D): void {
    // Grass verge first: it follows the tarmac so the road never floats.
    g.fillStyle = '#86efac';
    g.beginPath();
    g.moveTo(0, road.h);
    for (let x = 0; x <= road.w; x += 8) g.lineTo(x, roadY(road, camX + x) - road.unit * 0.06);
    g.lineTo(road.w, road.h);
    g.closePath();
    g.fill();
  }

  function drawRoad(g: CanvasRenderingContext2D): void {
    const thickness = road.unit * 0.62;
    g.fillStyle = '#57534e';
    g.beginPath();
    for (let x = 0; x <= road.w; x += 8) g.lineTo(x, roadY(road, camX + x));
    for (let x = road.w; x >= 0; x -= 8) g.lineTo(x, roadY(road, camX + x) + thickness);
    g.closePath();
    g.fill();
    // Kerb line along the top edge.
    g.strokeStyle = '#e7e5e4';
    g.lineWidth = Math.max(1, road.unit * 0.035);
    g.beginPath();
    for (let x = 0; x <= road.w; x += 8) g.lineTo(x, roadY(road, camX + x) + road.unit * 0.07);
    g.stroke();
    // Dashes down the middle, at fixed world positions so they scroll with the road.
    const gap = road.unit * 1.1;
    const first = Math.floor(camX / gap) - 1;
    g.strokeStyle = '#fde047';
    g.lineWidth = Math.max(2, road.unit * 0.05);
    g.lineCap = 'round';
    for (let i = first; i < first + Math.ceil(road.w / gap) + 3; i++) {
      const wx = i * gap;
      const y = roadY(road, wx) + thickness * 0.6;
      g.beginPath();
      g.moveTo(sx(wx) - gap * 0.16, y);
      g.lineTo(sx(wx) + gap * 0.16, y + Math.sin(wx / road.unit) * road.unit * 0.02);
      g.stroke();
    }
    g.lineCap = 'butt';
  }

  function drawTree(g: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
    const u = road.unit * (1.25 + seed * 0.6);
    g.fillStyle = '#78350f';
    g.fillRect(x - u * 0.07, y - u * 0.9, u * 0.14, u * 0.9);
    const sway = Math.sin(clock * 1.1 + seed * 6) * u * 0.03;
    g.fillStyle = seed > 0.5 ? '#16a34a' : '#22c55e';
    g.beginPath();
    g.arc(x + sway, y - u * 1.05, u * 0.4, 0, Math.PI * 2);
    g.arc(x + sway - u * 0.28, y - u * 0.82, u * 0.28, 0, Math.PI * 2);
    g.arc(x + sway + u * 0.28, y - u * 0.85, u * 0.3, 0, Math.PI * 2);
    g.fill();
  }

  function drawBush(g: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
    const u = road.unit * (0.4 + seed * 0.2);
    g.fillStyle = '#4ade80';
    g.beginPath();
    g.arc(x, y - u * 0.4, u * 0.45, 0, Math.PI * 2);
    g.arc(x - u * 0.4, y - u * 0.25, u * 0.34, 0, Math.PI * 2);
    g.arc(x + u * 0.42, y - u * 0.28, u * 0.36, 0, Math.PI * 2);
    g.fill();
    if (seed > 0.6) {
      g.fillStyle = '#fda4af';
      g.beginPath();
      g.arc(x - u * 0.1, y - u * 0.66, u * 0.09, 0, Math.PI * 2);
      g.arc(x + u * 0.3, y - u * 0.5, u * 0.08, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawHouse(g: CanvasRenderingContext2D, prop: Prop, x: number, y: number): void {
    const u = road.unit * (1.35 + prop.seed * 0.3);
    const wall = ['#fef3c7', '#fce7f3', '#dbeafe', '#e0e7ff'][prop.slot % 4] ?? '#fef3c7';
    const roofColour = ['#dc2626', '#7c3aed', '#0891b2', '#ea580c'][prop.slot % 4] ?? '#dc2626';
    g.fillStyle = wall;
    g.fillRect(x - u * 0.5, y - u * 0.9, u, u * 0.9);
    g.fillStyle = roofColour;
    g.beginPath();
    g.moveTo(x - u * 0.62, y - u * 0.88);
    g.lineTo(x, y - u * 1.35);
    g.lineTo(x + u * 0.62, y - u * 0.88);
    g.closePath();
    g.fill();
    g.fillStyle = '#92400e';
    g.fillRect(x - u * 0.13, y - u * 0.45, u * 0.26, u * 0.45);
    g.fillStyle = '#bae6fd';
    g.fillRect(x + u * 0.16, y - u * 0.74, u * 0.24, u * 0.24);
    g.fillStyle = '#fbbf24';
    g.beginPath();
    g.arc(x + u * 0.06, y - u * 0.24, u * 0.03, 0, Math.PI * 2);
    g.fill();
    // The house the passenger on board is going to gets their face over the door.
    if (ride && prop.slot === ride.home) {
      const bob = Math.sin(clock * 4) * road.unit * 0.06;
      g.font = `${road.unit * 0.5}px system-ui`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ride.emoji, x, y - u * 1.6 + bob);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.arc(x, y - u * 1.6 + bob, road.unit * 0.34, 0, Math.PI * 2);
      g.fill();
      g.fillText(ride.emoji, x, y - u * 1.6 + bob);
    }
    // Somebody just went in: a wave from the doorway.
    if (clock - waved < DROP_WAVE_MS / 1000 && Math.abs(prop.x - car.x) < road.unit * 2.5) {
      g.font = `${road.unit * 0.34}px system-ui`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('👋', x + u * 0.35, y - u * 0.5 + Math.sin(clock * 12) * road.unit * 0.05);
    }
  }

  function drawStop(g: CanvasRenderingContext2D, prop: Prop, x: number, y: number): void {
    const u = road.unit;
    const taken = served.has(prop.slot) || ride?.slot === prop.slot;
    g.fillStyle = '#94a3b8';
    g.fillRect(x - u * 0.03, y - u * 1.1, u * 0.06, u * 1.1);
    g.fillStyle = '#0ea5e9';
    box(g, x - u * 0.26, y - u * 1.45, u * 0.52, u * 0.4, u * 0.08);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `${u * 0.24}px system-ui`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🚏', x, y - u * 1.25);
    if (taken) return;
    // Whoever is waiting hops on the spot until the car pulls up.
    const rider = riderAt(prop.slot);
    const near = Math.abs(prop.x - car.x) < u * 3;
    const hop = near ? Math.abs(Math.sin(clock * 5 + prop.slot)) * u * 0.14 : 0;
    g.font = `${u * 0.62}px system-ui`;
    g.fillText(rider.emoji, x + u * 0.45, y - u * 0.32 - hop);
  }

  function drawLight(g: CanvasRenderingContext2D, prop: Prop, x: number, y: number): void {
    const u = road.unit;
    const state = lights.get(prop.slot);
    const green = !state || state.green;
    g.fillStyle = '#475569';
    g.fillRect(x - u * 0.04, y - u * 1.5, u * 0.08, u * 1.5);
    g.fillStyle = '#334155';
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

  function drawPuddle(g: CanvasRenderingContext2D, x: number, y: number, seed: number): void {
    const u = road.unit * (0.5 + seed * 0.3);
    g.fillStyle = 'rgba(56,189,248,0.55)';
    g.beginPath();
    g.ellipse(x, y + road.unit * 0.34, u * 0.6, u * 0.13, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(x - u * 0.15, y + road.unit * 0.32, u * 0.16, u * 0.04, 0, 0, Math.PI * 2);
    g.fill();
  }

  function drawProps(g: CanvasRenderingContext2D, tarmac: boolean): void {
    for (const prop of propsIn(road, camX - road.unit * 3, camX + road.w + road.unit * 3)) {
      const x = sx(prop.x);
      const y = roadY(road, prop.x);
      if (tarmac) {
        if (prop.kind === 'puddle') drawPuddle(g, x, y, prop.seed);
        continue;
      }
      if (prop.kind === 'tree') drawTree(g, x, y, prop.seed);
      else if (prop.kind === 'bush') drawBush(g, x, y, prop.seed);
      else if (prop.kind === 'house') drawHouse(g, prop, x, y);
      else if (prop.kind === 'stop') drawStop(g, prop, x, y);
      else if (prop.kind === 'light') drawLight(g, prop, x, y);
    }
  }

  function wheel(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    g.fillStyle = '#1f2937';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e5e7eb';
    g.beginPath();
    g.arc(x, y, r * 0.42, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#9ca3af';
    g.lineWidth = Math.max(1, r * 0.12);
    for (let i = 0; i < 4; i++) {
      const a = car.spin + (i * Math.PI) / 2;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r * 0.15, y + Math.sin(a) * r * 0.15);
      g.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75);
      g.stroke();
    }
  }

  function drawVehicle(g: CanvasRenderingContext2D): void {
    const u = road.unit;
    const x = sx(car.x);
    const y = roadY(road, car.x) + u * 0.3;
    const tilt = roadTilt(road, car.x);
    const bounce = Math.sin(clock * 14) * Math.min(1, Math.abs(car.v) / (u * 3)) * u * 0.015;
    const half = (u * vehicle.wheelbase) / 2;
    const wheelR = u * 0.2;
    const bodyH = u * vehicle.height;
    g.save();
    g.translate(x, y + bounce);
    g.rotate(tilt);
    // Shadow on the tarmac.
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.ellipse(0, wheelR * 0.9, half * 1.15, wheelR * 0.35, 0, 0, Math.PI * 2);
    g.fill();
    wheel(g, -half, 0, wheelR);
    wheel(g, half, 0, wheelR * (vehicle.shape === 'tractor' ? 1.35 : 1));
    const top = -wheelR * 0.4 - bodyH;
    g.fillStyle = vehicle.body;
    box(g, -half * 1.25, top, half * 2.5, bodyH, u * 0.12);
    g.fill();
    g.fillStyle = vehicle.trim;
    g.fillRect(-half * 1.25, top + bodyH - u * 0.08, half * 2.5, u * 0.08);
    // Cabin: a smaller box on top for everything except the bus, which is all cabin.
    const cabinW = vehicle.shape === 'bus' ? half * 2.2 : vehicle.shape === 'car' ? half * 1.35 : half * 1.15;
    const cabinX = vehicle.shape === 'bus' ? -half * 1.1 : vehicle.shape === 'car' ? -half * 0.7 : -half * 1.05;
    const cabinH = vehicle.shape === 'bus' ? bodyH * 0.55 : u * 0.42;
    g.fillStyle = vehicle.body;
    box(g, cabinX, top - cabinH, cabinW, cabinH + u * 0.1, u * 0.1);
    g.fill();
    g.fillStyle = '#bae6fd';
    box(g, cabinX + u * 0.07, top - cabinH + u * 0.07, cabinW - u * 0.14, cabinH - u * 0.12, u * 0.05);
    g.fill();
    if (vehicle.shape === 'truck') {
      g.fillStyle = vehicle.trim;
      box(g, half * 0.05, top - u * 0.3, half * 1.15, u * 0.3 + bodyH * 0.5, u * 0.06);
      g.fill();
    }
    if (vehicle.id === 'fire') {
      g.fillStyle = '#fff';
      g.fillRect(-half * 0.2, top + bodyH * 0.35, half * 1.3, u * 0.06);
    }
    if (vehicle.shape === 'tractor') {
      g.fillStyle = '#facc15';
      g.beginPath();
      g.arc(-half * 0.05, top - cabinH - u * 0.02, u * 0.06, 0, Math.PI * 2);
      g.fill();
    }
    // Headlight and a lamp on the roof of the fire engine.
    g.fillStyle = '#fef08a';
    g.beginPath();
    g.arc(half * 1.18, top + bodyH * 0.45, u * 0.06, 0, Math.PI * 2);
    g.fill();
    if (vehicle.id === 'fire') {
      g.fillStyle = Math.sin(clock * 9) > 0 ? '#ef4444' : '#fca5a5';
      g.beginPath();
      g.arc(cabinX + cabinW * 0.5, top - cabinH - u * 0.06, u * 0.07, 0, Math.PI * 2);
      g.fill();
    }
    // The passenger looks out of the window.
    if (ride) {
      g.font = `${u * 0.3}px system-ui`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ride.emoji, cabinX + cabinW * 0.5, top - cabinH * 0.45);
    }
    g.restore();
  }

  function drawSplashes(g: CanvasRenderingContext2D): void {
    for (const s of splashes) {
      const u = road.unit;
      g.fillStyle = `rgba(186,230,253,${Math.max(0, s.life * 0.9).toFixed(2)})`;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i / 4) * Math.PI;
        const rise = (1 - s.life) * u * 0.5;
        g.beginPath();
        g.arc(sx(s.x) + Math.cos(a) * rise * 1.2, s.y + u * 0.3 + Math.sin(a) * rise, u * 0.06 * s.life, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  /** Two birds gliding across an otherwise empty sky. */
  function drawBirds(g: CanvasRenderingContext2D): void {
    g.strokeStyle = 'rgba(71,85,105,0.5)';
    g.lineWidth = Math.max(1.5, road.unit * 0.035);
    // The loop is a screen wide so all three stay in sight, drifting right to left.
    const cycle = road.w + road.unit * 2;
    for (let i = 0; i < 3; i++) {
      const drift = (clock * road.unit * 0.35 + camX * 0.06 + (i * cycle) / 3) % cycle;
      const x = road.w + road.unit - drift;
      const y = road.h * (0.16 + i * 0.075) + Math.sin(clock * 0.9 + i) * road.unit * 0.08;
      const flap = Math.sin(clock * 5 + i * 2) * road.unit * 0.07;
      const wing = road.unit * 0.16;
      g.beginPath();
      g.moveTo(x - wing, y - flap);
      g.quadraticCurveTo(x - wing * 0.4, y + wing * 0.25, x, y);
      g.quadraticCurveTo(x + wing * 0.4, y + wing * 0.25, x + wing, y - flap);
      g.stroke();
    }
  }

  /** Grass and daisies in front of the tarmac, so the bottom of the screen is not bare. */
  function drawVerge(g: CanvasRenderingContext2D): void {
    const u = road.unit;
    const gap = u * 0.75;
    const first = Math.floor(camX / gap) - 1;
    for (let i = first; i < first + Math.ceil(road.w / gap) + 3; i++) {
      const wx = i * gap;
      const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = roadY(road, wx) + u * (0.78 + seed * 0.9) + road.h * 0.05;
      if (y > road.h + u) continue;
      const x = sx(wx) + seed * gap * 0.6;
      const blade = u * (0.16 + seed * 0.14);
      const sway = Math.sin(clock * 1.4 + i) * blade * 0.12;
      g.strokeStyle = seed > 0.5 ? '#22c55e' : '#16a34a';
      g.lineWidth = Math.max(1.5, u * 0.03);
      g.lineCap = 'round';
      for (const lean of [-0.35, 0, 0.35]) {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + lean * blade, y - blade * 0.6, x + lean * blade * 2 + sway, y - blade);
        g.stroke();
      }
      g.lineCap = 'butt';
      if (seed > 0.82) {
        g.fillStyle = seed > 0.92 ? '#fda4af' : '#fef08a';
        g.beginPath();
        g.arc(x + blade * 0.7 + sway, y - blade * 1.05, blade * 0.22, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function draw(g: CanvasRenderingContext2D): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, road.w, road.h);
    drawSky(g);
    drawClouds(g);
    drawBirds(g);
    // Three ranges: the far one is hazy blue and barely moves, so the sky has a floor.
    drawHills(g, 0.12, '#a5d8f3', 2.6);
    drawHills(g, 0.25, '#bbf7d0', 1.5);
    drawHills(g, 0.5, '#86efac', 0.9);
    drawProps(g, false);
    drawGround(g);
    drawRoad(g);
    drawProps(g, true);
    drawSplashes(g);
    drawVehicle(g);
    drawVerge(g);
  }

  let raf = 0;
  let last = 0;
  function loop(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(MAX_STEP, (now - last) / 1000) : 0.016;
    last = now;
    build();
    if (!c || !road.w) return;
    step(dt);
    draw(c);
  }

  // ---- the child ----

  /** Client x → canvas x in road pixels. */
  function acrossCanvas(e: PointerEvent): number {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width ? road.w / rect.width : 1;
    return (e.clientX - rect.left) * scale;
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    nudge = 0;
    hold = acrossCanvas(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (hold === null) return;
    hold = acrossCanvas(e);
  });
  const release = (): void => {
    hold = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  horn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.hint.touch();
    ctx.audio.fx(vehicle.horn);
    replay(horn, 'anim-bounce');
    navigator.vibrate?.(10);
  });

  for (const v of VEHICLES) {
    const btn = h(
      'button',
      { class: `drive-pick${v.id === vehicle.id ? ' selected' : ''}`, type: 'button', 'data-vehicle': v.id, 'aria-label': v.name },
      v.emoji,
    );
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ctx.hint.touch();
      vehicle = v;
      for (const other of tray.querySelectorAll('.drive-pick')) other.classList.toggle('selected', other === btn);
      replay(btn, 'anim-bounce');
      ctx.audio.fx(v.horn);
      ctx.speak(v.name);
    });
    tray.append(btn);
  }

  ctx.hint.arm(() => {
    replay(horn, 'anim-wiggle');
    // Roll forward a little on its own, so the child sees what a touch would do.
    if (hold === null) nudge = car.x + road.unit * 2;
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
  car = makeCar(road);
  camX = car.x - road.w * CAMERA_AT;
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
}

const game: GameModule = { ...meta, start };
export default game;
