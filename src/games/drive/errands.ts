import { replay } from '../../core/dom';
import { voiceOf } from '../../core/content';
import {
  DELIVERIES_FOR_STAR,
  MUD_PER_SPLASH,
  fillUp,
  propAt,
  propsIn,
  reached,
  rinse,
  riderAt,
  roadY,
  slotX,
  type Prop,
} from './logic';
import { HOSE_SECONDS, droppedLine, loadAt, onFire, pickedLine, type Load } from './jobs';
import { doorwayAt, waitingAt } from './props';
import { LOW_FUEL } from './config';
import { puff, splash } from './fx';
import type { Drive } from './state';

export function showLoads(d: Drive): void {
  const { badge } = d.el;
  badge.textContent = d.loads.map((l) => l.emoji).join('');
  badge.hidden = d.loads.length === 0;
  if (d.loads.length) replay(badge, 'anim-bounce');
}

function pickUp(d: Drive, prop: Prop): void {
  const { ctx, job, car, road } = d;
  const load = loadAt(job.kind, prop.slot);
  d.loads.push(load);
  showLoads(d);
  const from = waitingAt(prop, job, road);
  d.hops.push({
    emoji: load.emoji,
    fixedX: from.x,
    fixedY: from.y,
    carX: car.x,
    carY: d.seat.y,
    boarding: true,
    t: 0,
    slot: prop.slot,
    size: from.size,
  });
  ctx.audio.pop(1.2);
  if (job.kind === 'ride') ctx.audio.fx(voiceOf(riderAt(prop.slot)));
  ctx.speak(pickedLine(job.kind, load));
  navigator.vibrate?.(12);
}

async function dropOff(d: Drive, load: Load): Promise<void> {
  const { ctx, road } = d;
  d.served.add(load.slot);
  d.loads = d.loads.filter((l) => l !== load);
  showLoads(d);
  const door = doorwayAt(propAt(road, load.home), road);
  d.hops.push({
    emoji: load.emoji,
    fixedX: door.x,
    fixedY: door.y,
    carX: d.seat.x,
    carY: d.seat.y,
    boarding: false,
    t: 0,
    slot: load.slot,
    size: door.size,
  });
  d.deliveries++;
  ctx.audio.ding();
  ctx.speak(droppedLine(d.job.kind, load));
  navigator.vibrate?.(20);
  if (d.deliveries % DELIVERIES_FOR_STAR === 0) {
    await ctx.celebrate();
    if (!d.alive) return;
    ctx.addStar();
  }
}

async function douse(d: Drive, slot: number): Promise<void> {
  const { ctx, road } = d;
  d.doused.add(slot);
  d.hosing = null;
  d.deliveries++;
  ctx.audio.fx('cheer');
  ctx.speak('Dập tắt lửa rồi, giỏi quá!');
  navigator.vibrate?.(24);
  puff(d, slotX(road, slot), roadY(road, slotX(road, slot)) - road.unit * 1.9, '💨', 5);
  if (d.deliveries % DELIVERIES_FOR_STAR === 0) {
    await ctx.celebrate();
    if (!d.alive) return;
    ctx.addStar();
  }
}

/** The house on fire within reach, if the fire engine is out and one is. */
function fireInReach(d: Drive): Prop | null {
  if (d.job.kind !== 'fire') return null;
  const { road, car } = d;
  for (const prop of propsIn(road, car.x - road.unit * 2, car.x + road.unit * 2)) {
    if (prop.kind !== 'house' || !onFire(prop.slot) || d.doused.has(prop.slot)) continue;
    if (reached(car, prop.x, road)) return prop;
  }
  return null;
}

/** The pump within reach, if the car has pulled up at one. */
function pumpInReach(d: Drive): Prop | null {
  const { road, car } = d;
  if (car.fuel > 0.995) return null;
  for (const prop of propsIn(road, car.x - road.unit * 2, car.x + road.unit * 2)) {
    if (prop.kind === 'pump' && reached(car, prop.x, road)) return prop;
  }
  return null;
}

/** Keep the job button showing whichever of the two jobs is to hand. */
export function refreshAct(d: Drive): void {
  const { act } = d.el;
  const fire = fireInReach(d);
  const pump = fire ? null : pumpInReach(d);
  const wanted = fire ? '💦' : pump ? '⛽' : '';
  if (!wanted) {
    if (!act.hidden) {
      act.hidden = true;
      d.working = false;
      d.hosing = null;
    }
    return;
  }
  if (act.textContent !== wanted) act.textContent = wanted;
  if (act.hidden) {
    act.hidden = false;
    replay(act, 'anim-bounce');
  }
}

export function errands(d: Drive, dt: number): void {
  const { road, car, job, ctx } = d;
  for (const prop of propsIn(road, car.x - road.unit * 2, car.x + road.unit * 2)) {
    // One thing per pick-up point: parked on a field, the tractor would
    // otherwise load a carrot every frame until the back overflowed.
    const spare = job.kind !== 'fire' && d.loads.length < job.capacity;
    const fresh = !d.served.has(prop.slot) && !d.loads.some((l) => l.slot === prop.slot);
    if (prop.kind === 'stop' && spare && fresh && reached(car, prop.x, road)) pickUp(d, prop);
    if (prop.kind === 'house') {
      const load = d.loads.find((l) => l.home === prop.slot);
      if (load && reached(car, prop.x, road)) void dropOff(d, load);
    }
    if (prop.kind === 'puddle' && !d.wet.has(prop.slot) && Math.abs(car.v) > road.unit) {
      d.wet.add(prop.slot);
      splash(d, prop.x, roadY(road, prop.x));
      car.mud = Math.min(1, car.mud + MUD_PER_SPLASH);
      ctx.audio.puff();
    }
    // Under the arch the mud comes straight off, no button needed.
    if (prop.kind === 'wash' && Math.abs(car.x - prop.x) < road.unit * 1.1 && car.mud > 0) {
      if (rinse(car, dt)) {
        ctx.audio.ding();
        ctx.speak('Xe sạch bong rồi!');
        puff(d, car.x, roadY(road, car.x) - road.unit * 0.4, '✨', 4);
      }
    }
  }
  // Holding the job button either fights a fire or fills the tank.
  const fire = fireInReach(d);
  if (d.working && fire) {
    const hosing = d.hosing;
    d.hosing = hosing?.slot === fire.slot ? { slot: fire.slot, t: hosing.t + dt } : { slot: fire.slot, t: dt };
    if (d.clock % 0.2 < dt) puff(d, fire.x, roadY(road, fire.x) - road.unit * 1.4, '💧', 1);
    if (d.hosing.t >= HOSE_SECONDS) void douse(d, fire.slot);
  } else if (d.hosing && !fire) {
    d.hosing = null;
  }
  if (d.working && !fire) {
    const pump = pumpInReach(d);
    if (pump && fillUp(car, dt)) {
      ctx.audio.jingle();
      ctx.speak('Đầy bình rồi!');
    }
  }
  if (car.fuel < LOW_FUEL && !d.warned) {
    d.warned = true;
    ctx.speak('Sắp hết xăng rồi, tìm cây xăng nhé!');
  }
  if (car.fuel > LOW_FUEL * 1.5) d.warned = false;
  d.el.fuelBar.style.width = `${Math.round(car.fuel * 100)}%`;
  d.el.fuel.classList.toggle('low', car.fuel < LOW_FUEL);
  d.el.fuel.classList.toggle('full', car.fuel > 0.92);
}
