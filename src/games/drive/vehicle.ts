import { box } from './scenery';

/**
 * Everything on wheels, drawn from its silhouette rather than a stack of boxes:
 * a car has a bonnet and a boot with the cabin between them, a lorry has its cab
 * at the front and its load behind, and a tractor stands on one big back wheel.
 * The child's vehicle and the traffic go through here alike, so the road looks
 * like one place.
 */
export type Shape = 'car' | 'bus' | 'truck' | 'tractor';

export interface Rig {
  shape: Shape;
  /** Distance between the axles, in units. */
  wheelbase: number;
  /** How tall the body stands, in units. */
  height: number;
  body: string;
  trim: string;
  /** Wheel rotation in radians. */
  spin: number;
  /** 0 by day, 1 at night: the glass lights up and the lamps come on. */
  dusk: number;
  clock: number;
  /** A ladder on the back and a beacon on the roof. */
  emergency?: boolean;
}

/** Where things ride: who is at the window, and what is stacked on the back. */
export interface Ride {
  /** Middle of the glass. */
  cabinX: number;
  cabinY: number;
  /** Middle of the load bed, and how wide it is. */
  deckX: number;
  deckY: number;
  deckW: number;
  /** Half the wheelbase, for anything that needs the length. */
  half: number;
}

/** The shape and size of the other things on the road, by kind. */
export const TRAFFIC: Readonly<Record<Shape, { wheelbase: number; height: number }>> = {
  car: { wheelbase: 1.0, height: 0.48 },
  bus: { wheelbase: 1.55, height: 0.74 },
  truck: { wheelbase: 1.4, height: 0.6 },
  tractor: { wheelbase: 1.1, height: 0.55 },
};

/** Where the tyres meet the tarmac, below the axle line. */
const CONTACT = 0.2;

function wheel(g: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number): void {
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
    const a = spin + (i * Math.PI) / 2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.15, y + Math.sin(a) * r * 0.15);
    g.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75);
    g.stroke();
  }
}

/** Glass: pale by day, lit from inside once it is dark. */
function glass(rig: Rig): string {
  return rig.dusk > 0.4 ? '#fde68a' : '#bae6fd';
}

function lamps(g: CanvasRenderingContext2D, u: number, rig: Rig, front: number, back: number, y: number): void {
  g.fillStyle = rig.dusk > 0.4 ? '#fffbeb' : '#fef08a';
  g.beginPath();
  g.arc(front, y, u * (0.055 + rig.dusk * 0.02), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ef4444';
  g.beginPath();
  g.arc(back, y, u * 0.045, 0, Math.PI * 2);
  g.fill();
}

/** A saloon: bumper, boot, cabin, bonnet, bumper. */
function drawCar(g: CanvasRenderingContext2D, u: number, rig: Rig, half: number, bodyH: number): Ride {
  const floor = -u * 0.08;
  const waist = floor - bodyH * 0.52;
  const roof = floor - bodyH;
  const nose = half * 1.32;
  const tail = -half * 1.34;
  g.fillStyle = rig.body;
  g.beginPath();
  g.moveTo(tail, floor);
  g.lineTo(tail, waist + bodyH * 0.12);
  g.quadraticCurveTo(tail, waist, tail + half * 0.2, waist);
  g.lineTo(-half * 0.62, waist);
  g.quadraticCurveTo(-half * 0.34, roof, half * 0.05, roof);
  g.lineTo(half * 0.42, roof);
  g.quadraticCurveTo(half * 0.78, roof + bodyH * 0.12, half * 0.92, waist);
  g.lineTo(nose - half * 0.16, waist);
  g.quadraticCurveTo(nose, waist, nose, waist + bodyH * 0.18);
  g.lineTo(nose, floor);
  g.closePath();
  g.fill();
  // A darker skirt along the bottom, so the body is not one flat colour.
  g.fillStyle = rig.trim;
  g.fillRect(tail, floor - bodyH * 0.13, nose - tail, bodyH * 0.13);
  // Two windows with a pillar between them.
  g.fillStyle = glass(rig);
  g.beginPath();
  g.moveTo(-half * 0.5, waist - u * 0.03);
  g.quadraticCurveTo(-half * 0.26, roof + u * 0.05, half * 0.02, roof + u * 0.05);
  g.lineTo(half * 0.02, waist - u * 0.03);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(half * 0.14, waist - u * 0.03);
  g.lineTo(half * 0.42, roof + u * 0.05);
  g.quadraticCurveTo(half * 0.72, roof + bodyH * 0.16, half * 0.8, waist - u * 0.03);
  g.closePath();
  g.fill();
  lamps(g, u, rig, nose - u * 0.06, tail + u * 0.06, waist + bodyH * 0.22);
  return { cabinX: -half * 0.24, cabinY: (roof + waist) / 2, deckX: 0, deckY: waist, deckW: half * 1.2, half };
}

/** A single-decker: one long box, a row of windows and a door at the front. */
function drawBus(g: CanvasRenderingContext2D, u: number, rig: Rig, half: number, bodyH: number): Ride {
  const floor = -u * 0.08;
  const roof = floor - bodyH;
  const nose = half * 1.28;
  const tail = -half * 1.3;
  g.fillStyle = rig.body;
  box(g, tail, roof, nose - tail, bodyH, u * 0.16);
  g.fill();
  g.fillStyle = rig.trim;
  g.fillRect(tail, floor - bodyH * 0.16, nose - tail, bodyH * 0.16);
  // The board over the windscreen that says where it is going.
  g.fillStyle = '#1c1917';
  box(g, half * 0.5, roof + bodyH * 0.08, half * 0.66, bodyH * 0.16, u * 0.03);
  g.fill();
  // A run of windows down the side, and a taller one for the driver.
  g.fillStyle = glass(rig);
  const first = tail + u * 0.12;
  const win = (nose - tail - u * 0.55) / 4;
  for (let i = 0; i < 4; i++) {
    box(g, first + i * win, roof + bodyH * 0.28, win - u * 0.06, bodyH * 0.32, u * 0.04);
    g.fill();
  }
  box(g, half * 0.52, roof + bodyH * 0.28, half * 0.62, bodyH * 0.34, u * 0.04);
  g.fill();
  // Doors: two panels behind the front wheel.
  g.fillStyle = 'rgba(15,23,42,0.22)';
  g.fillRect(half * 0.28, roof + bodyH * 0.26, u * 0.02, bodyH * 0.66);
  lamps(g, u, rig, nose - u * 0.08, tail + u * 0.08, floor - bodyH * 0.22);
  return { cabinX: half * 0.1, cabinY: roof + bodyH * 0.44, deckX: -half * 0.4, deckY: roof + bodyH * 0.44, deckW: half * 1.2, half };
}

/** A lorry: cab at the front where the driver is, load behind it. */
function drawTruck(g: CanvasRenderingContext2D, u: number, rig: Rig, half: number, bodyH: number): Ride {
  const floor = -u * 0.08;
  const nose = half * 1.3;
  const tail = -half * 1.38;
  const cabTop = floor - bodyH * 1.05;
  const boxTop = floor - bodyH * (rig.emergency ? 0.86 : 1.25);
  // The load first, so the cab overlaps it.
  g.fillStyle = rig.emergency ? rig.trim : rig.body;
  box(g, tail, boxTop, half * 1.62, floor - boxTop, u * 0.07);
  g.fill();
  g.fillStyle = 'rgba(15,23,42,0.14)';
  for (let i = 0; i < 3; i++) g.fillRect(tail + half * (0.28 + i * 0.42), boxTop + u * 0.06, u * 0.03, floor - boxTop - u * 0.12);
  // Cab: a box with the windscreen leaning back over the bonnet.
  g.fillStyle = rig.body;
  g.beginPath();
  g.moveTo(half * 0.2, floor);
  g.lineTo(half * 0.2, cabTop);
  g.lineTo(half * 0.9, cabTop);
  g.quadraticCurveTo(nose, cabTop + bodyH * 0.22, nose, cabTop + bodyH * 0.48);
  g.lineTo(nose, floor);
  g.closePath();
  g.fill();
  g.fillStyle = rig.trim;
  g.fillRect(half * 0.2, floor - bodyH * 0.14, nose - half * 0.2, bodyH * 0.14);
  g.fillStyle = glass(rig);
  g.beginPath();
  g.moveTo(half * 0.34, cabTop + u * 0.08);
  g.lineTo(half * 0.86, cabTop + u * 0.08);
  g.quadraticCurveTo(nose - u * 0.08, cabTop + bodyH * 0.26, nose - u * 0.08, cabTop + bodyH * 0.46);
  g.lineTo(half * 0.34, cabTop + bodyH * 0.46);
  g.closePath();
  g.fill();
  if (rig.emergency) {
    // A white flash down the side, a ladder on the back and a beacon on the roof.
    g.fillStyle = '#fff';
    g.fillRect(tail + u * 0.05, boxTop + (floor - boxTop) * 0.36, half * 1.5, u * 0.07);
    g.strokeStyle = '#e5e7eb';
    g.lineWidth = Math.max(1.5, u * 0.035);
    g.beginPath();
    g.moveTo(tail + u * 0.1, boxTop - u * 0.1);
    g.lineTo(half * 0.1, boxTop - u * 0.1);
    g.moveTo(tail + u * 0.1, boxTop - u * 0.22);
    g.lineTo(half * 0.1, boxTop - u * 0.22);
    g.stroke();
    g.lineWidth = Math.max(1, u * 0.02);
    for (let i = 0; i < 6; i++) {
      const rx = tail + u * 0.16 + (i * (half * 1.4 - u * 0.2)) / 6;
      g.beginPath();
      g.moveTo(rx, boxTop - u * 0.1);
      g.lineTo(rx, boxTop - u * 0.22);
      g.stroke();
    }
    g.fillStyle = Math.sin(rig.clock * 9) > 0 ? '#ef4444' : '#fca5a5';
    box(g, half * 0.42, cabTop - u * 0.12, half * 0.4, u * 0.12, u * 0.04);
    g.fill();
  }
  lamps(g, u, rig, nose - u * 0.07, tail + u * 0.07, floor - bodyH * 0.3);
  return {
    cabinX: half * 0.62,
    cabinY: cabTop + bodyH * 0.3,
    deckX: tail + half * 0.8,
    deckY: boxTop + (floor - boxTop) * 0.45,
    deckW: half * 1.4,
    half,
  };
}

/** A tractor: one big wheel at the back, a narrow bonnet and an exhaust. */
function drawTractor(g: CanvasRenderingContext2D, u: number, rig: Rig, half: number, bodyH: number): Ride {
  const floor = -u * 0.08;
  const nose = half * 1.26;
  const tail = -half * 1.2;
  const hood = floor - bodyH * 0.62;
  const roof = floor - bodyH * 1.55;
  // The bonnet out front, low and narrow.
  g.fillStyle = rig.body;
  box(g, half * 0.18, hood, nose - half * 0.18, floor - hood, u * 0.05);
  g.fill();
  g.fillStyle = rig.trim;
  g.fillRect(half * 0.18, hood, nose - half * 0.18, u * 0.06);
  // The cab over the back axle.
  g.fillStyle = rig.body;
  box(g, tail, floor - bodyH * 1.05, half * 1.36, bodyH * 1.05, u * 0.06);
  g.fill();
  // Canopy on two posts.
  g.fillStyle = rig.trim;
  box(g, tail - u * 0.04, roof, half * 1.5, u * 0.1, u * 0.04);
  g.fill();
  g.fillRect(tail + u * 0.06, roof, u * 0.06, floor - bodyH * 1.05 - roof);
  g.fillRect(half * 0.02, roof, u * 0.06, floor - bodyH * 1.05 - roof);
  g.fillStyle = glass(rig);
  box(g, tail + u * 0.16, floor - bodyH * 0.95, half * 1.0, bodyH * 0.5, u * 0.04);
  g.fill();
  // Exhaust stack in front of the cab, with a puff on it.
  g.fillStyle = '#334155';
  g.fillRect(half * 0.24, hood - bodyH * 0.55, u * 0.07, bodyH * 0.55);
  g.fillStyle = 'rgba(148,163,184,0.5)';
  const puff = (rig.clock * 0.9) % 1;
  g.beginPath();
  g.arc(half * 0.27, hood - bodyH * 0.6 - puff * u * 0.5, u * (0.05 + puff * 0.08), 0, Math.PI * 2);
  g.fill();
  lamps(g, u, rig, nose - u * 0.06, tail + u * 0.06, hood + u * 0.1);
  return { cabinX: -half * 0.35, cabinY: floor - bodyH * 0.7, deckX: -half * 0.35, deckY: floor - bodyH * 0.7, deckW: half, half };
}

/**
 * Draw one vehicle facing right, centred between its axles with the tyres
 * touching y = `CONTACT`. Returns where a passenger sits and where a load rides.
 */
export function drawRig(g: CanvasRenderingContext2D, u: number, rig: Rig): Ride {
  const half = (u * rig.wheelbase) / 2;
  const bodyH = u * rig.height;
  const backR = u * (rig.shape === 'tractor' ? 0.31 : rig.shape === 'car' ? 0.19 : 0.21);
  const frontR = u * (rig.shape === 'tractor' ? 0.155 : rig.shape === 'car' ? 0.19 : 0.21);
  const ground = u * CONTACT;
  // Shadow on the tarmac, under the whole length of it.
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(0, ground * 0.92, half * 1.3, backR * 0.32, 0, 0, Math.PI * 2);
  g.fill();
  wheel(g, -half, ground - backR, backR, rig.spin);
  wheel(g, half, ground - frontR, frontR, rig.spin);
  const ride =
    rig.shape === 'bus'
      ? drawBus(g, u, rig, half, bodyH)
      : rig.shape === 'truck'
        ? drawTruck(g, u, rig, half, bodyH)
        : rig.shape === 'tractor'
          ? drawTractor(g, u, rig, half, bodyH)
          : drawCar(g, u, rig, half, bodyH);
  // The back wheel of a tractor stands proud of the body, so draw it again on top.
  if (rig.shape === 'tractor') wheel(g, -half, ground - backR, backR, rig.spin);
  return ride;
}
