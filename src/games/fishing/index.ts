import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { drawCreature, hash, smoothPath, type Scene } from '../aquarium/draw';
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
  PULL_SECONDS,
  ROD_X,
  aimCast,
  castHere,
  isSlipping,
  needsCast,
  reel,
  slip,
  tug,
  DRIFTERS,
  DREAD_REACH,
  STEAL_REACH,
  makeDrifters,
  nextVisit,
  planVisit,
  visitOver,
  makeRope,
  snaggedOn,
  stepDrifter,
  stepRope,
  tickSteady,
  type Drifter,
  type Rope,
  type Junk,
  replacement,
  settleHook,
  type Hook,
} from './logic';
import './style.css';

const MAX_STEP = 0.05;
const MAX_BUBBLES = 60;
/** How long the landed fish is held up for the child to look at. */
const SHOW_MS = 2600;

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
  // The moment the whole game is for: hold it up and say what it is.
  const banner = h('div', { class: 'fishing-catch', hidden: true });
  const root = h('div', { class: 'fishing' }, canvas, tally, reelBtn, banner);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  let alive = true;
  let dpr = 1;
  let tank: Tank = makeTank(1, 1);
  let fish: Creature[] = [];
  let plants: Plant[] = [];
  let drifters: Drifter[] = [];
  let line: Rope = [];
  /** The big thing crossing the lake right now, if anything is. */
  let monster: Creature | null = null;
  let monsterDir: 1 | -1 = 1;
  let untilVisit = 0;
  let sand: number[] = [];
  const bubbles: Bubble[] = [];
  let hook: Hook = makeHook(tank);
  let holding = false;
  /** When the bait was last moved, so its speed is measured against real time. */
  let lastDrag = 0;
  /** Dropping the line back in, after the cast button. */
  let casting = false;
  let caught = 0;
  let clock = 0;
  /** The fish just landed, held up out of the water for a look. */
  let trophy: Creature | null = null;
  /** …or the thing that was not a fish. */
  let trophyJunk: Junk | null = null;
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
    drifters = makeDrifters(tank);
    line = makeRope(tank.w * ROD_X, 0, tank.w * ROD_X, tank.h * 0.3);
    sand = Array.from({ length: 9 }, (_, i) => tank.floor + Math.sin(i * 1.7) * tank.unit * 0.09);
    fish = lakeStock(tank).map((species) => new Creature(species, tank));
    monster = null;
    untilVisit = nextVisit() * 0.5;
    // Some are hungry and some are not, so the lake has to be read rather than
    // simply dredged: a fish that has just eaten will look at a bait and swim on.
    for (const cr of fish) cr.hunger = Math.random();
    hook = makeHook(tank);
    line = makeRope(tank.w * ROD_X, 0, hook.x, hook.y);
    bubbles.length = 0;
    holding = false;
    casting = false;
    trophy = null;
    trophyJunk = null;
    showing = 0;
  }

  // No mood faces here: in a lake full of bait a row of little shrimps over the
  // fish reads as more bait, not as hunger.
  const scene = (): Scene => ({ tank, clock, moods: false });

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
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = Math.max(1.5, tank.unit * 0.02);
    g.lineCap = 'round';
    g.beginPath();
    // Through the knots of the rope, so the line sags and swings as it is worked.
    smoothPath(g, line);
    g.stroke();

    const r = tank.unit * 0.2;
    const jerking = isJerking(hook, tank);
    // A hook is a J of wire: a shank down from the line, a bend, and a point
    // coming back up. Drawn small, but the shape is what makes it a hook rather
    // than an orange dot on a string.
    const top = hook.y - r * 1.1;
    const bendY = hook.y + r * 0.5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(15,23,42,0.55)';
    g.lineWidth = Math.max(3, r * 0.42);
    for (const pass of ['shadow', 'metal'] as const) {
      if (pass === 'metal') {
        g.strokeStyle = '#e2e8f0';
        g.lineWidth = Math.max(1.6, r * 0.24);
      }
      g.beginPath();
      // The eye the line ties to.
      g.arc(hook.x, top, r * 0.2, 0, Math.PI * 2);
      g.moveTo(hook.x, top + r * 0.2);
      g.lineTo(hook.x, bendY);
      // The bend, and the point turning back up towards the barb.
      g.arc(hook.x + r * 0.42, bendY, r * 0.42, Math.PI, Math.PI * 2, true);
      g.lineTo(hook.x + r * 0.84, hook.y - r * 0.15);
      g.stroke();
    }
    // The barb.
    g.fillStyle = '#e2e8f0';
    g.beginPath();
    g.moveTo(hook.x + r * 0.84, hook.y - r * 0.2);
    g.lineTo(hook.x + r * 1.15, hook.y + r * 0.25);
    g.lineTo(hook.x + r * 0.7, hook.y + r * 0.15);
    g.closePath();
    g.fill();

    if (hook.baited) {
      // A worm threaded on the shank, wriggling. It flushes red when the line is
      // being snatched about, which is the one warning the child has to read.
      const wriggle = jerking ? 3.4 : 1;
      g.strokeStyle = jerking ? '#f87171' : '#fb7185';
      g.lineWidth = Math.max(3, r * 0.5);
      g.beginPath();
      for (let i = 0; i <= 8; i++) {
        const along = i / 8;
        const wy = top + r * 0.35 + along * r * 1.25;
        const wx = hook.x + Math.sin(clock * 6 + along * 5) * r * 0.3 * wriggle;
        if (i === 0) g.moveTo(wx, wy);
        else g.lineTo(wx, wy);
      }
      g.stroke();
      // A pale belly down the worm, so it reads as an animal and not a rope.
      g.strokeStyle = jerking ? '#fecaca' : '#fda4af';
      g.lineWidth = Math.max(1.2, r * 0.18);
      g.stroke();
    }

    // Snagged on something: it hangs off the hook all the way up.
    if (hook.junk) {
      const size = Math.max(tank.unit * 0.7, 26);
      g.save();
      g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(hook.junk.emoji, hook.x, hook.y + size * 0.55);
      g.restore();
    }
  }

  /** The rubbish drifting through the water, which the bait must be steered around. */
  function drawDrifters(g: CanvasRenderingContext2D): void {
    const size = Math.max(tank.unit * 0.62, 24);
    g.save();
    g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const d of drifters) {
      g.save();
      g.translate(d.x, d.y);
      g.rotate(Math.sin(d.turn) * 0.35);
      g.globalAlpha = 0.92;
      g.fillText(d.junk.emoji, 0, 0);
      g.restore();
    }
    g.restore();
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
    drawDrifters(g);
    drawLine(g);
    fish.forEach((cr, i) => drawCreature(g, cr, i, view));
    // Drawn over everything: a shark going past is the biggest thing in the lake.
    if (monster) drawCreature(g, monster, 99, view);
    drawBubbles(g);
    drawSurface(g);
    // Above the water, so it is drawn after the surface rather than under it.
    if (trophyJunk) {
      const size = Math.max(tank.unit * 1.1, 44);
      g.save();
      g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(trophyJunk.emoji, tank.w * 0.5, tank.h * 0.13 + Math.sin(clock * 9) * size * 0.06);
      g.restore();
    }
    if (trophy) {
      trophy.hold(tank.w * 0.5, tank.h * 0.13);
      trophy.spine.follow(trophy.x, trophy.y, -Math.PI / 2 + Math.sin(clock * 18) * 0.3);
      drawCreature(g, trophy, 0, view);
    }
  }

  // ---- what passes through ----

  /**
   * Every so often something far too big crosses the lake. It cannot be caught:
   * it swims straight through, empties the water in front of it, takes the bait
   * if the bait is in the way, and is gone. Half the point is that the lake is
   * not always safe and the child cannot do anything about it but wait.
   */
  function visit(dt: number): void {
    if (!monster) {
      untilVisit -= dt;
      if (untilVisit > 0) return;
      const plan = planVisit(tank);
      monsterDir = plan.dir;
      monster = new Creature(plan.species, tank, Math.random, {
        x: plan.dir > 0 ? -tank.unit * 3 : tank.w + tank.unit * 3,
        y: plan.y,
      });
      monster.heading = plan.dir > 0 ? 0 : Math.PI;
      monster.spine.replant(monster.x, monster.y, monster.heading);
      ctx.audio.fx('roar');
      return;
    }

    // Straight across, at its own pace: this one is not steered by anything.
    const cruise = monster.species.speed * tank.unit;
    monster.x += monsterDir * cruise * dt;
    monster.y += Math.sin(clock * 0.9) * tank.unit * 0.25 * dt;
    monster.phase += dt * 5;
    monster.spine.follow(monster.x, monster.y, monsterDir > 0 ? 0 : Math.PI);

    // Everything small scatters out of its way.
    for (const cr of fish) {
      if (Math.hypot(cr.x - monster.x, cr.y - monster.y) < DREAD_REACH * tank.unit) {
        cr.startle(monster.x, monster.y, true);
      }
    }

    // The bait in its path is the bait gone.
    if (hook.baited && !hook.caught && !hook.junk) {
      if (Math.hypot(hook.x - monster.x, hook.y - monster.y) < STEAL_REACH * tank.unit) {
        hook.baited = false;
        hook.steady = 0;
        ctx.audio.chomp();
        navigator.vibrate?.(20);
        ctx.speak(`${monster.species.name} ăn mất mồi rồi!`);
        for (let i = 0; i < 6; i++) bubbles.push(makeBubble(hook.x, hook.y, tank));
      }
    }

    if (visitOver(monster, tank)) {
      monster = null;
      untilVisit = nextVisit();
    }
  }

  // ---- the catch ----

  /** Whatever was on the line has beaten the child back down and got away. */
  function escaped(): void {
    const lost = hook.caught;
    hook.caught = null;
    hook.junk = null;
    hook.baited = false;
    hook.pull = 0;
    if (lost) {
      lost.release();
      lost.startle(hook.x, hook.y);
    }
    ctx.audio.boing();
    navigator.vibrate?.(12);
    ctx.speak('Ối, sổng mất rồi! Thả câu lại nhé!');
    for (let i = 0; i < 6; i++) bubbles.push(makeBubble(hook.x, hook.y, tank));
  }

  /** A fish has taken the bait. */
  function hooked(cr: Creature): void {
    hook.caught = cr;
    hook.fightFrom = hook.y;
    hook.pull = PULL_SECONDS;
    cr.joy = 1.2;
    cr.feed();
    ctx.audio.pop(1.8);
    navigator.vibrate?.(18);
    ctx.speak('Cắn câu rồi! Bấm liên tục để kéo lên!');
    for (let i = 0; i < 5; i++) bubbles.push(makeBubble(hook.x, hook.y, tank));
  }

  /** Something that is not a fish comes up. Half the fun is that it is not one. */
  function landJunk(junk: Junk): void {
    hook.junk = null;
    hook.baited = false;
    trophyJunk = junk;
    trophy = null;
    banner.replaceChildren(h('span', { class: 'fishing-catch-emoji' }, junk.emoji), h('span', {}, junk.say));
    banner.hidden = false;
    showing = SHOW_MS / 1000;
    ctx.speak(junk.say);
    navigator.vibrate?.(15);
    if (junk.treasure) {
      ctx.audio.jingle();
      void ctx.celebrate().then(() => {
        if (alive) ctx.addStar();
      });
    } else {
      // A boot is a joke, not a failure: it gets a laugh, never a sad noise.
      ctx.audio.boing();
    }
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
    banner.replaceChildren(h('span', { class: 'fishing-catch-emoji' }, '🎉'), h('span', {}, cr.species.name));
    banner.hidden = false;
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
    if (showing === 0) {
      trophy = null;
      trophyJunk = null;
      banner.hidden = true;
    }
    // Something on the line has to be hauled, tug by tug. Stop tugging and it
    // takes the line back; let it take enough and it is gone.
    if (hook.caught || hook.junk) {
      if (hook.pull > 0) reel(hook, dt, tank, clock);
      else if (slip(hook, dt, tank)) escaped();
    } else if (casting && cast(hook, dt, tank)) casting = false;
    else if (!holding) settleHook(hook, dt);
    tickSteady(hook, dt, tank);

    visit(dt);
    stepRope(line, dt, { x: tank.w * ROD_X, y: 0 }, hook, tank);
    for (const d of drifters) stepDrifter(d, dt, tank);
    // Not everything down there is a fish, and it is all in plain sight: the
    // child steers the bait around the rubbish rather than waiting for a dice roll.
    if (!hook.caught && !hook.junk) {
      const fouled = snaggedOn(hook, drifters, tank);
      if (fouled) {
        hook.junk = fouled.junk;
        hook.fightFrom = hook.y;
        hook.pull = PULL_SECONDS;
        drifters = drifters.filter((d) => d !== fouled);
        ctx.audio.pop(0.6);
        navigator.vibrate?.(12);
        ctx.speak('Mắc phải rồi! Kéo lên xem nào!');
        for (let i = 0; i < 4; i++) bubbles.push(makeBubble(hook.x, hook.y, tank));
      }
    }

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

    if (isLanded(hook, tank)) {
      if (hook.caught) {
        const cr = hook.caught;
        cr.release();
        land(cr);
      } else if (hook.junk) {
        landJunk(hook.junk);
      }
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
    // The lake never runs out of rubbish either.
    if (drifters.length < DRIFTERS && Math.random() < dt * 0.25) {
      drifters.push(...makeDrifters(tank, 1));
    }

    // Last, so it answers to what this frame actually did: the same button hauls
    // whatever is on the line out, and then puts the line back in.
    const onTheLine = hook.caught !== null || hook.junk !== null;
    const wantsCast = needsCast(hook, tank) && !casting && showing === 0;
    reelBtn.hidden = !onTheLine && !wantsCast;
    reelBtn.textContent = onTheLine ? '🎣' : '⬇️';
    reelBtn.setAttribute('aria-label', onTheLine ? 'kéo cần lên' : 'thả câu xuống');
    // Slipping: the button flashes, which is the only warning a child needs.
    reelBtn.classList.toggle('fishing-slipping', isSlipping(hook));
    // Belt and braces: the canvas stops taking pointers at all during a fight.
    root.classList.toggle('fishing-fighting', onTheLine);
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
    // With something on the line the water is not a control any more: the fight
    // is the reel button and nothing else. A stray hand on the glass used to
    // drag the line about and lose the catch.
    if (hook.caught || hook.junk) return;
    ctx.hint.touch();
    casting = false;
    holding = true;
    lastDrag = 0;
    // With nothing on the line and no bait, dropping a finger in the water is the
    // child casting by hand. Anything else and the line would follow them about
    // with a bare hook, fishing for nothing.
    if (showing > 0) return;
    if (!hook.caught && !hook.junk && !hook.baited) {
      const p = at(e);
      castHere(hook, p.x, p.y, tank);
      ctx.audio.tick();
      ctx.speak('Thả câu nào!');
      return;
    }
    drag(e);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!holding || hook.caught || hook.junk) return;
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
    if (hook.caught || hook.junk) {
      // Every press is one heave on the rod: stop pressing and the fish wins.
      tug(hook);
      casting = false;
      return;
    }
    casting = true;
    aimCast(hook, tank);
    ctx.speak('Thả câu nào!');
  });

  ctx.hint.arm(() => {
    if (hook.caught || hook.junk || !reelBtn.hidden) {
      replay(reelBtn, 'anim-wiggle');
      ctx.speak(hook.caught || hook.junk ? 'Bấm liên tục để kéo lên!' : 'Thả câu lại nào!');
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
