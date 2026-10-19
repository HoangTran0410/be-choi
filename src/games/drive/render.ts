import { mulberry32 } from '../../core/dom';
import { roadTilt, roadY, slotX } from './logic';
import { HOP_LIFT, hopAt, loadAt } from './jobs';
import { crosserFade, crosserScale, crosserY, type Traveller } from './traffic';
import {
  beamGlows,
  drawBirds,
  drawClouds,
  drawDrift,
  drawGround,
  drawHills,
  drawRoad,
  drawSea,
  drawSky,
  drawSkyline,
  drawThicket,
  drawVerge,
  drawWeather,
  driftNow,
  glyph,
  paletteAt,
  weatherNow,
  type Glow,
} from './scenery';
import { drawProp, lampsFor, type Dressing } from './props';
import { TRAFFIC, drawRig } from './vehicle';
import { DROP_WAVE_MS } from './config';
import { inView, sceneOf, screenX, type Drive } from './state';

function dressing(d: Drive): Dressing {
  return {
    scene: sceneOf(d),
    job: d.job,
    loads: d.loads,
    served: d.served,
    doused: d.doused,
    hosing: d.hosing,
    pokes: d.pokes,
    lights: d.lights,
    crossings: d.crossings,
    chosen: d.chosen,
    waved: d.clock - d.waved < DROP_WAVE_MS / 1000 ? d.waved : -9,
    carX: d.car.x,
  };
}

function drawVehicle(d: Drive, g: CanvasRenderingContext2D): void {
  const { road, car, vehicle, job, loads, hops, clock, dusk } = d;
  const u = road.unit;
  const x = screenX(d, car.x);
  const y = roadY(road, car.x) + u * 0.3;
  const bounce = Math.sin(clock * 14) * Math.min(1, Math.abs(car.v) / (u * 3)) * u * 0.015;
  g.save();
  g.translate(x, y + bounce);
  g.rotate(roadTilt(road, car.x));
  const ride = drawRig(g, u, {
    shape: vehicle.shape,
    wheelbase: vehicle.wheelbase,
    height: vehicle.height,
    body: vehicle.body,
    trim: vehicle.trim,
    spin: car.spin,
    dusk,
    clock,
    emergency: vehicle.id === 'fire',
  });
  // What is on board rides where it would really ride: at the window, or on the
  // back. Anything still climbing in is left to the hop that is carrying it.
  const inside = job.kind === 'ride';
  const spotX = inside ? ride.cabinX : ride.deckX;
  const spotY = inside ? ride.cabinY : ride.deckY;
  const aboard = loads.filter((l) => !hops.some((hop) => hop.boarding && hop.slot === l.slot));
  if (aboard.length) {
    const gap = u * (inside ? 0.26 : 0.32);
    aboard.forEach((l, i) => {
      glyph(g, l.emoji, spotX + (i - (aboard.length - 1) / 2) * gap, spotY, u * 0.28);
    });
  }
  // Mud thrown up by the puddles, right over the body until it is washed off.
  if (car.mud > 0.02) {
    g.fillStyle = `rgba(87,62,32,${(car.mud * 0.6).toFixed(2)})`;
    const spots = mulberry32(3);
    for (let i = 0; i < 14; i++) {
      const mx = -ride.half * 1.2 + spots() * ride.half * 2.4;
      const my = -u * 0.1 - spots() * u * vehicle.height;
      g.beginPath();
      g.arc(mx, my, u * (0.03 + spots() * 0.045), 0, Math.PI * 2);
      g.fill();
    }
  }
  const lean = roadTilt(road, car.x);
  d.seat = {
    x: car.x + spotX * Math.cos(lean) - spotY * Math.sin(lean),
    y: y + bounce + spotX * Math.sin(lean) + spotY * Math.cos(lean),
  };
  g.restore();
  // The hose, while it is on a fire.
  if (d.hosing) {
    const fx = screenX(d, slotX(road, d.hosing.slot));
    const fy = roadY(road, slotX(road, d.hosing.slot)) - u * 1.5;
    g.strokeStyle = 'rgba(125,211,252,0.85)';
    g.lineWidth = u * 0.09;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y - u * 0.7);
    g.quadraticCurveTo((x + fx) / 2, Math.min(y, fy) - u * 0.9, fx, fy);
    g.stroke();
    g.lineCap = 'butt';
  }
}

/** One of the other vehicles: the same bodies the child drives, a size down. */
function drawTraveller(d: Drive, g: CanvasRenderingContext2D, v: Traveller): void {
  const { road, clock, dusk } = d;
  const u = road.unit;
  const far = v.lane === 'opposite';
  const scale = far ? 0.82 : 1;
  const x = screenX(d, v.x);
  const y = roadY(road, v.x) + u * (far ? 0.06 : 0.3);
  const spec = TRAFFIC[v.kind];
  // The far lane comes the other way, so it is drawn mirrored — and the lean
  // has to be mirrored with it or a hill would tip it the wrong way.
  const dir = far ? -1 : 1;
  g.save();
  g.translate(x, y);
  g.scale(dir * scale, scale);
  g.rotate(roadTilt(road, v.x) * dir);
  drawRig(g, u, {
    shape: v.kind,
    wheelbase: spec.wheelbase,
    height: spec.height,
    body: v.body,
    trim: v.roof,
    spin: v.spin,
    dusk,
    clock,
  });
  g.restore();
  if (v.stuck > 0) glyph(g, '😤', x, y - u * 1.3 + Math.sin(clock * 5 + v.x) * u * 0.05, u * 0.4);
}

function drawCrossers(d: Drive, g: CanvasRenderingContext2D): void {
  const u = d.road.unit;
  for (const cr of d.crossers) {
    const size = u * cr.size;
    // The line trails: each one is a step behind the one in front of it.
    for (let i = 0; i < cr.count; i++) {
      const t = Math.max(0, cr.t - i * 0.09);
      const one = { ...cr, t };
      const waddle = Math.sin(d.clock * (cr.hurried ? 14 : 7) + i) * u * 0.05;
      g.globalAlpha = crosserFade(one);
      glyph(g, cr.emoji, screenX(d, cr.x) + i * size * 0.78 + waddle, crosserY(one, d.road), size * crosserScale(one));
    }
  }
  g.globalAlpha = 1;
}

/** Loads on their way in or out, arcing between the roadside and the vehicle. */
function drawHops(d: Drive, g: CanvasRenderingContext2D): void {
  for (const hop of d.hops) {
    const at = hopAt(hop, d.seat.x, d.seat.y, d.road.unit * HOP_LIFT);
    g.save();
    g.translate(screenX(d, at.x), at.y);
    g.rotate(at.spin);
    glyph(g, hop.emoji, 0, 0, hop.size * at.scale);
    g.restore();
  }
}

function drawFlyers(d: Drive, g: CanvasRenderingContext2D): void {
  for (const f of d.flyers) {
    g.globalAlpha = Math.max(0, Math.min(1, f.life));
    glyph(g, f.emoji, screenX(d, f.x), f.y, f.size);
  }
  g.globalAlpha = 1;
}

/** Every light that should still be burning once the sun is down. */
function glows(d: Drive): Glow[] {
  const { road, car } = d;
  const out: Glow[] = [];
  const u = road.unit;
  const facing = car.v < -u * 0.2 ? -1 : 1;
  out.push(...beamGlows(screenX(d, car.x) + facing * u * 0.7, roadY(road, car.x), u, facing));
  for (const prop of inView(d)) {
    for (const lamp of lampsFor(prop, screenX(d, prop.x), roadY(road, prop.x), u)) {
      out.push({ ...lamp, strength: 0.55 });
    }
  }
  for (const v of d.travellers) {
    out.push({ x: screenX(d, v.x) + (v.lane === 'same' ? u : -u), y: roadY(road, v.x), r: u * 1.1, strength: 0.5 });
  }
  return out;
}

export function draw(d: Drive, g: CanvasRenderingContext2D): void {
  const { road, job } = d;
  const s = sceneOf(d);
  const p = paletteAt(s);
  const sky = weatherNow(s);
  g.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
  g.clearRect(0, 0, road.w, road.h);
  drawSky(g, s, p);
  drawClouds(g, s, sky.weather);
  drawBirds(g, s);
  // Three ranges: the far one is the sea at the coast and a skyline in town.
  if (p.sea) drawSea(g, s);
  else if (p.city) drawSkyline(g, s);
  else drawHills(g, s, 0.12, (q) => q.far, 3.2);
  drawHills(g, s, 0.25, (q) => q.mid, 1.9);
  drawHills(g, s, 0.5, (q) => q.near, 1.05);
  drawThicket(g, s);
  const dr = dressing(d);
  const props = inView(d);
  for (const prop of props) drawProp(g, dr, prop, loadAt(job.kind, prop.slot), false);
  drawGround(g, s);
  drawRoad(g, s);
  for (const prop of props) drawProp(g, dr, prop, loadAt(job.kind, prop.slot), true);
  for (const v of d.travellers) if (v.lane === 'opposite') drawTraveller(d, g, v);
  for (const v of d.travellers) if (v.lane === 'same') drawTraveller(d, g, v);
  drawCrossers(d, g);
  drawVehicle(d, g);
  drawHops(d, g);
  drawFlyers(d, g);
  drawVerge(g, s);
  drawWeather(g, s, sky.weather, sky.strength);
  const drift = driftNow(s);
  drawDrift(g, s, drift.biome, drift.strength);
  d.nightLayer.draw(g, s, glows(d));
}
