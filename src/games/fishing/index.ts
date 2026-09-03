import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { drawCreature, hash, type Scene } from '../aquarium/draw';
import {
  Creature,
  SAVE_KEY,
  SMELL,
  makeBubble,
  makePlants,
  makeTank,
  readSave,
  trimStock,
  type Bubble,
  type Plant,
  type Tank,
} from '../aquarium/logic';
import { meta } from './meta';
import {
  BAIT_SMELL,
  CATCH_FOR_STAR,
  JERK_REACH,
  biter,
  isJerking,
  isLanded,
  lakeStock,
  cast,
  makeHook,
  moveHook,
  needsCast,
  reel,
  tickSteady,
  replacement,
  settleHook,
  type Hook,
} from './logic';
import './style.css';

const MAX_STEP = 0.05;
const MAX_BUBBLES = 60;
/** How long the landed fish is held up for the child to look at. */
const SHOW_MS = 1400;

/**
 * Câu cá: a line with a bait on it, and fish that come to it only if they are
 * hungry and only if it is being held still.
 *
 * The whole game is one idea — move slowly and the fish come, snatch at them and
 * they scatter — which is a lesson in patience that a two-year-old can feel
 * without anyone explaining it. Nothing is ever lost: a frightened fish comes
 * back, and the lake never runs out.
 *
 * A fish that is landed goes into the child's aquarium, so the two games are one
 * long game: catch a fish here, go and feed it there.
 */
function start(ctx: GameContext): void {
  const canvas = h('canvas', { class: 'fishing-canvas' });
  const tally = h('div', { class: 'fishing-tally' }, '🪣 0');
  // Reeling in by dragging the line all the way up is a long way for a small arm.
  // One button, two jobs: haul the line in with a fish on it, drop it back after.
  const reelBtn = h('button', { class: 'fishing-reel', type: 'button', 'aria-label': 'kéo cần lên' }, '🎣');
  const root = h('div', { class: 'fishing' }, canvas, tally, reelBtn);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  let alive = true;
  let dpr = 1;
  let tank: Tank = makeTank(1, 1);
  let fish: Creature[] = [];
  let plants: Plant[] = [];
  let sand: number[] = [];
  const bubbles: Bubble[] = [];
  let hook: Hook = makeHook(tank);
  let holding = false;
  /** When the bait was last moved, so its speed is measured against real time. */
  let lastDrag = 0;
  /** Winding the line in on its own, after the reel button. */
  let reeling = false;
  /** Dropping the line back in, after the cast button. */
  let casting = false;
  let caught = 0;
  let clock = 0;
  /** The fish just landed, held up out of the water for a look. */
  let trophy: Creature | null = null;
  let showing = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  }

  function build(): void {
    const w = root.clientWidth;
    const hgt = root.clientHeight;
    if (!w || !hgt) return;
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width === Math.round(w * nextDpr) && canvas.height === Math.round(hgt * nextDpr)) return;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    tank = makeTank(w, hgt);
    plants = makePlants(tank);
    sand = Array.from({ length: 9 }, (_, i) => tank.floor + Math.sin(i * 1.7) * tank.unit * 0.09);
    fish = lakeStock(tank).map((species) => new Creature(species, tank));
    // Some are hungry and some are not, so the lake has to be read rather than
    // simply dredged: a fish that has just eaten will look at a bait and swim on.
    for (const cr of fish) cr.hunger = Math.random();
    hook = makeHook(tank);
    bubbles.length = 0;
    holding = false;
    reeling = false;
    casting = false;
    trophy = null;
    showing = 0;
  }

  const scene = (): Scene => ({ tank, clock });

  // ---- the lake ----

  function drawWater(g: CanvasRenderingContext2D): void {
    const grad = g.createLinearGradient(0, 0, 0, tank.h);
    grad.addColorStop(0, '#7dd3fc');
    grad.addColorStop(0.5, '#0ea5e9');
    grad.addColorStop(1, '#075985');
    g.fillStyle = grad;
    g.fillRect(0, 0, tank.w, tank.h);
  }

  function drawSurface(g: CanvasRenderingContext2D): void {
    const top = tank.h * 0.05;
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.moveTo(0, top);
    for (let x = 0; x <= tank.w; x += 12) {
      g.lineTo(x, top + Math.sin(x * 0.02 + clock * 1.6) * tank.unit * 0.06);
    }
    g.lineTo(tank.w, 0);
    g.lineTo(0, 0);
    g.closePath();
    g.fill();
  }

  function drawSand(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#fcd9a0';
    g.beginPath();
    g.moveTo(0, tank.h);
    g.lineTo(0, sand[0] ?? tank.floor);
    sand.forEach((y, i) => g.lineTo((i / (sand.length - 1)) * tank.w, y));
    g.lineTo(tank.w, tank.h);
    g.closePath();
    g.fill();
  }

  function drawPlant(g: CanvasRenderingContext2D, plant: Plant): void {
    for (let b = 0; b < plant.blades; b++) {
      const lean = (b - (plant.blades - 1) / 2) * 0.22;
      const base = plant.x + lean * plant.w * 3;
      const tall = plant.h * (0.7 + hash(plant.x, b) * 0.5);
      g.beginPath();
      g.moveTo(base - plant.w, tank.floor + tank.unit * 0.1);
      for (let s = 0; s <= 6; s++) {
        const along = s / 6;
        const wave = Math.sin(clock * plant.sway * 2 + plant.phase + b + along * 2.4) * tank.unit * 0.28 * along * along;
        g.lineTo(base + wave - plant.w * (1 - along), tank.floor + tank.unit * 0.1 - tall * along);
      }
      for (let s = 6; s >= 0; s--) {
        const along = s / 6;
        const wave = Math.sin(clock * plant.sway * 2 + plant.phase + b + along * 2.4) * tank.unit * 0.28 * along * along;
        g.lineTo(base + wave + plant.w * (1 - along), tank.floor + tank.unit * 0.1 - tall * along);
      }
      g.closePath();
      g.fillStyle = `hsl(${plant.hue} 65% ${28 + b * 6}%)`;
      g.fill();
    }
  }

  /** The line, and the bait on the end of it. */
  function drawLine(g: CanvasRenderingContext2D): void {
    const fromX = tank.w * 0.5;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = Math.max(1.5, tank.unit * 0.02);
    g.beginPath();
    g.moveTo(fromX, 0);
    // A slack line bows towards the bait rather than ruling a straight edge.
    g.quadraticCurveTo((fromX + hook.x) / 2, hook.y * 0.55, hook.x, hook.y);
    g.stroke();

    if (!hook.baited) return;
    const r = tank.unit * 0.18;
    // Jerked about, the bait flashes red: the one thing the child must notice.
    const jerking = isJerking(hook, tank);
    g.fillStyle = jerking ? '#f87171' : '#fb923c';
    g.beginPath();
    g.arc(hook.x, hook.y, r * (jerking ? 1.25 : 1), 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,53,15,0.6)';
    g.lineWidth = Math.max(1, tank.unit * 0.02);
    g.beginPath();
    g.arc(hook.x, hook.y + r * 0.5, r * 0.6, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  }

  function drawBubbles(g: CanvasRenderingContext2D): void {
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (const b of bubbles) {
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fill();
    }
  }

  function draw(g: CanvasRenderingContext2D): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // One of these per frame rather than one per animal: with a tank full of
    // fish that is a few hundred throwaway objects a second.
    const view = scene();
    drawWater(g);
    drawSand(g);
    for (const plant of plants) drawPlant(g, plant);
    drawLine(g);
    fish.forEach((cr, i) => drawCreature(g, cr, i, view));
    drawBubbles(g);
    drawSurface(g);
    // Above the water, so it is drawn after the surface rather than under it.
    if (trophy) {
      trophy.hold(tank.w * 0.5, tank.h * 0.13);
      trophy.spine.follow(trophy.x, trophy.y, -Math.PI / 2 + Math.sin(clock * 18) * 0.3);
      drawCreature(g, trophy, 0, view);
    }
  }

  // ---- the catch ----

  /** A fish has taken the bait. */
  function hooked(cr: Creature): void {
    hook.caught = cr;
    cr.joy = 1.2;
    cr.feed();
    ctx.audio.pop(1.8);
    navigator.vibrate?.(18);
    ctx.speak('Cắn câu rồi! Kéo lên nào!');
    for (let i = 0; i < 5; i++) bubbles.push(makeBubble(hook.x, hook.y, tank));
  }

  /** Add one fish to the tank the child keeps in Bể cá. */
  function intoTheTank(cr: Creature): void {
    try {
      const save = readSave(localStorage.getItem(SAVE_KEY)) ?? { v: 1 as const, fish: [], decor: [], plants: [] };
      // A full tank makes room rather than turning the catch away: the fish the
      // child just landed is the one they want to go and look at.
      save.fish = trimStock([...save.fish, cr.species.id]);

      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      /* storage blocked: the catch still counts, it just does not travel */
    }
  }

  /** Lifted clear of the water: a look at it, then it goes home to the tank. */
  function land(cr: Creature): void {
    hook.caught = null;
    // The catch took the bait with it.
    hook.baited = false;
    fish = fish.filter((other) => other !== cr);
    // Held up out of the water for a moment: this is the bit the child is here for.
    trophy = cr;
    caught++;
    showing = SHOW_MS / 1000;
    tally.textContent = `🪣 ${caught}`;
    replay(tally, 'anim-bounce');
    ctx.audio.ding();
    navigator.vibrate?.(20);
    ctx.speak(`${cr.species.name} về bể rồi!`);
    intoTheTank(cr);
    // The lake stays full, so there is always another one to try for.
    later(() => {
      if (!alive) return;
      const fresh = new Creature(replacement(), tank, Math.random, {
        x: Math.random() < 0.5 ? -tank.unit : tank.w + tank.unit,
        y: tank.h * (0.25 + Math.random() * 0.45),
      });
      fresh.hunger = 0.3 + Math.random() * 0.7;
      fish.push(fresh);
    }, SHOW_MS);
    if (caught % CATCH_FOR_STAR === 0) {
      void ctx.celebrate().then(() => {
        if (alive) ctx.addStar();
      });
    }
  }

  // ---- one frame ----

  function step(dt: number): void {
    clock += dt;
    showing = Math.max(0, showing - dt);
    if (showing === 0) trophy = null;
    if (reeling) reel(hook, dt, tank);
    else if (casting && cast(hook, dt, tank)) casting = false;
    else if (!holding) settleHook(hook, dt);
    tickSteady(hook, dt, tank);

    // Whoever has their mouth on a bait that is being held still is on the line.
    // Checked before anybody moves, so the fish is still hungry when it bites —
    // a moment later it has the bait in its mouth and is a fed fish, not a catch.
    if (!hook.caught) {
      const bite = biter(hook, fish, tank);
      if (bite) hooked(bite);
    }

    // The bait is a flake that never sinks, and it carries further than food does:
    // that is what makes a lake worth fishing.
    // No bait, no reason for anybody to come: the water is just water again.
    const bait =
      hook.caught || !hook.baited ? [] : [{ x: hook.x, y: hook.y, fall: 0, wobble: 0, eaten: false, bait: true }];
    const world = { foods: bait, nudge: null, neighbours: fish, smell: BAIT_SMELL / SMELL };
    for (const cr of fish) {
      if (cr === hook.caught) {
        // On the line: it goes where the bait goes, wriggling.
        cr.hold(hook.x, hook.y);
        cr.update(dt, tank, world, Math.random);
        continue;
      }
      cr.update(dt, tank, world, Math.random);
      // Snatching the bait about frightens whoever was coming for it.
      if (isJerking(hook, tank) && Math.hypot(cr.x - hook.x, cr.y - hook.y) < JERK_REACH * tank.unit) {
        cr.startle(hook.x, hook.y);
      }
    }

    if (hook.caught && isLanded(hook, tank)) {
      const cr = hook.caught;
      cr.release();
      reeling = false;
      land(cr);
    }

    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]!;
      b.y -= b.rise * dt;
      b.wobble += dt * 3;
      b.x += Math.sin(b.wobble) * tank.unit * 0.5 * dt;
      if (b.y + b.r < 0) bubbles.splice(i, 1);
    }
    if (Math.random() < dt * 1.5 && bubbles.length < MAX_BUBBLES) {
      bubbles.push(makeBubble(tank.w * Math.random(), tank.floor, tank));
    }

    // Last, so it answers to what this frame actually did: the same button hauls
    // a fish out and then puts the line back in.
    const wantsCast = needsCast(hook, tank) && !casting;
    reelBtn.hidden = hook.caught === null && !wantsCast;
    reelBtn.textContent = hook.caught ? '🎣' : '⬇️';
    reelBtn.setAttribute('aria-label', hook.caught ? 'kéo cần lên' : 'thả câu xuống');
  }

  let raf = 0;
  let last = 0;
  function loop(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(MAX_STEP, (now - last) / 1000) : 0.016;
    last = now;
    build();
    if (!c || !tank.w) return;
    step(dt);
    draw(c);
  }

  // ---- the child ----

  function at(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? tank.w / rect.width : 1;
    const sy = rect.height ? tank.h / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  /** Move the bait, measuring how fast against the clock rather than a guess. */
  function drag(e: PointerEvent): void {
    const now = Date.now();
    const dt = lastDrag ? Math.min(0.2, Math.max(1 / 240, (now - lastDrag) / 1000)) : 1 / 60;
    lastDrag = now;
    const p = at(e);
    moveHook(hook, p.x, p.y, dt, tank);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    // Taking hold of the line again is the child overruling the reel.
    reeling = false;
    casting = false;
    holding = true;
    lastDrag = 0;
    drag(e);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!holding) return;
    drag(e);
  });

  const release = (): void => {
    holding = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  reelBtn.hidden = true;
  reelBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    holding = false;
    replay(reelBtn, 'anim-bounce');
    ctx.audio.tick();
    if (hook.caught) {
      reeling = true;
      casting = false;
      return;
    }
    reeling = false;
    casting = true;
    ctx.speak('Thả câu nào!');
  });

  ctx.hint.arm(() => {
    if (hook.caught || !reelBtn.hidden) {
      replay(reelBtn, 'anim-wiggle');
      ctx.speak(hook.caught ? 'Kéo lên nào!' : 'Thả câu lại nào!');
      return;
    }
    const hungry = fish.find((cr) => cr.mood === 'hungry');
    if (hungry) {
      // Nudge the bait towards a fish that is looking for something to eat.
      hook.x += Math.sign(hungry.x - hook.x) * tank.unit * 0.2;
      for (let i = 0; i < 2; i++) bubbles.push(makeBubble(hook.x, hook.y, tank));
    }
  });

  const onResize = (): void => {
    canvas.width = 0;
  };
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    window.removeEventListener('resize', onResize);
    for (const t of timers) clearTimeout(t);
    timers.clear();
    if (raf) cancelAnimationFrame(raf);
  });

  build();
  ctx.speak(meta.intro);
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
}

const game: GameModule = { ...meta, start };
export default game;
