import { SHAKE_SECONDS } from './logic';
import { drawBubbles, drawCreature, drawPlant, drawSand, drawWater } from './draw';
import { drawDecor } from './furniture';
import {
  drawCaustics,
  drawNight,
  drawRays,
  drawSandCaustics,
  drawSurface,
  type Light,
} from './light';
import type { State } from './state';

// ---- loose things in the water ----

function drawFood(g: CanvasRenderingContext2D, s: State): void {
  const { tank, foods } = s;
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

/**
 * Depth here is drawing order and haze, not motion. Sliding the layers against
 * each other did read as depth, but with a fixed tank there is nothing for the
 * camera to be moving *for*, and the nudge it took from the finger made the
 * whole scene twitch. Ordering alone carries it.
 */
export function draw(g: CanvasRenderingContext2D, s: State, light: Light): void {
  const { tank, dusk, dpr } = s;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // What the drawing code needs to know about right now. One of these per frame
  // rather than one per animal: with a tank full of fish that is a few hundred
  // throwaway objects a second.
  const view = { tank, clock: s.clock };
  drawWater(g, tank);
  // The sun does not shine at night.
  if (dusk < 0.98) {
    g.save();
    g.globalAlpha = 1 - dusk;
    drawRays(g, s);
    g.restore();
  }
  for (const d of s.decor) if (d.layer === 'far') drawDecor(g, s, d);
  // Distance haze, so the castle does not look like it stands among the fish.
  // A pale blue veil at a tenth: the old one was a quarter of a grey-teal over
  // the whole tank, which is a lot of dirt to put on the water for one castle.
  g.fillStyle = 'rgba(125,211,252,0.13)';
  g.fillRect(0, 0, tank.w, tank.h);
  drawSand(g, tank, s.sand, s.rocks);
  drawSandCaustics(g, s, light);
  // Every plant goes behind the animals: a weed in front of a fish for no reason
  // reads as a mistake. What belongs in front is the near layer, in the corners.
  for (const plant of s.plants) drawPlant(g, plant, view, plant.shake / SHAKE_SECONDS);
  for (const d of s.decor) if (d.layer === 'mid') drawDecor(g, s, d);
  drawFood(g, s);
  // The fish in the child's hand is drawn last, so it is never lost behind another.
  s.creatures.forEach((cr, i) => {
    if (!cr.held) drawCreature(g, cr, i, view);
  });
  drawBubbles(g, s.bubbles);
  for (const d of s.decor) if (d.layer === 'near') drawDecor(g, s, d);
  s.creatures.forEach((cr, i) => {
    if (cr.held) drawCreature(g, cr, i, view);
  });
  if (dusk < 0.98) {
    g.save();
    g.globalAlpha = 1 - dusk;
    drawCaustics(g, s, light);
    g.restore();
  }
  drawNight(g, s, light);
  drawSurface(g, s);
}
