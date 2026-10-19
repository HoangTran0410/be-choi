import { h, replay } from '../../core/dom';
import type { Point } from '../../core/creature';
import type { GameContext } from '../../core/types';
import {
  INTEREST_SECONDS,
  SHAKE_SECONDS,
  STAR_EVERY_TAP,
  decorAt,
  makeBubble,
  plantAt,
  pokeDecor,
  sheltersFrom,
  type Creature,
} from './logic';
import { save } from './persist';
import { maxBubbles, type State } from './state';

/** How far a finger must travel before a tap on a fish becomes a grab. */
const GRAB_SLOP = 14;

function at(s: State, e: PointerEvent): Point {
  const { tank } = s;
  const rect = s.els.canvas.getBoundingClientRect();
  const sx = rect.width ? tank.w / rect.width : 1;
  const sy = rect.height ? tank.h / rect.height : 1;
  return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
}

function greet(ctx: GameContext, s: State, cr: Creature, p: Point): void {
  const { tank } = s;
  cr.startle(p.x, p.y);
  ctx.audio.pop(1.2);
  navigator.vibrate?.(10);
  ctx.speak(cr.species.name);
  for (let i = 0; i < 4; i++) s.bubbles.push(makeBubble(cr.x, cr.y, tank));
  s.taps++;
  if (s.taps % STAR_EVERY_TAP === 0) {
    ctx.addStar();
    ctx.audio.jingle();
    const star = h('div', { class: 'aquarium-star', style: `left:${(cr.x / tank.w) * 100}%;top:${(cr.y / tank.h) * 100}%` }, '⭐');
    s.els.root.append(star);
    setTimeout(() => star.remove(), 900);
  }
}

/** Is the finger over the net in the corner? */
function overNet(s: State, e: PointerEvent): boolean {
  const r = s.els.net.getBoundingClientRect();
  const pad = r.width * 0.35;
  return e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
}

function nearestTo(s: State, x: number, y: number): Creature | null {
  let best: Creature | null = null;
  let bestAway = Infinity;
  for (const cr of s.creatures) {
    const away = Math.hypot(cr.x - x, cr.y - y);
    if (away < bestAway) {
      bestAway = away;
      best = cr;
    }
  }
  return best;
}

/** Everything a poke does, wherever it lands. */
function poke(ctx: GameContext, s: State, p: Point): void {
  const { tank, bubbles } = s;
  const d = decorAt(s.decor, p.x, p.y, tank);
  if (d) {
    pokeDecor(d);
    s.interest = { x: d.x, y: tank.floor - d.size * tank.unit * 0.5, life: INTEREST_SECONDS };
    ctx.audio.pop(d.kind === 'chest' ? 1.6 : 0.9);
    navigator.vibrate?.(10);
    const n = d.kind === 'chest' ? 7 : 4;
    for (let i = 0; i < n; i++) {
      bubbles.push(makeBubble(d.x + (Math.random() - 0.5) * d.size * tank.unit, tank.floor - d.size * tank.unit * 0.6, tank));
    }
    // A hoop is an invitation: the nearest fish is sent through it.
    if (d.kind === 'hoop') {
      const guest = nearestTo(s, d.x, tank.floor - d.size * tank.unit * 0.6);
      if (guest) guest.joy = 2;
    }
    return;
  }
  const plant = plantAt(s.plants, p.x, p.y, tank);
  if (plant) {
    plant.shake = SHAKE_SECONDS;
    s.interest = { x: plant.x, y: tank.floor - plant.h * 0.6, life: INTEREST_SECONDS };
    ctx.audio.tick();
    for (let i = 0; i < 3; i++) bubbles.push(makeBubble(plant.x, tank.floor - plant.h * Math.random(), tank));
    return;
  }
  if (p.y > tank.floor - tank.unit * 0.3) {
    // The sand: a puff, and every plant near the hand waves.
    ctx.audio.puff();
    for (const near of s.plants) if (Math.abs(near.x - p.x) < tank.unit * 1.4) near.shake = SHAKE_SECONDS * 0.6;
    for (let i = 0; i < 5; i++) bubbles.push(makeBubble(p.x + (Math.random() - 0.5) * tank.unit, tank.floor, tank));
    return;
  }
  ctx.audio.tick();
  for (let i = 0; i < 3; i++) bubbles.push(makeBubble(p.x, p.y, tank));
}

/** Lift a fish out of the water into the child's fingers. */
function grab(ctx: GameContext, s: State, cr: Creature, p: Point): void {
  const { tank } = s;
  s.held = cr;
  cr.hold(p.x, p.y);
  s.els.root.classList.add('aquarium-dragging');
  ctx.audio.pop(1.7);
  navigator.vibrate?.(14);
  // Everybody else saw that. Nothing frightens a fish like a neighbour vanishing upwards.
  for (const other of s.creatures) {
    // Only the neighbours who really saw it. Frightening half the tank at once
    // empties the water and leaves the child holding a fish in a dead room.
    if (other !== cr && Math.hypot(other.x - cr.x, other.y - cr.y) < tank.unit * 2) other.startle(cr.x, cr.y, true);
  }
  for (let i = 0; i < 5; i++) s.bubbles.push(makeBubble(cr.x, cr.y, tank));
}

/** Scooped out of the tank for good. */
function scoop(ctx: GameContext, s: State, cr: Creature): void {
  s.creatures = s.creatures.filter((other) => other !== cr);
  ctx.audio.puff();
  navigator.vibrate?.(20);
  ctx.speak('Tạm biệt!');
  replay(s.els.net, 'anim-bounce');
  for (let i = 0; i < 6; i++) s.bubbles.push(makeBubble(cr.x, cr.y, s.tank));
}

/** The child's finger on the water: hello, grab, slide, scoop. */
export function bindInput(ctx: GameContext, s: State): void {
  const { canvas, root, net } = s.els;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = at(s, e);
    s.nudge = { x: p.x, y: p.y, held: true };
    s.grabFrom = p;
    s.grabCandidate = s.creatures.find((cr) => cr.hits(p.x, p.y)) ?? null;
    if (s.grabCandidate) return;
    // Nothing swimming here, so whatever is planted here can be slid along the
    // sand instead — but only if the finger travels. A press on the spot pokes it.
    s.movable = decorAt(s.decor, p.x, p.y, s.tank) ?? plantAt(s.plants, p.x, p.y, s.tank);
    poke(ctx, s, p);
  });

  canvas.addEventListener('pointermove', (e) => {
    const { tank, bubbles } = s;
    if (!s.nudge?.held) return;
    const p = at(s, e);
    s.nudge.x = p.x;
    s.nudge.y = p.y;

    // A press that travels turns into a grab; a press that stays put is a hello.
    if (!s.held && s.grabCandidate && s.grabFrom && Math.hypot(p.x - s.grabFrom.x, p.y - s.grabFrom.y) > GRAB_SLOP) {
      grab(ctx, s, s.grabCandidate, p);
    }
    if (!s.held && !s.moving && s.movable && s.grabFrom && Math.abs(p.x - s.grabFrom.x) > GRAB_SLOP) {
      s.moving = s.movable;
      root.classList.add('aquarium-moving');
      ctx.audio.pop(0.7);
      navigator.vibrate?.(10);
    }
    if (s.moving) {
      // Along the sand only: these things stand on it. Kept a body's width off
      // the glass so nothing ends up half outside the tank.
      const edge = tank.unit * 0.6;
      s.moving.x = Math.min(tank.w - edge, Math.max(edge, p.x));
      s.shelters = sheltersFrom(tank, s.plants, s.decor);
      return;
    }
    if (s.held) {
      s.held.hold(p.x, p.y);
      net.classList.toggle('aquarium-net-over', overNet(s, e));
      if (Math.random() < 0.4 && bubbles.length < maxBubbles()) bubbles.push(makeBubble(p.x, p.y, tank));
      return;
    }
    // A finger dragged through the weeds sets them waving.
    const brushed = plantAt(s.plants, p.x, p.y, tank);
    if (brushed) brushed.shake = Math.max(brushed.shake, SHAKE_SECONDS * 0.7);
    if (Math.random() < 0.25 && bubbles.length < maxBubbles()) bubbles.push(makeBubble(p.x, p.y, tank));
  });

  const release = (e?: PointerEvent): void => {
    if (s.moving) {
      s.moving = null;
      s.movable = null;
      s.grabCandidate = null;
      s.grabFrom = null;
      root.classList.remove('aquarium-moving');
      ctx.audio.tick();
      save(s);
      if (s.nudge) s.nudge.held = false;
      return;
    }
    s.movable = null;
    if (s.held) {
      if (e && overNet(s, e)) scoop(ctx, s, s.held);
      else s.held.release();
      save(s);
      s.held = null;
      root.classList.remove('aquarium-dragging');
      net.classList.remove('aquarium-net-over');
    } else if (s.grabCandidate && s.grabFrom) {
      // Never moved: that was a hello, not a lift.
      greet(ctx, s, s.grabCandidate, s.grabFrom);
    }
    s.grabCandidate = null;
    s.grabFrom = null;
    if (s.nudge) s.nudge.held = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
