/**
 * The two water homes — the fresh-water tank and the sea — on the aquarium's own
 * engine (state, simulation, light, drawing and the finger on the glass). What is
 * new here is only what a tank needs to be one of several: who may live in it,
 * the furniture the child adds, and a tint for the sea. The tank is kept in the
 * older game's own format, under this game's own key.
 */
import { h } from '../../core/dom';
import { onPerfChange, perf, startLoop } from '../../core/frame';
import { aliasKey, readRaw, writeJson } from '../../core/save';
import { pickDpr } from '../../core/quality';
import { bindInput } from '../aquarium/input';
import { bakeCaustics, createLight } from '../aquarium/light';
import { save as saveTank } from '../aquarium/persist';
import { draw } from '../aquarium/render';
import { step } from '../aquarium/sim';
import { createState, maxBubbles } from '../aquarium/state';
import {
  Creature,
  MAX_CREATURES,
  POKE_SECONDS,
  addFood,
  applySave,
  crowdedOut,
  makeBubble,
  makeDecor,
  makePlants,
  makeRocks,
  makeTank,
  readSave,
  sheltersFrom,
  type Decor,
  type Plant,
  type Tank,
} from '../aquarium/logic';
import { speciesById } from '../aquarium/species';
import { STARTER_TANK, kindByKey } from './catalog';
import { DECOR_BY_REALM, DECOR_LOOK, MAX_EXTRAS, type DecorId } from './decor';
import { LEGACY_TANK_KEY, WORLD_KEY, type HabitatSave } from './save';
import type { ChildContext, Scene } from './scene';
import type { WorldId } from './worlds';
import '../aquarium/style.css';

const CAUSTIC_EVERY = 3;
const MAX_STEP = 0.05;
/** How soon after a press the next handful goes in: only enough to keep one press from counting twice. */
const FEED_EVERY = 0.5;

export interface WaterOptions {
  world: 'fresh' | 'sea';
  save: HabitatSave;
  /** Persist the book after the scene changed something in it. */
  persist(): void;
  /** Animals that were just caught: they swim in rather than being there already. */
  arrivals: string[];
}

/** A tank that has never been opened starts with a few of the first friends. */
export function seedTank(world: 'fresh' | 'sea'): void {
  if (readRaw(WORLD_KEY[world]) !== null) return;
  writeJson(WORLD_KEY[world], { v: 1, fish: [...STARTER_TANK[world]], decor: [], plants: [], night: false });
}

/** A plant the child planted: any of the generated ones, moved to `x`. */
function newPlant(tank: Tank, x: number): Plant {
  const base = makePlants(tank)[0]!;
  return { ...base, x, h: tank.unit * (1.6 + Math.random() * 2), hue: 110 + Math.random() * 70, phase: Math.random() * 6.28, shake: 1 };
}

function newDecor(kind: Decor['kind'], tank: Tank, x: number): Decor {
  const look = DECOR_LOOK[kind];
  const shrink = Math.max(0.55, Math.min(1, tank.w / 720));
  return { kind, size: look.size * shrink, layer: look.layer, x, phase: Math.random() * 6.28, hue: Math.random(), poke: POKE_SECONDS, open: false };
}

export function createWater(ctx: ChildContext, opts: WaterOptions): Scene {
  const { world, save } = opts;
  const worldId: WorldId = world;
  seedTank(world);
  // The engine reads and writes the older game's key; here that is this home's own.
  const release = aliasKey(LEGACY_TANK_KEY, WORLD_KEY[world]);

  const canvas = h('canvas', { class: 'aquarium-canvas' });
  const net = h('div', { class: 'aquarium-net', 'aria-hidden': 'true' }, '🪣');
  const tint = h('div', { class: `hb-tint hb-tint-${world}`, 'aria-hidden': 'true' });
  const root = h('div', { class: `aquarium hb-water hb-water-${world}` }, canvas, tint, net);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  // The engine wants its three round buttons; this game keeps them in its own toolbar.
  const idle = (): HTMLButtonElement => document.createElement('button');
  const s = createState({ root, canvas, feed: idle(), net, add: idle(), lamp: idle() });
  const light = createLight();
  let baseDecor = 0;
  let basePlants = 0;
  let pending = [...opts.arrivals];

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
    onPerfChange((low) => {
      root.classList.toggle('hb-low', low);
      refit();
      if (s.bubbles.length > maxBubbles()) s.bubbles.length = maxBubbles();
    }),
  );
  root.classList.toggle('hb-low', perf.low);

  /** Where the furniture the child added is now, written into the book. */
  function flush(): void {
    if (!s.tank.w) return;
    save.extras[world] = {
      plants: s.plants.slice(basePlants).map((p) => Math.min(1, Math.max(0, p.x / s.tank.w))),
      decor: s.decor.slice(baseDecor).map((d) => ({ k: d.kind, x: Math.min(1, Math.max(0, d.x / s.tank.w)) })),
    };
    opts.persist();
  }

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
    let plants = makePlants(tank);
    let decor = makeDecor(tank);
    if (world === 'sea') {
      // The sea has fewer weeds and no pond furniture.
      plants = plants.filter((_, i) => i % 2 === 0);
      decor = decor.filter((d) => DECOR_BY_REALM.sea.includes(d.kind));
    }
    s.plants = plants;
    s.decor = decor;
    s.rocks = makeRocks(tank);
    s.sand = Array.from({ length: 9 }, (_, i) => tank.floor + Math.sin(i * 1.7) * tank.unit * 0.09);
    const saved = readSave(readRaw(LEGACY_TANK_KEY));
    if (saved) {
      applySave(saved, s.decor, s.plants, tank);
      s.night = saved.night === true;
      s.dusk = s.night ? 1 : 0;
      root.classList.toggle('aquarium-night', s.night);
    }
    baseDecor = s.decor.length;
    basePlants = s.plants.length;
    const extras = save.extras[world];
    for (const x of extras.plants) s.plants.push(newPlant(tank, x * tank.w));
    for (const d of extras.decor) s.decor.push(newDecor(d.k, tank, d.x * tank.w));
    for (const d of s.decor) d.poke = 0;
    for (const p of s.plants) p.shake = 0;

    const ids = [...(saved ? saved.fish : STARTER_TANK[world])];
    // Whoever has just been caught is not "already there": they swim in below.
    for (const key of pending) {
      const at = ids.indexOf(kindByKey(key)?.id ?? '');
      if (at >= 0) ids.splice(at, 1);
    }
    s.creatures = ids.flatMap((id) => {
      const species = speciesById(id);
      return species ? [new Creature(species, tank)] : [];
    });
    s.shelters = sheltersFrom(tank, s.plants, s.decor);
    s.bubbles.length = 0;
    s.foods = [];
    s.feeding = false;
    s.held = null;
    s.grabCandidate = null;
    s.grabFrom = null;
    root.classList.remove('aquarium-dragging');
    net.classList.remove('aquarium-net-over');
    const arrivals = pending;
    pending = [];
    for (const key of arrivals) addFriend(key, true);
  }

  function loop(_now: number, dtMs: number): void {
    if (!s.alive) return;
    const dt = dtMs ? Math.min(MAX_STEP, dtMs / 1000) : 0.016;
    build();
    if (!c || !s.tank.w) return;
    if (s.frame % CAUSTIC_EVERY === 0) bakeCaustics(light, s.clock * 0.6);
    s.frame++;
    step(ctx, s, dt);
    draw(c, s, light);
  }

  bindInput(ctx, s);
  const onResize = (): void => {
    flush();
    canvas.width = 0;
  };
  window.addEventListener('resize', onResize);
  // Where things were left is worth keeping even if the page is closed mid-game.
  let tick = 0;
  ctx.onCleanup(() => {
    s.alive = false;
    window.removeEventListener('resize', onResize);
    clearInterval(tick);
  });
  tick = window.setInterval(flush, 6000);

  build();
  startLoop(ctx, loop);

  function addFriend(key: string, quiet = false): void {
    const kind = kindByKey(key);
    const species = kind && speciesById(kind.id);
    if (!species || !s.tank.w) return;
    const { tank, bubbles } = s;
    if (s.creatures.length >= MAX_CREATURES) {
      const goes = crowdedOut(s.creatures.map((cr) => cr.species.id));
      const leaving = s.creatures[goes >= 0 ? goes : 0];
      if (leaving) {
        s.creatures = s.creatures.filter((cr) => cr !== leaving);
        for (let i = 0; i < 4; i++) bubbles.push(makeBubble(leaving.x, leaving.y, tank));
      }
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
    saveTank(s);
    if (!quiet) {
      ctx.audio.pop(1.3);
      navigator.vibrate?.(10);
    }
    for (let i = 0; i < 3; i++) bubbles.push(makeBubble(cr.x, cr.y, tank));
  }

  /** The spot along the sand with the most room around it. */
  function roomyX(): number {
    const { tank } = s;
    const taken = [...s.plants.map((p) => p.x), ...s.decor.map((d) => d.x)];
    const edge = tank.unit * 0.9;
    let best = tank.w / 2;
    let bestGap = -1;
    for (let i = 0; i < 8; i++) {
      const x = edge + Math.random() * Math.max(1, tank.w - edge * 2);
      const gap = taken.reduce((m, t) => Math.min(m, Math.abs(t - x)), Infinity);
      if (gap > bestGap) {
        bestGap = gap;
        best = x;
      }
    }
    return best;
  }

  return {
    world: worldId,
    canDecor: true,
    hasTank: true,
    stage: root,
    destroy() {
      flush();
      s.alive = false;
      ctx.dispose();
      release();
      root.remove();
    },
    feed() {
      if (!s.tank.w || s.clock - s.lastFed < FEED_EVERY) return;
      s.lastFed = s.clock;
      const first = s.foods.length === 0;
      s.feeding = true;
      s.foods = addFood(s.foods, s.tank);
      ctx.audio.tick();
      if (first) ctx.speak('Cho cá ăn nào!', { rate: 0.8 });
    },
    toggleNight() {
      s.night = !s.night;
      root.classList.toggle('aquarium-night', s.night);
      ctx.audio.tick();
      ctx.speak(s.night ? 'Tắt đèn, ngủ ngon nhé!' : 'Trời sáng rồi!', { rate: 0.8 });
      for (const cr of s.creatures) cr.joy = 1;
      saveTank(s);
      return s.night;
    },
    isNight: () => s.night,
    special() {
      /* fishing is its own place: the toolbar takes the child there */
    },
    addFriend: (key) => addFriend(key),
    addDecor(id: DecorId) {
      const { tank } = s;
      if (!tank.w || !DECOR_BY_REALM[world].includes(id)) return false;
      const x = roomyX();
      if (id === 'plant') {
        if (s.plants.length - basePlants >= MAX_EXTRAS) s.plants.splice(basePlants, 1);
        s.plants.push(newPlant(tank, x));
      } else {
        if (s.decor.length - baseDecor >= MAX_EXTRAS) s.decor.splice(baseDecor, 1);
        s.decor.push(newDecor(id, tank, x));
      }
      s.shelters = sheltersFrom(tank, s.plants, s.decor);
      for (let i = 0; i < 6; i++) s.bubbles.push(makeBubble(x + (Math.random() - 0.5) * tank.unit, tank.floor, tank));
      ctx.audio.pop(1.1);
      navigator.vibrate?.(10);
      saveTank(s);
      flush();
      return true;
    },
    clearExtras() {
      s.plants.length = Math.min(s.plants.length, basePlants);
      s.decor.length = Math.min(s.decor.length, baseDecor);
      s.shelters = sheltersFrom(s.tank, s.plants, s.decor);
      saveTank(s);
      flush();
    },
    flush,
    living: () => s.creatures.map((cr) => `aq:${cr.species.id}`),
  };
}
