import { h } from '../../core/dom';
import { onPerfChange, perf, startLoop } from '../../core/frame';
import { pickDpr } from '../../core/quality';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  Creature,
  applySave,
  makePlants,
  makeDecor,
  makeRocks,
  makeTank,
  readSave,
  savedStock,
  sheltersFrom,
  stocking,
} from './logic';
import { bindControls } from './controls';
import { bindInput } from './input';
import { bakeCaustics, createLight } from './light';
import { load } from './persist';
import { createPicker } from './picker';
import { draw } from './render';
import { step } from './sim';
import { createState, maxBubbles } from './state';
import './style.css';

/** Frames between two caustic bakes: the light moves, but not on every single frame. */
const CAUSTIC_EVERY = 3;
/** Longest frame the simulation will take in one step. */
const MAX_STEP = 0.05;

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
 * eaten is a star, marked by a bell rather than by confetti over the water.
 *
 * This file only wires the pieces: state.ts holds what changes, sim.ts steps it,
 * render.ts/light.ts/furniture.ts draw it, input.ts/controls.ts/picker.ts are
 * the child's hands, and persist.ts keeps the tank between visits.
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
  // Lights out. At night only the lamp on the lid lights anything.
  const lamp = h('button', { class: 'aquarium-lamp', type: 'button', 'aria-label': 'bật tắt đèn' }, '🌙');
  const root = h('div', { class: 'aquarium' }, canvas, feed, add, lamp, net);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  const s = createState({ root, canvas, feed, net, add, lamp });
  const light = createLight();

  /** Quality changed: re-fit the canvas to the new resolution in place. Nothing is rebuilt or reloaded. */
  function refit(): void {
    const w = root.clientWidth;
    const hgt = root.clientHeight;
    if (!w || !hgt) return;
    const next = pickDpr(window.devicePixelRatio || 1, 2, perf.low);
    if (next === s.dpr) return;
    s.dpr = next;
    canvas.width = Math.round(w * s.dpr);
    canvas.height = Math.round(hgt * s.dpr);
  }
  ctx.onCleanup(
    onPerfChange(() => {
      refit();
      if (s.bubbles.length > maxBubbles()) s.bubbles.length = maxBubbles();
    }),
  );

  function build(): void {
    const w = root.clientWidth;
    const hgt = root.clientHeight;
    if (!w || !hgt) return;
    const nextDpr = pickDpr(window.devicePixelRatio || 1, 2, perf.low);
    if (canvas.width === Math.round(w * nextDpr) && canvas.height === Math.round(hgt * nextDpr)) return;
    s.dpr = nextDpr;
    canvas.width = Math.round(w * s.dpr);
    canvas.height = Math.round(hgt * s.dpr);
    const tank = makeTank(w, hgt);
    s.tank = tank;
    light.causticPattern = null;
    s.plants = makePlants(tank);
    s.decor = makeDecor(tank);
    s.rocks = makeRocks(tank);
    // The sand line, as a handful of heights the floor is drawn through.
    s.sand = Array.from({ length: 9 }, (_, i) => tank.floor + Math.sin(i * 1.7) * tank.unit * 0.09);
    // Put the tank back the way the child left it, if they left one.
    const saved = readSave(load());
    if (saved) {
      applySave(saved, s.decor, s.plants, tank);
      s.night = saved.night === true;
      s.dusk = s.night ? 1 : 0;
      lamp.textContent = s.night ? '☀️' : '🌙';
      root.classList.toggle('aquarium-night', s.night);
    }
    s.creatures = (savedStock(saved) ?? stocking(tank)).map((species) => new Creature(species, tank));
    s.shelters = sheltersFrom(tank, s.plants, s.decor);
    s.bubbles.length = 0;
    s.foods = [];
    s.feeding = false;
    s.held = null;
    s.grabCandidate = null;
    s.grabFrom = null;
    root.classList.remove('aquarium-dragging');
    net.classList.remove('aquarium-net-over');
  }

  function loop(_now: number, dtMs: number): void {
    if (!s.alive) return;
    // No gap yet on the first frame (or the first after the tab was hidden).
    const dt = dtMs ? Math.min(MAX_STEP, dtMs / 1000) : 0.016;
    build();
    if (!c || !s.tank.w) return;
    if (s.frame % CAUSTIC_EVERY === 0) bakeCaustics(light, s.clock * 0.6);
    s.frame++;
    step(ctx, s, dt);
    draw(c, s, light);
  }

  const picker = createPicker(ctx, s);
  bindControls(ctx, s, picker);
  bindInput(ctx, s);

  const onResize = (): void => {
    // Force a rebuild on the next frame.
    canvas.width = 0;
  };
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    s.alive = false;
    picker.close();
    window.removeEventListener('resize', onResize);
  });

  build();
  startLoop(ctx, loop);
}

const game: GameModule = { ...meta, start };
export default game;
