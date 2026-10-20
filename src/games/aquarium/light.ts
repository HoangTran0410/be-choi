import { makeLayer, type Layer } from './layers';
import type { State } from './state';

/** Caustics are baked into a tile this many pixels square and blown up over the tank. */
const CAUSTIC_N = 64;

/** The offscreen canvases and patterns the light effects are built from. */
export interface Light {
  causticTile: HTMLCanvasElement;
  tileCtx: CanvasRenderingContext2D | null;
  tileData: ImageData | null;
  /**
   * The light on the water, as one fill of a repeating pattern rather than a few
   * hundred `drawImage` calls. Measured on a laptop the tiled version cost about
   * 6.7 ms a frame — forty per cent of a sixtieth of a second, before a single
   * fish was drawn; the pattern is thousandths of that, and a tablet has far less
   * to spare than a laptop.
   */
  causticPattern: CanvasPattern | null;
  /**
   * The dark, with the beam cut out of it, kept on its own canvas. Cutting the
   * hole straight into the tank would erase the tank: `destination-out` takes
   * away everything under it, fish included, and what shows through is the page
   * behind the canvas. Built here and laid over the top instead, so inside the
   * beam the tank is simply untouched — which is what "lit" means.
   */
  nightLayer: HTMLCanvasElement;
  nightBuiltFor: string;
  /**
   * A half-size canvas the caustic pattern is filled into before being scaled up
   * over the tank. The tile is a 64 px square blown up three times or more anyway,
   * so nothing sharp is lost, and the fill touches a quarter of the pixels.
   */
  low: (HTMLCanvasElement | null)[];
  /** When (in 1/15 s) each small canvas was last filled. */
  lowAt: number[];
  /** Pictures of the parts of the tank that never move (see ./layers). */
  water: Layer;
  sand: Layer;
  vignette: Layer;
  /** The sun beams held still, for when the device is struggling. */
  rays: Layer;
}

export function createLight(): Light {
  const causticTile = document.createElement('canvas');
  causticTile.width = CAUSTIC_N;
  causticTile.height = CAUSTIC_N;
  const tileCtx = causticTile.getContext('2d');
  const tileData = tileCtx?.createImageData(CAUSTIC_N, CAUSTIC_N) ?? null;
  return {
    causticTile,
    tileCtx,
    tileData,
    causticPattern: null,
    nightLayer: document.createElement('canvas'),
    nightBuiltFor: '',
    low: [null, null],
    lowAt: [-1, -1],
    water: makeLayer(),
    sand: makeLayer(),
    vignette: makeLayer(),
    rays: makeLayer(),
  };
}

/**
 * Two crossed sine fields that warp each other, ridged so the bright part is
 * where they cancel: that gives the thin joined-up veins real caustics have,
 * rather than blobs. Every frequency is a whole number of cycles across the
 * tile, so the tile repeats without a seam.
 */
export function bakeCaustics(light: Light, t: number): void {
  const { tileCtx, tileData } = light;
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

export function drawRays(g: CanvasRenderingContext2D, s: State): void {
  const { tank, clock } = s;
  g.save();
  g.globalCompositeOperation = 'source-over';
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

/** How much smaller than the tank the caustics are filled. */
const LOW = 2;

/** How often the caustic canvases are refilled: the light drifts slowly, so 15 a second reads as smooth. */
const REFILL_HZ = 15;

/**
 * Lay the baked square over the tank at a size where the veins read as light on water.
 * `slot` picks which small canvas holds the result between refills (0 the water,
 * 1 the sand): the pattern is filled into it a few times a second, and every
 * frame in between is one plain `drawImage`. `tint` recolours what was filled
 * (the sand wants a white light, not the water's pale blue).
 */
function tileCaustics(
  g: CanvasRenderingContext2D,
  s: State,
  light: Light,
  slot: 0 | 1,
  size: number,
  dx: number,
  dy: number,
  top: number,
  bottom: number,
  tint?: string,
): void {
  const scale = size / CAUSTIC_N;
  const w = s.tank.w;
  let low = light.low[slot] ?? null;
  if (!low && typeof document !== 'undefined') low = light.low[slot] = document.createElement('canvas');
  const lw = Math.max(1, Math.ceil(w / LOW));
  const lh = Math.max(1, Math.ceil(s.tank.h / LOW));
  const n = low ? low.getContext('2d') : null;
  if (!low || !n) {
    // No offscreen canvas: fill the tank directly.
    const pattern = g.createPattern(light.causticTile, 'repeat');
    if (!pattern) return;
    try {
      pattern.setTransform(new DOMMatrix().translateSelf(dx % size, dy % size).scaleSelf(scale, scale));
    } catch {
      // No DOMMatrix (jsdom, older engines): the light simply does not drift.
    }
    g.fillStyle = pattern;
    g.fillRect(0, top, w, bottom - top);
    return;
  }
  const y = Math.floor(top / LOW);
  const h = Math.min(lh - y, Math.ceil((bottom - top) / LOW) + 1);
  const resized = low.width !== lw || low.height !== lh;
  const stamp = Math.floor(s.clock * REFILL_HZ);
  if (resized || light.lowAt[slot] !== stamp) {
    if (resized) {
      low.width = lw;
      low.height = lh;
      light.causticPattern = null;
    }
    light.lowAt[slot] = stamp;
    if (!light.causticPattern) light.causticPattern = n.createPattern(light.causticTile, 'repeat');
    const pattern = light.causticPattern;
    if (!pattern) return;
    try {
      // The pattern is moved rather than the canvas, so the fill stays put.
      pattern.setTransform(new DOMMatrix().translateSelf((dx % size) / LOW, (dy % size) / LOW).scaleSelf(scale / LOW, scale / LOW));
    } catch {
      // No DOMMatrix (jsdom, older engines): the light simply does not drift.
    }
    n.setTransform(1, 0, 0, 1, 0, 0);
    n.globalCompositeOperation = 'source-over';
    n.clearRect(0, y, lw, h);
    n.fillStyle = pattern;
    n.fillRect(0, y, lw, h);
    if (tint) {
      n.globalCompositeOperation = 'source-atop';
      n.fillStyle = tint;
      n.fillRect(0, y, lw, h);
      n.globalCompositeOperation = 'source-over';
    }
  }
  g.drawImage(low, 0, y, lw, h, 0, y * LOW, lw * LOW, h * LOW);
}

/** Light through the whole body of water. */
export function drawCaustics(g: CanvasRenderingContext2D, s: State, light: Light): void {
  if (!light.tileCtx) return;
  const { tank, clock } = s;
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 0.12;
  tileCaustics(g, s, light, 0, tank.unit * 3.4, clock * 16, Math.sin(clock * 0.3) * tank.unit, 0, tank.h);
  g.restore();
}

/**
 * The bright pass on the sand. It rides with the sand's own layer, or the band
 * lands above the floor and reads as a strip of haze across the tank.
 */
export function drawSandCaustics(g: CanvasRenderingContext2D, s: State, light: Light): void {
  if (!light.tileCtx) return;
  const { tank, clock } = s;
  g.save();
  g.globalAlpha = 0.45;
  g.beginPath();
  g.rect(0, tank.floor + tank.unit * 0.08, tank.w, tank.h - tank.floor);
  g.clip();
  tileCaustics(g, s, light, 1, tank.unit * 2.2, clock * -10, 0, tank.floor, tank.h, '#ffffff');
  g.restore();
}

export function drawSurface(g: CanvasRenderingContext2D, s: State): void {
  const { tank, clock } = s;
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
}

function buildNight(s: State, light: Light): void {
  const { tank, dpr } = s;
  const { nightLayer } = light;
  const key = `${tank.w}x${tank.h}x${dpr}`;
  if (light.nightBuiltFor === key) return;
  nightLayer.width = Math.max(1, Math.round(tank.w * dpr));
  nightLayer.height = Math.max(1, Math.round(tank.h * dpr));
  const n = nightLayer.getContext('2d');
  if (!n) return;
  light.nightBuiltFor = key;
  n.setTransform(dpr, 0, 0, dpr, 0, 0);
  n.clearRect(0, 0, tank.w, tank.h);
  n.fillStyle = 'rgba(4,20,48,0.86)';
  n.fillRect(0, 0, tank.w, tank.h);

  const lampX = tank.w * 0.5;
  const lampY = tank.h * 0.02;
  const reach = tank.h * 0.78;
  const hole = n.createRadialGradient(lampX, lampY, reach * 0.05, lampX, lampY, reach);
  // Solid through the beam, soft only at its edge: inside the light a fish
  // should look exactly as it does by day.
  hole.addColorStop(0, 'rgba(0,0,0,1)');
  hole.addColorStop(0.72, 'rgba(0,0,0,1)');
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  n.globalCompositeOperation = 'destination-out';
  n.fillStyle = hole;
  // Blur the cut so the sides of the beam fade rather than ruling two hard
  // lines across the tank. Baked once, so the blur costs nothing per frame.
  try {
    n.filter = `blur(${Math.max(6, tank.unit * 0.45)}px)`;
  } catch {
    /* no filter support: a crisp beam is better than none */
  }
  n.beginPath();
  n.moveTo(lampX - tank.unit * 0.55, 0);
  n.lineTo(lampX + tank.unit * 0.55, 0);
  n.lineTo(lampX + reach * 0.78, tank.h);
  n.lineTo(lampX - reach * 0.78, tank.h);
  n.closePath();
  n.fill();
  n.filter = 'none';
}

/**
 * Night: a dark blue sheet over the whole tank with a soft hole cut in it
 * under the lamp, so the one lit pool is the only place anything can be seen
 * properly — which is what an aquarium looks like in a dark room.
 */
export function drawNight(g: CanvasRenderingContext2D, s: State, light: Light): void {
  const { tank, dusk } = s;
  if (dusk < 0.01) return;
  buildNight(s, light);
  const lampX = tank.w * 0.5;
  const lampY = tank.h * 0.02;

  g.save();
  g.globalAlpha = dusk;
  g.drawImage(light.nightLayer, 0, 0, tank.w, tank.h);
  g.restore();

  // A glow at the bulb itself, and nowhere else: that is where a lamp glows.
  g.save();
  g.globalAlpha = dusk * 0.5;
  g.globalCompositeOperation = 'screen';
  const bulb = g.createRadialGradient(lampX, lampY, 0, lampX, lampY, tank.unit * 1.4);
  bulb.addColorStop(0, 'rgba(255,241,196,0.85)');
  bulb.addColorStop(1, 'rgba(255,241,196,0)');
  g.fillStyle = bulb;
  g.fillRect(0, 0, tank.w, tank.unit * 3);
  g.restore();

  // The lamp itself on the lid.
  g.save();
  g.globalAlpha = dusk;
  g.fillStyle = '#334155';
  g.beginPath();
  g.moveTo(lampX - tank.unit * 0.5, 0);
  g.lineTo(lampX + tank.unit * 0.5, 0);
  g.lineTo(lampX + tank.unit * 0.32, tank.unit * 0.26);
  g.lineTo(lampX - tank.unit * 0.32, tank.unit * 0.26);
  g.closePath();
  g.fill();
  g.fillStyle = '#fef9c3';
  g.beginPath();
  g.ellipse(lampX, tank.unit * 0.26, tank.unit * 0.3, tank.unit * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
