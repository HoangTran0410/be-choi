import { drawSand, drawWater, vignette } from './draw';
import type { Rock, Tank } from './logic';

/**
 * Things that never move (the water's gradient, the sand, the glass vignette) are
 * painted once into an offscreen canvas and laid down with one `drawImage` per
 * frame. A big gradient fill is per-pixel work every frame; a blit is a copy.
 * The picture is the same, it is just not recomputed sixty times a second.
 */
export interface Layer {
  canvas: HTMLCanvasElement | null;
  key: string;
  deps: readonly unknown[];
}

export function makeLayer(): Layer {
  return { canvas: null, key: '', deps: [] };
}

/**
 * Draw the layer at (0, y0) CSS pixels, repainting it first if its size, pixel
 * density or `deps` (compared by reference) changed. `paint` draws in CSS pixels
 * with (0, 0) at the layer's top-left. Returns false when there is no offscreen
 * canvas to be had, so the caller can paint straight onto the tank instead.
 */
export function drawLayer(
  g: CanvasRenderingContext2D,
  layer: Layer,
  w: number,
  h: number,
  dpr: number,
  y0: number,
  deps: readonly unknown[],
  paint: (n: CanvasRenderingContext2D) => void,
): boolean {
  const key = `${w}x${h}x${dpr}x${y0}`;
  const same = layer.key === key && layer.deps.length === deps.length && layer.deps.every((d, i) => d === deps[i]);
  if (!same || !layer.canvas) {
    if (!layer.canvas) {
      if (typeof document === 'undefined') return false;
      layer.canvas = document.createElement('canvas');
    }
    layer.canvas.width = Math.max(1, Math.round(w * dpr));
    layer.canvas.height = Math.max(1, Math.round(h * dpr));
    const n = layer.canvas.getContext('2d');
    if (!n) return false;
    n.setTransform(dpr, 0, 0, dpr, 0, 0);
    n.clearRect(0, 0, w, h);
    paint(n);
    layer.key = key;
    layer.deps = deps;
  }
  g.drawImage(layer.canvas, 0, y0, w, h);
  return true;
}

/** The water's gradient, cached. */
export function drawWaterCached(g: CanvasRenderingContext2D, tank: Tank, dpr: number, layer: Layer): void {
  if (!drawLayer(g, layer, tank.w, tank.h, dpr, 0, [], (n) => drawWater(n, tank))) drawWater(g, tank);
}

/** The sand, its grains and the rocks, cached as a band from just above the highest of them down to the floor of the tank. */
export function drawSandCached(
  g: CanvasRenderingContext2D,
  tank: Tank,
  sand: readonly number[],
  rocks: readonly Rock[],
  dpr: number,
  layer: Layer,
): void {
  let top = Math.min(tank.floor - tank.unit * 0.2, ...sand);
  for (const r of rocks) top = Math.min(top, tank.floor + tank.unit * 0.1 - r.r * r.squash);
  const y0 = Math.max(0, Math.floor(top) - 2);
  const painted = drawLayer(g, layer, tank.w, tank.h - y0, dpr, y0, [sand, rocks], (n) => {
    n.translate(0, -y0);
    drawSand(n, tank, sand, rocks);
  });
  if (!painted) drawSand(g, tank, sand, rocks);
}

/** The soft dark edge of the glass, cached. */
export function drawVignetteCached(g: CanvasRenderingContext2D, tank: Tank, dpr: number, layer: Layer): void {
  if (!drawLayer(g, layer, tank.w, tank.h, dpr, 0, [], (n) => vignette(n, tank))) vignette(g, tank);
}
