import {
  CROSS_STOP_UNITS,
  RAIL_STOP_UNITS,
  RAIL_WAKE_UNITS,
  SPAWN_AHEAD,
  crossed,
  crosserGone,
  lineFor,
  makeCrosser,
  makeJam,
  makeTraveller,
  railBlocks,
  railPhase,
  stepCrosser,
  stepTraveller,
  tailOf,
  type Halt,
} from './traffic';
import { LIGHT_STOP_UNITS, RED_MS, propsIn, slotX } from './logic';
import { HERD_GAP, JAM_GAP, TRAFFIC_GAP } from './config';
import { topSpeed, type Drive } from './state';

/** Wake the traffic lights the car is coming up to, and let the red ones time out. */
export function wakeLights(d: Drive): void {
  const { road, car, lights, clock, ctx } = d;
  for (const prop of propsIn(road, car.x - road.unit, car.x + road.unit * 6)) {
    if (prop.kind !== 'light' || prop.x < car.x - road.unit * 0.2) continue;
    const light = lights.get(prop.slot);
    if (!light) {
      if (prop.x - car.x > road.unit * 3) continue;
      lights.set(prop.slot, { redAt: clock, green: false });
      ctx.audio.tick();
      ctx.speak('Đèn đỏ, dừng lại nào!');
      continue;
    }
    if (!light.green && clock - light.redAt >= RED_MS / 1000) {
      light.green = true;
      ctx.audio.pop(1.3);
      ctx.speak('Đèn xanh, đi thôi!');
    }
  }
}

/** Coming up to a crossing wakes it, and the train comes through. */
export function wakeRails(d: Drive, dt: number): void {
  const { road, car, crossings, ctx } = d;
  for (const prop of propsIn(road, car.x - road.unit * 2, car.x + road.unit * RAIL_WAKE_UNITS)) {
    if (prop.kind !== 'crossing' || crossings.has(prop.slot)) continue;
    if (prop.x < car.x || prop.x - car.x > road.unit * RAIL_WAKE_UNITS) continue;
    crossings.set(prop.slot, 0);
    ctx.audio.fx('train');
    ctx.speak('Tàu hoả tới, đợi một chút nhé!');
  }
  for (const [slot, t] of crossings) {
    const next = t + dt;
    if (railPhase(next) === 'clear' && railPhase(t) !== 'clear') ctx.audio.pop(1.2);
    crossings.set(slot, next);
  }
}

/**
 * Everything on the road that has to be waited for, in one list. The child's
 * car and every other vehicle are held by the same one, so a child who has
 * stopped for a duck can see that the van in front has stopped for it too.
 */
export function halts(d: Drive): Halt[] {
  const out: Halt[] = [];
  for (const cr of d.crossers) {
    if (!crossed(cr)) out.push({ x: cr.x, gap: CROSS_STOP_UNITS });
  }
  for (const [slot, t] of d.crossings) {
    if (railBlocks(t)) out.push({ x: slotX(d.road, slot), gap: RAIL_STOP_UNITS });
  }
  for (const [slot, light] of d.lights) {
    if (!light.green) out.push({ x: slotX(d.road, slot), gap: LIGHT_STOP_UNITS });
  }
  return out;
}

/** The nearest thing the car may not drive through, of all the things that stop it. */
export function stopLine(d: Drive, stops: readonly Halt[]): number | null {
  const lines = [lineFor(d.car.x, 1, stops, d.road), tailOf(d.car.x, d.travellers, d.road)];
  let out: number | null = null;
  for (const line of lines) {
    if (line === null) continue;
    if (out === null || line < out) out = line;
  }
  return out;
}

/** Spawn, move and retire everybody else on the road. */
export function traffic(d: Drive, dt: number, stops: readonly Halt[]): void {
  const { rng, road, travellers, crossers, camX } = d;
  const t = topSpeed(d);
  d.nextTraffic -= dt;
  d.nextJam -= dt;
  d.nextHerd -= dt;
  if (d.nextTraffic <= 0) {
    d.nextTraffic = TRAFFIC_GAP * (0.6 + rng());
    const same = travellers.filter((v) => v.lane === 'same').length;
    const lane: 'same' | 'opposite' = same < 2 && rng() < 0.6 ? 'same' : 'opposite';
    travellers.push(makeTraveller(camX + road.w + road.unit * SPAWN_AHEAD, lane, t, rng));
  }
  if (d.nextJam <= 0 && travellers.filter((v) => v.stuck > 0).length === 0) {
    d.nextJam = JAM_GAP * (0.7 + rng() * 0.6);
    travellers.push(...makeJam(camX + road.w + road.unit * 1.5, t, rng, road));
    d.ctx.speak('Kẹt xe rồi, bấm còi đi bé!');
  }
  if (d.nextHerd <= 0) {
    d.nextHerd = HERD_GAP * (0.7 + rng() * 0.7);
    // Off the right-hand edge, so a herd walks into the picture rather than
    // appearing in the middle of the road out of nothing.
    crossers.push(makeCrosser(camX + road.w + road.unit * 2.5, rng));
  }
  for (const v of travellers) stepTraveller(v, dt, road, t, stops);
  for (let i = travellers.length - 1; i >= 0; i--) {
    const v = travellers[i]!;
    if (v.x < camX - road.unit * 5 || v.x > camX + road.w + road.unit * 22) travellers.splice(i, 1);
  }
  for (const cr of crossers) stepCrosser(cr, dt);
  for (let i = crossers.length - 1; i >= 0; i--) {
    const cr = crossers[i]!;
    if (crosserGone(cr) || cr.x < camX - road.unit * 4) crossers.splice(i, 1);
  }
}
