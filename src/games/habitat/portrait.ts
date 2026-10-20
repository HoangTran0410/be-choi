/**
 * A picture of each animal, drawn by the same code that draws it swimming or
 * walking, so the book shows what the child will actually see. Each is drawn once
 * on a roomy canvas, then cropped to what was really painted and centred, so a
 * crab with its legs out and a thin snake both fill their tile.
 */
import { h } from '../../core/dom';
import { Creature as Fish } from '../aquarium/logic';
import { drawCreature as drawFish } from '../aquarium/draw';
import { makeTank } from '../aquarium/logic';
import { speciesById as fishSpecies } from '../aquarium/species';
import { Creature as Critter, makeVivarium } from '../terrarium/logic';
import { drawCreature as drawCritter } from '../terrarium/draw';
import { speciesById as critterSpecies } from '../terrarium/species';
import { kindByKey } from './catalog';

/** Half the side of the canvas an animal is first drawn on. */
const PX = 128;
/** What the finished picture fills of its square. */
const FILL = 0.9;

function jointsBox(joints: readonly { x: number; y: number }[], pad: number): { cx: number; cy: number; w: number; h: number } {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const j of joints) {
    left = Math.min(left, j.x - pad);
    right = Math.max(right, j.x + pad);
    top = Math.min(top, j.y - pad);
    bottom = Math.max(bottom, j.y + pad);
  }
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
}

function paintFish(cc: CanvasRenderingContext2D, id: string): void {
  const species = fishSpecies(id);
  if (!species) return;
  const mini = makeTank(PX * 2, PX * 2);
  const posed = new Fish(species, mini, () => 0.5, { x: PX, y: mini.floor - PX * 0.55 });
  posed.heading = 0;
  posed.spine.replant(posed.x, posed.y, 0);
  // Roomy on purpose: the crop below finds the real edges.
  const box = jointsBox(posed.spine.joints, posed.length * 0.5);
  const zoom = Math.min((PX * 1.8) / Math.max(1, box.w), (PX * 1.8) / Math.max(1, box.h));
  cc.setTransform(zoom, 0, 0, zoom, PX - box.cx * zoom, PX - box.cy * zoom);
  drawFish(cc, posed, 0, { tank: mini, clock: 0, moods: false });
  cc.setTransform(1, 0, 0, 1, 0, 0);
}

function paintCritter(cc: CanvasRenderingContext2D, id: string): void {
  const species = critterSpecies(id);
  if (!species) return;
  const mini = makeVivarium(PX * 2, PX * 2);
  const posed = new Critter(species, mini, () => 0.5, { x: PX, y: mini.floor + PX * 0.2 });
  posed.heading = 0;
  posed.spine.replant(posed.bodyX, posed.bodyY, 0);
  const box = jointsBox(posed.spine.joints, posed.length * 0.6);
  const zoom = Math.min((PX * 1.8) / Math.max(1, box.w), (PX * 1.8) / Math.max(1, box.h));
  cc.setTransform(zoom, 0, 0, zoom, PX - box.cx * zoom, PX - box.cy * zoom);
  drawCritter(cc, posed, 0, { viv: mini, clock: 0, moods: false });
  cc.setTransform(1, 0, 0, 1, 0, 0);
}

/** The box that holds every pixel that was painted, or null for an empty canvas. */
function paintedBox(cc: CanvasRenderingContext2D, size: number): { x: number; y: number; w: number; h: number } | null {
  let data: Uint8ClampedArray;
  try {
    data = cc.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
  let left = size;
  let right = -1;
  let top = size;
  let bottom = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3]! > 12) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

const cache = new Map<string, HTMLCanvasElement>();

/** The animal's picture on a square canvas, or an empty one when canvas cannot draw (tests). */
function master(key: string): HTMLCanvasElement {
  const found = cache.get(key);
  if (found) return found;
  const size = PX * 2;
  const out = h('canvas', { width: size, height: size });
  cache.set(key, out);
  const kind = kindByKey(key);
  const scratch = h('canvas', { width: size, height: size });
  const sc = scratch.getContext('2d');
  const oc = out.getContext('2d');
  if (!sc || !oc || !kind) return out;
  try {
    if (kind.family === 'aq') paintFish(sc, kind.id);
    else paintCritter(sc, kind.id);
    const box = paintedBox(sc, size);
    if (box) {
      const scale = Math.min((size * FILL) / box.w, (size * FILL) / box.h);
      oc.drawImage(scratch, box.x, box.y, box.w, box.h, (size - box.w * scale) / 2, (size - box.h * scale) / 2, box.w * scale, box.h * scale);
    } else {
      oc.drawImage(scratch, 0, 0);
    }
  } catch {
    /* a picture that fails to draw is a blank tile, not a broken book */
  }
  return out;
}

/** A fresh canvas element showing the animal (a copy of the drawn master). */
export function portrait(key: string, cls = 'hb-art', side = 128): HTMLCanvasElement {
  const src = master(key);
  const art = h('canvas', { class: cls, width: side, height: side });
  const cc = art.getContext('2d');
  if (cc && src.width) cc.drawImage(src, 0, 0, side, side);
  return art;
}
