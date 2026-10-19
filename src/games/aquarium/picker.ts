import { h } from '../../core/dom';
import type { GameContext } from '../../core/types';
import { drawCreature } from './draw';
import { Creature, MAX_CREATURES, SPECIES, crowdedOut, makeBubble, makeTank, type Species } from './logic';
import { save } from './persist';
import type { State } from './state';

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
function addFish(ctx: GameContext, s: State, species: Species): void {
  const { tank, bubbles } = s;
  ctx.hint.touch();
  // A full tank makes room for the new one rather than refusing it: the fish
  // that goes is one of whichever kind there are already most of.
  if (s.creatures.length >= MAX_CREATURES) {
    const goes = crowdedOut(s.creatures.map((cr) => cr.species.id));
    const leaving = s.creatures[goes >= 0 ? goes : 0];
    if (leaving) {
      s.creatures = s.creatures.filter((cr) => cr !== leaving);
      for (let i = 0; i < 4; i++) bubbles.push(makeBubble(leaving.x, leaving.y, tank));
    }
    ctx.audio.puff();
  }
  const fromLeft = Math.random() < 0.5;
  const cr = new Creature(species, tank, Math.random, {
    x: fromLeft ? -tank.unit : tank.w + tank.unit,
    y: tank.h * (0.25 + Math.random() * 0.45),
  });
  cr.heading = fromLeft ? 0 : Math.PI;
  cr.spine.replant(cr.x, cr.y, cr.heading);
  cr.joy = 1.4;
  s.creatures.push(cr);
  save(s);
  ctx.audio.pop(1.3);
  navigator.vibrate?.(10);
  ctx.speak(species.name);
  for (let i = 0; i < 3; i++) bubbles.push(makeBubble(cr.x, cr.y, tank));
}

export interface Picker {
  open(): void;
  /** Leaving the game takes an open picker with it. */
  close(): void;
}

/** Choosing a fish to add: one little picture per species, in a panel over the tank. */
export function createPicker(ctx: GameContext, s: State): Picker {
  /** One little picture per species, drawn once and kept for the picker. */
  const portraits = new Map<string, HTMLCanvasElement>();
  /** The open picker. */
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
      const keep = s.tank;
      // The crab stands on the sand, so give it one for the length of the drawing.
      s.tank = mini;
      // A creature's x is its head, not its middle, and every species is a
      // different size and shape. Fit the whole body to the button instead, so
      // a guppy is as easy to hit as a shark and nothing hangs off the edge.
      const box = bodyBox(posed);
      const zoom = Math.min((px * 1.7) / box.w, (px * 1.7) / box.h);
      cc.setTransform(zoom, 0, 0, zoom, px - box.cx * zoom, px - box.cy * zoom);
      drawCreature(cc, posed, 0, { tank: mini, clock: s.clock });
      cc.setTransform(1, 0, 0, 1, 0, 0);
      s.tank = keep;
    }
    portraits.set(species.id, art);
    return art;
  }

  /**
   * The picker. Choosing closes it, because the point of choosing a fish is
   * watching it swim in — which cannot be seen from behind a panel.
   */
  function open(): void {
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
      if (species) addFish(ctx, s, species);
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
    s.els.root.append(overlay);
    closePicker = () => finish(null);
    ctx.audio.tick();
  }

  return { open, close: () => closePicker?.() };
}
