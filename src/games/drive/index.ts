import { h, mulberry32, replay } from '../../core/dom';
import { voiceOf } from '../../core/content';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  DELIVERIES_FOR_STAR,
  FULL_THROTTLE,
  LIGHT_STOP_UNITS,
  MUD_PER_SPLASH,
  RED_MS,
  SAVE_KEY,
  SLOT_UNITS,
  VEHICLES,
  fillUp,
  forkAt,
  legAt,
  makeCar,
  makeRoad,
  nextFork,
  propAt,
  propsIn,
  reached,
  rinse,
  riderAt,
  roadTilt,
  roadY,
  slotX,
  stepCar,
  makeSave,
  readSave,
  takeFork,
  vehicleById,
  type Car,
  type LegPlan,
  type Prop,
  type Road,
  type Vehicle,
} from './logic';
import {
  HOP_LIFT,
  HOSE_SECONDS,
  droppedLine,
  hopAt,
  jobOf,
  loadAt,
  onFire,
  pickedLine,
  stepHop,
  type Hop,
  type Job,
  type Load,
} from './jobs';
import {
  CROSS_STOP_UNITS,
  RAIL_STOP_UNITS,
  RAIL_WAKE_UNITS,
  SPAWN_AHEAD,
  crossed,
  crosserFade,
  crosserGone,
  crosserScale,
  crosserY,
  lineFor,
  honkAt,
  makeCrosser,
  makeJam,
  makeTraveller,
  railBlocks,
  railPhase,
  stepCrosser,
  stepTraveller,
  tailOf,
  type Crosser,
  type Halt,
  type Traveller,
} from './traffic';
import {
  beamGlows,
  drawBirds,
  drawClouds,
  drawGround,
  drawHills,
  drawRoad,
  drawSea,
  drawSky,
  drawSkyline,
  drawThicket,
  drawVerge,
  drawDrift,
  drawWeather,
  driftNow,
  glyph,
  makeNight,
  paletteAt,
  weatherNow,
  type Glow,
  type Scene,
} from './scenery';
import { doorwayAt, drawProp, lampsFor, pokeReply, seedFor, waitingAt, type Dressing } from './props';
import { TRAFFIC, drawRig } from './vehicle';
import './style.css';

/** Longest frame the drive will take in one step. */
const MAX_STEP = 0.05;
/** The car sits this far across the screen, so there is road to see ahead. */
const CAMERA_AT = 0.34;
/** How fast the camera catches up with the car. */
const CAMERA_LAG = 6;
const DROP_WAVE_MS = 1400;
/** How fast the sky slides between day and night when the button is pressed. */
const DUSK_PER_SECOND = 0.55;
/** A tap this far from something (in units) counts as prodding it. */
const POKE_REACH = 1.4;
/** How long between new vehicles joining the road. */
const TRAFFIC_GAP = 3.2;
/** How long between traffic jams, and between herds of ducks. Both are meant to
 *  be a surprise, not a toll booth: too often and the road stops being a drive. */
const JAM_GAP = 62;
const HERD_GAP = 46;
/** The child is warned once the tank is under this. */
const LOW_FUEL = 0.22;

interface Flyer {
  /** World x, so it scrolls with the road it came off. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  emoji: string;
  size: number;
}

/** A light the car has already sat at: when it went red, and whether it is green yet. */
interface Light {
  redAt: number;
  green: boolean;
}

/**
 * Bé lái xe: put a finger where the car should go and it drives there. The road
 * runs on for ever, but never the same way twice — every twelfth lamp-post it
 * forks, and the child picks whether to climb into the pines or drop down to the
 * sea. The weather, the trees, the houses and the colours all come with it.
 *
 * The vehicle at the bottom of the screen decides what the road is *for*: the bus
 * fills up with passengers, the lorry with parcels, the tractor with vegetables,
 * and the fire engine finds the houses ablaze. Anything by the roadside can be
 * prodded, the horn shifts whatever is dawdling in front, and a train comes
 * through the level crossing whether the child is ready or not.
 */
function start(ctx: GameContext): void {
  const canvas = h('canvas', { class: 'drive-canvas' });
  const horn = h('button', { class: 'drive-horn', type: 'button', 'aria-label': 'bấm còi' }, '📢');
  const act = h('button', { class: 'drive-act', type: 'button', hidden: true, 'aria-label': 'làm việc' }, '⛽');
  const night = h('button', { class: 'drive-night', type: 'button', 'aria-label': 'ngày hay đêm' }, '🌙');
  const badge = h('div', { class: 'drive-badge', hidden: true });
  const fuelBar = h('i');
  const fuel = h('div', { class: 'drive-fuel', 'aria-hidden': 'true' }, fuelBar);
  const forkPanel = h('div', { class: 'drive-fork', hidden: true });
  const back = h('button', { class: 'drive-go back', type: 'button', 'aria-label': 'lùi lại' }, '◀');
  const fwd = h('button', { class: 'drive-go fwd', type: 'button', 'aria-label': 'đi tới' }, '▶');
  const garage = h('button', { class: 'drive-garage', type: 'button', 'aria-label': 'chọn xe' }, '🚗');
  const tray = h('div', { class: 'g-tray drive-tray' }, back, garage, fwd);
  const root = h('div', { class: 'drive' }, h('div', { class: 'drive-view' }, canvas, horn, act, night, badge, fuel, forkPanel), tray);
  ctx.stage.append(root);

  const c = canvas.getContext('2d');
  const rng = mulberry32(7);
  let alive = true;
  let dpr = 1;
  let road: Road = makeRoad(1, 1);
  let car: Car = makeCar(road);
  let vehicle: Vehicle = VEHICLES[0]!;
  let job: Job = jobOf(vehicle);
  let camX = 0;
  let clock = 0;
  /**
   * Which way the child is holding: 1 forward, -1 back, 0 coasting. Driving lives
   * on its own two buttons because the road itself is for prodding — a finger put
   * down to shake a tree must never also be a foot on the accelerator.
   */
  let steer = 0;
  /** A world x the hint is coaxing the car towards, ignored once it is reached. */
  let nudge = 0;
  /** What is in the back right now. */
  let loads: Load[] = [];
  /** Pick-up points already emptied, so nothing is collected twice. */
  let served = new Set<number>();
  /** Fires already put out. */
  const doused = new Set<number>();
  /** The fire being hosed, and how long the hose has been on it. */
  let hosing: { slot: number; t: number } | null = null;
  const lights = new Map<number, Light>();
  /** Crossings the car has woken up: slot → seconds into the cycle. */
  const crossings = new Map<number, number>();
  /** Forks decided, and whether the uphill way was taken. */
  const chosen = new Map<number, boolean>();
  /** Slot → when it was last prodded, for the wobble. */
  const pokes = new Map<number, number>();
  const flyers: Flyer[] = [];
  /** Loads in mid-air between the roadside and the back of the vehicle. */
  const hops: Hop[] = [];
  /** Where the seat or the load bed was last drawn, so a hop has somewhere to land. */
  let seat = { x: 0, y: 0 };
  const travellers: Traveller[] = [];
  const crossers: Crosser[] = [];
  const wet = new Set<number>();
  let deliveries = 0;
  let waved = -9;
  /** 0 in daylight, 1 at night, sliding between the two. */
  let dusk = 0;
  let wantNight = false;
  /** Countdowns for the things that turn up on their own. */
  let nextTraffic = 1.5;
  let nextJam = JAM_GAP;
  let nextHerd = HERD_GAP;
  /** Forks already announced, and whether the low tank has been mentioned. */
  const asked = new Set<number>();
  let warned = false;
  /** Whichever job button is being held down. */
  let working = false;
  /** The fork the panel is currently offering, if any. */
  let asking: number | null = null;
  /** Closes the garage door, when it is open. */
  let shutGarage: (() => void) | null = null;
  const nightLayer = makeNight();

  const scene = (): Scene => ({ road, camX, clock, dusk });
  const top = (): number => vehicle.speed * road.unit;

  // ---- the road ----

  function build(): void {
    const view = canvas.parentElement;
    const w = view?.clientWidth ?? 0;
    const hgt = view?.clientHeight ?? 0;
    if (!w || !hgt) return;
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width === Math.round(w * nextDpr) && canvas.height === Math.round(hgt * nextDpr)) return;
    dpr = nextDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    const before = road.unit ? car.x / road.unit : 2;
    road = makeRoad(w, hgt, road.legs);
    car.x = before * road.unit;
    camX = car.x - w * CAMERA_AT;
  }

  /** Everything on screen, plus a little either side. */
  function inView(): Prop[] {
    return propsIn(road, camX - road.unit * 3, camX + road.w + road.unit * 4);
  }

  // ---- steering ----

  /** Wake the traffic lights the car is coming up to, and let the red ones time out. */
  function wakeLights(): void {
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
  function wakeRails(dt: number): void {
    for (const prop of propsIn(road, car.x - road.unit * 2, car.x + road.unit * RAIL_WAKE_UNITS)) {
      if (prop.kind !== 'crossing' || crossings.has(prop.slot)) continue;
      if (prop.x < car.x || prop.x - car.x > road.unit * RAIL_WAKE_UNITS) continue;
      crossings.set(prop.slot, 0);
      ctx.audio.fx('whistle');
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
  function halts(): Halt[] {
    const out: Halt[] = [];
    for (const cr of crossers) {
      if (!crossed(cr)) out.push({ x: cr.x, gap: CROSS_STOP_UNITS });
    }
    for (const [slot, t] of crossings) {
      if (railBlocks(t)) out.push({ x: slotX(road, slot), gap: RAIL_STOP_UNITS });
    }
    for (const [slot, light] of lights) {
      if (!light.green) out.push({ x: slotX(road, slot), gap: LIGHT_STOP_UNITS });
    }
    return out;
  }

  /** The nearest thing the car may not drive through, of all the things that stop it. */
  function stopLine(stops: readonly Halt[]): number | null {
    const lines = [lineFor(car.x, 1, stops, road), tailOf(car.x, travellers, road)];
    let out: number | null = null;
    for (const line of lines) {
      if (line === null) continue;
      if (out === null || line < out) out = line;
    }
    return out;
  }

  // ---- the job in hand ----

  function showLoads(): void {
    badge.textContent = loads.map((l) => l.emoji).join('');
    badge.hidden = loads.length === 0;
    if (loads.length) replay(badge, 'anim-bounce');
  }

  function pickUp(prop: Prop): void {
    const load = loadAt(job.kind, prop.slot);
    loads.push(load);
    showLoads();
    const from = waitingAt(prop, job, road);
    hops.push({
      emoji: load.emoji,
      fixedX: from.x,
      fixedY: from.y,
      carX: car.x,
      carY: seat.y,
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

  async function dropOff(load: Load): Promise<void> {
    served.add(load.slot);
    loads = loads.filter((l) => l !== load);
    showLoads();
    const door = doorwayAt(propAt(road, load.home), road);
    hops.push({
      emoji: load.emoji,
      fixedX: door.x,
      fixedY: door.y,
      carX: seat.x,
      carY: seat.y,
      boarding: false,
      t: 0,
      slot: load.slot,
      size: door.size,
    });
    deliveries++;
    ctx.audio.ding();
    ctx.speak(droppedLine(job.kind, load));
    navigator.vibrate?.(20);
    if (deliveries % DELIVERIES_FOR_STAR === 0) {
      await ctx.celebrate();
      if (!alive) return;
      ctx.addStar();
    }
  }

  async function doused_(slot: number): Promise<void> {
    doused.add(slot);
    hosing = null;
    deliveries++;
    ctx.audio.fx('cheer');
    ctx.speak('Dập tắt lửa rồi, giỏi quá!');
    navigator.vibrate?.(24);
    puff(slotX(road, slot), roadY(road, slotX(road, slot)) - road.unit * 1.9, '💨', 5);
    if (deliveries % DELIVERIES_FOR_STAR === 0) {
      await ctx.celebrate();
      if (!alive) return;
      ctx.addStar();
    }
  }

  /** The house on fire within reach, if the fire engine is out and one is. */
  function fireInReach(): Prop | null {
    if (job.kind !== 'fire') return null;
    for (const prop of propsIn(road, car.x - road.unit * 2, car.x + road.unit * 2)) {
      if (prop.kind !== 'house' || !onFire(prop.slot) || doused.has(prop.slot)) continue;
      if (reached(car, prop.x, road)) return prop;
    }
    return null;
  }

  /** The pump within reach, if the car has pulled up at one. */
  function pumpInReach(): Prop | null {
    if (car.fuel > 0.995) return null;
    for (const prop of propsIn(road, car.x - road.unit * 2, car.x + road.unit * 2)) {
      if (prop.kind === 'pump' && reached(car, prop.x, road)) return prop;
    }
    return null;
  }

  /** Keep the job button showing whichever of the two jobs is to hand. */
  function refreshAct(): void {
    const fire = fireInReach();
    const pump = fire ? null : pumpInReach();
    const wanted = fire ? '💦' : pump ? '⛽' : '';
    if (!wanted) {
      if (!act.hidden) {
        act.hidden = true;
        working = false;
        hosing = null;
      }
      return;
    }
    if (act.textContent !== wanted) act.textContent = wanted;
    if (act.hidden) {
      act.hidden = false;
      replay(act, 'anim-bounce');
    }
  }

  function errands(dt: number): void {
    for (const prop of propsIn(road, car.x - road.unit * 2, car.x + road.unit * 2)) {
      // One thing per pick-up point: parked on a field, the tractor would
      // otherwise load a carrot every frame until the back overflowed.
      const spare = job.kind !== 'fire' && loads.length < job.capacity;
      const fresh = !served.has(prop.slot) && !loads.some((l) => l.slot === prop.slot);
      if (prop.kind === 'stop' && spare && fresh && reached(car, prop.x, road)) pickUp(prop);
      if (prop.kind === 'house') {
        const load = loads.find((l) => l.home === prop.slot);
        if (load && reached(car, prop.x, road)) void dropOff(load);
      }
      if (prop.kind === 'puddle' && !wet.has(prop.slot) && Math.abs(car.v) > road.unit) {
        wet.add(prop.slot);
        splash(prop.x, roadY(road, prop.x));
        car.mud = Math.min(1, car.mud + MUD_PER_SPLASH);
        ctx.audio.puff();
      }
      // Under the arch the mud comes straight off, no button needed.
      if (prop.kind === 'wash' && Math.abs(car.x - prop.x) < road.unit * 1.1 && car.mud > 0) {
        if (rinse(car, dt)) {
          ctx.audio.ding();
          ctx.speak('Xe sạch bong rồi!');
          puff(car.x, roadY(road, car.x) - road.unit * 0.4, '✨', 4);
        }
      }
    }
    // Holding the job button either fights a fire or fills the tank.
    const fire = fireInReach();
    if (working && fire) {
      hosing = hosing?.slot === fire.slot ? { slot: fire.slot, t: hosing.t + dt } : { slot: fire.slot, t: dt };
      if (clock % 0.2 < dt) puff(fire.x, roadY(road, fire.x) - road.unit * 1.4, '💧', 1);
      if (hosing.t >= HOSE_SECONDS) void doused_(fire.slot);
    } else if (hosing && !fire) {
      hosing = null;
    }
    if (working && !fire) {
      const pump = pumpInReach();
      if (pump && fillUp(car, dt)) {
        ctx.audio.jingle();
        ctx.speak('Đầy bình rồi!');
      }
    }
    if (car.fuel < LOW_FUEL && !warned) {
      warned = true;
      ctx.speak('Sắp hết xăng rồi, tìm cây xăng nhé!');
    }
    if (car.fuel > LOW_FUEL * 1.5) warned = false;
    fuelBar.style.width = `${Math.round(car.fuel * 100)}%`;
    fuel.classList.toggle('low', car.fuel < LOW_FUEL);
    fuel.classList.toggle('full', car.fuel > 0.92);
  }

  // ---- the fork ----

  function takeWay(slot: number, plan: LegPlan, tapped: boolean): void {
    if (chosen.has(slot)) return;
    chosen.set(slot, plan.up);
    takeFork(road, slot, plan);
    root.dataset.way = plan.name;
    if (tapped) {
      ctx.audio.ding();
      ctx.speak(`Đi ${plan.name} nhé!`);
    }
  }

  /** Where the road has got to, so the tray and the trees agree on the place. */
  function showPlace(): void {
    const here = legAt(road, car.x).biome;
    if (root.dataset.place === here) return;
    root.dataset.place = here;
    if (here !== 'meadow' || chosen.size > 0) ctx.audio.fx('sparkle');
  }

  /** Put the two ways on screen as buttons, or take them away again. */
  function offerWays(slot: number | null): void {
    if (asking === slot) return;
    asking = slot;
    forkPanel.textContent = '';
    if (slot === null) {
      forkPanel.hidden = true;
      return;
    }
    for (const plan of forkAt(slot)) {
      const btn = h(
        'button',
        {
          class: `drive-way ${plan.up ? 'up' : 'down'}`,
          type: 'button',
          'data-way': plan.biome,
          'aria-label': plan.name,
        },
        h('span', { class: 'drive-way-sign' }, plan.emoji),
        h('span', { class: 'drive-way-arrow' }, plan.up ? '⬆️' : '⬇️'),
      );
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.hint.touch();
        takeWay(slot, plan, true);
        offerWays(null);
      });
      forkPanel.append(btn);
    }
    forkPanel.hidden = false;
    replay(forkPanel, 'anim-bounce');
  }

  /** Ask as the fork comes into view, and pick for the child if they do not. */
  function forks(): void {
    const slot = nextFork(Math.floor(car.x / (road.unit * SLOT_UNITS)) - 1);
    const x = slotX(road, slot);
    if (chosen.has(slot)) {
      offerWays(null);
      return;
    }
    if (x - car.x < road.unit * 9) {
      if (!asked.has(slot)) {
        asked.add(slot);
        ctx.audio.fx('sparkle');
        ctx.speak('Bé chọn đường nào?');
      }
      offerWays(slot);
    }
    // Reaching the fork with no choice made: the road picks one so it never stalls.
    if (car.x >= x - road.unit * 0.6) {
      const ways = forkAt(slot);
      takeWay(slot, ways[rng() < 0.5 ? 0 : 1]!, false);
      offerWays(null);
    }
  }

  // ---- everybody else on the road ----

  function traffic(dt: number, stops: readonly Halt[]): void {
    const t = top();
    nextTraffic -= dt;
    nextJam -= dt;
    nextHerd -= dt;
    if (nextTraffic <= 0) {
      nextTraffic = TRAFFIC_GAP * (0.6 + rng());
      const same = travellers.filter((v) => v.lane === 'same').length;
      const lane: 'same' | 'opposite' = same < 2 && rng() < 0.6 ? 'same' : 'opposite';
      travellers.push(makeTraveller(camX + road.w + road.unit * SPAWN_AHEAD, lane, t, rng));
    }
    if (nextJam <= 0 && travellers.filter((v) => v.stuck > 0).length === 0) {
      nextJam = JAM_GAP * (0.7 + rng() * 0.6);
      travellers.push(...makeJam(camX + road.w + road.unit * 1.5, t, rng, road));
      ctx.speak('Kẹt xe rồi, bấm còi đi bé!');
    }
    if (nextHerd <= 0) {
      nextHerd = HERD_GAP * (0.7 + rng() * 0.7);
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

  // ---- bits that fly about ----

  function puff(x: number, y: number, emoji: string, count: number): void {
    for (let i = 0; i < count; i++) {
      flyers.push({
        x,
        y,
        vx: (rng() - 0.5) * road.unit * 1.6,
        vy: -road.unit * (0.8 + rng() * 1.2),
        life: 1,
        emoji,
        size: road.unit * (0.22 + rng() * 0.12),
      });
    }
  }

  function splash(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      flyers.push({
        x,
        y: y + road.unit * 0.3,
        vx: (rng() - 0.5) * road.unit * 2.4,
        vy: -road.unit * (0.6 + rng()),
        life: 0.6,
        emoji: '💧',
        size: road.unit * 0.18,
      });
    }
  }

  function stepFlyers(dt: number): void {
    for (const f of flyers) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += road.unit * 3.4 * dt;
      f.life -= dt * 0.9;
    }
    for (let i = flyers.length - 1; i >= 0; i--) if (flyers[i]!.life <= 0) flyers.splice(i, 1);
  }

  // ---- one frame ----

  function step(dt: number): void {
    clock += dt;
    dusk += Math.max(-1, Math.min(1, (wantNight ? 1 : 0) - dusk)) * Math.min(1, dt * DUSK_PER_SECOND * 4);
    dusk = Math.max(0, Math.min(1, dusk));
    const target = steer !== 0 ? car.x + steer * road.unit * FULL_THROTTLE * 2 : Math.max(car.x, nudge);
    wakeLights();
    wakeRails(dt);
    const stops = halts();
    traffic(dt, stops);
    forks();
    stepCar(car, target, dt, road, vehicle, stopLine(stops));
    camX += (car.x - road.w * CAMERA_AT - camX) * Math.min(1, dt * CAMERA_LAG);
    errands(dt);
    refreshAct();
    showPlace();
    stepFlyers(dt);
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i]!;
      // The wave from the doorway waits until somebody is actually at the door.
      if (stepHop(hop, dt) && !hop.boarding) waved = clock;
      if (hop.t >= 1) hops.splice(i, 1);
    }
  }

  // ---- drawing ----

  /** World x → screen x. */
  const sx = (x: number): number => x - camX;

  function dressing(): Dressing {
    return {
      scene: scene(),
      job,
      loads,
      served,
      doused,
      hosing,
      pokes,
      lights,
      crossings,
      chosen,
      waved: clock - waved < DROP_WAVE_MS / 1000 ? waved : -9,
      carX: car.x,
    };
  }

  function drawVehicle(g: CanvasRenderingContext2D): void {
    const u = road.unit;
    const x = sx(car.x);
    const y = roadY(road, car.x) + u * 0.3;
    const bounce = Math.sin(clock * 14) * Math.min(1, Math.abs(car.v) / (u * 3)) * u * 0.015;
    g.save();
    g.translate(x, y + bounce);
    g.rotate(roadTilt(road, car.x));
    const ride = drawRig(g, u, {
      shape: vehicle.shape,
      wheelbase: vehicle.wheelbase,
      height: vehicle.height,
      body: vehicle.body,
      trim: vehicle.trim,
      spin: car.spin,
      dusk,
      clock,
      emergency: vehicle.id === 'fire',
    });
    // What is on board rides where it would really ride: at the window, or on the
    // back. Anything still climbing in is left to the hop that is carrying it.
    const inside = job.kind === 'ride';
    const spotX = inside ? ride.cabinX : ride.deckX;
    const spotY = inside ? ride.cabinY : ride.deckY;
    const aboard = loads.filter((l) => !hops.some((hop) => hop.boarding && hop.slot === l.slot));
    if (aboard.length) {
      const gap = u * (inside ? 0.26 : 0.32);
      aboard.forEach((l, i) => {
        glyph(g, l.emoji, spotX + (i - (aboard.length - 1) / 2) * gap, spotY, u * 0.28);
      });
    }
    // Mud thrown up by the puddles, right over the body until it is washed off.
    if (car.mud > 0.02) {
      g.fillStyle = `rgba(87,62,32,${(car.mud * 0.6).toFixed(2)})`;
      const spots = mulberry32(3);
      for (let i = 0; i < 14; i++) {
        const mx = -ride.half * 1.2 + spots() * ride.half * 2.4;
        const my = -u * 0.1 - spots() * u * vehicle.height;
        g.beginPath();
        g.arc(mx, my, u * (0.03 + spots() * 0.045), 0, Math.PI * 2);
        g.fill();
      }
    }
    const lean = roadTilt(road, car.x);
    seat = {
      x: car.x + spotX * Math.cos(lean) - spotY * Math.sin(lean),
      y: y + bounce + spotX * Math.sin(lean) + spotY * Math.cos(lean),
    };
    g.restore();
    // The hose, while it is on a fire.
    if (hosing) {
      const fx = sx(slotX(road, hosing.slot));
      const fy = roadY(road, slotX(road, hosing.slot)) - u * 1.5;
      g.strokeStyle = 'rgba(125,211,252,0.85)';
      g.lineWidth = u * 0.09;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y - u * 0.7);
      g.quadraticCurveTo((x + fx) / 2, Math.min(y, fy) - u * 0.9, fx, fy);
      g.stroke();
      g.lineCap = 'butt';
    }
  }

  /** One of the other vehicles: the same bodies the child drives, a size down. */
  function drawTraveller(g: CanvasRenderingContext2D, v: Traveller): void {
    const u = road.unit;
    const far = v.lane === 'opposite';
    const scale = far ? 0.82 : 1;
    const x = sx(v.x);
    const y = roadY(road, v.x) + u * (far ? 0.06 : 0.3);
    const spec = TRAFFIC[v.kind];
    // The far lane comes the other way, so it is drawn mirrored — and the lean
    // has to be mirrored with it or a hill would tip it the wrong way.
    const dir = far ? -1 : 1;
    g.save();
    g.translate(x, y);
    g.scale(dir * scale, scale);
    g.rotate(roadTilt(road, v.x) * dir);
    drawRig(g, u, {
      shape: v.kind,
      wheelbase: spec.wheelbase,
      height: spec.height,
      body: v.body,
      trim: v.roof,
      spin: v.spin,
      dusk,
      clock,
    });
    g.restore();
    if (v.stuck > 0) glyph(g, '😤', x, y - u * 1.3 + Math.sin(clock * 5 + v.x) * u * 0.05, u * 0.4);
  }

  function drawCrossers(g: CanvasRenderingContext2D): void {
    const u = road.unit;
    for (const cr of crossers) {
      const size = u * cr.size;
      // The line trails: each one is a step behind the one in front of it.
      for (let i = 0; i < cr.count; i++) {
        const t = Math.max(0, cr.t - i * 0.09);
        const one = { ...cr, t };
        const waddle = Math.sin(clock * (cr.hurried ? 14 : 7) + i) * u * 0.05;
        g.globalAlpha = crosserFade(one);
        glyph(g, cr.emoji, sx(cr.x) + i * size * 0.78 + waddle, crosserY(one, road), size * crosserScale(one));
      }
    }
    g.globalAlpha = 1;
  }

  /** Loads on their way in or out, arcing between the roadside and the vehicle. */
  function drawHops(g: CanvasRenderingContext2D): void {
    for (const hop of hops) {
      const at = hopAt(hop, seat.x, seat.y, road.unit * HOP_LIFT);
      g.save();
      g.translate(sx(at.x), at.y);
      g.rotate(at.spin);
      glyph(g, hop.emoji, 0, 0, hop.size * at.scale);
      g.restore();
    }
  }

  function drawFlyers(g: CanvasRenderingContext2D): void {
    for (const f of flyers) {
      g.globalAlpha = Math.max(0, Math.min(1, f.life));
      glyph(g, f.emoji, sx(f.x), f.y, f.size);
    }
    g.globalAlpha = 1;
  }

  /** Every light that should still be burning once the sun is down. */
  function glows(): Glow[] {
    const out: Glow[] = [];
    const u = road.unit;
    const facing = car.v < -u * 0.2 ? -1 : 1;
    out.push(...beamGlows(sx(car.x) + facing * u * 0.7, roadY(road, car.x), u, facing));
    for (const prop of inView()) {
      for (const lamp of lampsFor(prop, sx(prop.x), roadY(road, prop.x), u)) {
        out.push({ ...lamp, strength: 0.55 });
      }
    }
    for (const v of travellers) {
      out.push({ x: sx(v.x) + (v.lane === 'same' ? u : -u), y: roadY(road, v.x), r: u * 1.1, strength: 0.5 });
    }
    return out;
  }

  function draw(g: CanvasRenderingContext2D): void {
    const s = scene();
    const p = paletteAt(s);
    const sky = weatherNow(s);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, road.w, road.h);
    drawSky(g, s, p);
    drawClouds(g, s, sky.weather);
    drawBirds(g, s);
    // Three ranges: the far one is the sea at the coast and a skyline in town.
    if (p.sea) drawSea(g, s);
    else if (p.city) drawSkyline(g, s);
    else drawHills(g, s, 0.12, (q) => q.far, 3.2);
    drawHills(g, s, 0.25, (q) => q.mid, 1.9);
    drawHills(g, s, 0.5, (q) => q.near, 1.05);
    drawThicket(g, s);
    const d = dressing();
    const props = inView();
    for (const prop of props) drawProp(g, d, prop, loadAt(job.kind, prop.slot), false);
    drawGround(g, s);
    drawRoad(g, s);
    for (const prop of props) drawProp(g, d, prop, loadAt(job.kind, prop.slot), true);
    for (const v of travellers) if (v.lane === 'opposite') drawTraveller(g, v);
    for (const v of travellers) if (v.lane === 'same') drawTraveller(g, v);
    drawCrossers(g);
    drawVehicle(g);
    drawHops(g);
    drawFlyers(g);
    drawVerge(g, s);
    drawWeather(g, s, sky.weather, sky.strength);
    const drift = driftNow(s);
    drawDrift(g, s, drift.biome, drift.strength);
    nightLayer.draw(g, s, glows());
  }

  let raf = 0;
  let last = 0;
  function loop(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(MAX_STEP, (now - last) / 1000) : 0.016;
    last = now;
    build();
    if (!c || !road.w) return;
    step(dt);
    draw(c);
  }

  // ---- the child ----

  /** Client x → canvas x in road pixels. */
  function acrossCanvas(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width ? road.w / rect.width : 1;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
  }

  /** Everything beside the road answers back when it is prodded. */
  function poke(worldX: number): void {
    let best: Prop | null = null;
    for (const prop of inView()) {
      if (Math.abs(prop.x - worldX) > road.unit * POKE_REACH) continue;
      if (best === null || Math.abs(prop.x - worldX) < Math.abs(best.x - worldX)) best = prop;
    }
    if (!best) return;
    const reply = pokeReply(best, job, seedFor(best.slot, clock));
    if (!reply) return;
    pokes.set(best.slot, clock);
    puff(best.x, roadY(road, best.x) - road.unit * 1.2, reply.emoji, reply.count);
    if (reply.fx) ctx.audio.fx(reply.fx);
    else ctx.audio.pop(0.9 + (best.slot % 5) * 0.08);
    if (reply.say) ctx.speak(reply.say);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    nudge = 0;
    poke(camX + acrossCanvas(e).x);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /** One of the two pedals. Held down, the car keeps going that way. */
  function pedal(btn: HTMLElement, dir: number): void {
    const push = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      ctx.hint.touch();
      nudge = 0;
      steer = dir;
      btn.classList.add('down');
    };
    const lift = (): void => {
      if (steer === dir) steer = 0;
      btn.classList.remove('down');
    };
    btn.addEventListener('pointerdown', push);
    btn.addEventListener('pointerup', lift);
    btn.addEventListener('pointercancel', lift);
    btn.addEventListener('pointerleave', lift);
  }
  pedal(fwd, 1);
  pedal(back, -1);

  horn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.hint.touch();
    ctx.audio.fx(vehicle.horn);
    replay(horn, 'anim-bounce');
    navigator.vibrate?.(10);
    // Everything in front gets a move on, herds included.
    const heard = honkAt(car.x, travellers, road);
    let scared = 0;
    for (const cr of crossers) {
      if (cr.x < car.x - road.unit || cr.x > car.x + road.unit * 8 || cr.hurried) continue;
      cr.hurried = true;
      scared++;
      puff(cr.x, crosserY(cr, road), '💨', 2);
    }
    if (scared) ctx.speak('Đàn vật chạy nhanh lên rồi!');
    else if (heard) ctx.speak('Xe phía trước tránh đường nào!');
  });

  const startWork = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    ctx.hint.touch();
    working = true;
    replay(act, 'anim-bounce');
  };
  const stopWork = (): void => {
    working = false;
  };
  act.addEventListener('pointerdown', startWork);
  act.addEventListener('pointerup', stopWork);
  act.addEventListener('pointercancel', stopWork);
  act.addEventListener('pointerleave', stopWork);

  night.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.hint.touch();
    wantNight = !wantNight;
    night.textContent = wantNight ? '☀️' : '🌙';
    root.classList.toggle('night', wantNight);
    save();
    ctx.audio.fx('sparkle');
    ctx.speak(wantNight ? 'Trời tối rồi, bật đèn lên!' : 'Trời sáng rồi!');
  });

  /**
   * Keep the vehicle the child took out and whether they left the lights off.
   * Written only after something they did on purpose, never every frame.
   */
  function save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave(vehicle, wantNight)));
    } catch {
      /* private browsing, or storage full: the drive still plays, it just forgets */
    }
  }

  function useVehicle(v: Vehicle): void {
    const changed = jobOf(v).kind !== job.kind;
    vehicle = v;
    job = jobOf(v);
    garage.textContent = v.emoji;
    garage.dataset.vehicle = v.id;
    if (changed) {
      loads = [];
      served = new Set();
      hosing = null;
      showLoads();
    }
    replay(garage, 'anim-bounce');
    save();
    ctx.audio.fx(v.horn);
    ctx.speak(`${v.name}. ${job.brief}`);
  }

  /**
   * The garage. Five buttons along the bottom were five things to press by
   * accident, so they live behind one door and only the one in use is on show.
   */
  function openGarage(): void {
    if (shutGarage) return;
    let done = false;
    // The tap that opened this must not also choose from it: a finger still down
    // when the panel appears would land on whatever turned up underneath it.
    const opened = Date.now();
    const settled = (): boolean => Date.now() - opened > 250;
    const finish = (picked: Vehicle | null): void => {
      if (done) return;
      done = true;
      overlay.remove();
      shutGarage = null;
      if (picked) useVehicle(picked);
    };
    const tiles = VEHICLES.map((v) => {
      const tile = h(
        'button',
        {
          class: `pp-tile drive-pick${v.id === vehicle.id ? ' selected' : ''}`,
          type: 'button',
          'data-vehicle': v.id,
          'aria-label': v.name,
        },
        h('span', { class: 'drive-pick-face' }, v.emoji),
        h('span', { class: 'drive-pick-name' }, v.name),
      );
      tile.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (settled()) finish(v);
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
      { class: 'pp-overlay drive-picker' },
      h('div', { class: 'pp-panel' }, h('div', { class: 'pp-grid' }, ...tiles)),
      shut,
    );
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay && settled()) finish(null);
    });
    root.append(overlay);
    shutGarage = () => finish(null);
    ctx.audio.tick();
  }

  garage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    replay(garage, 'anim-bounce');
  });
  garage.addEventListener('pointerup', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    openGarage();
  });

  ctx.hint.arm(() => {
    replay(fwd, 'anim-wiggle');
    // Roll forward a little on its own, so the child sees what the button would do.
    if (steer === 0) nudge = car.x + road.unit * 2;
  });

  const onResize = (): void => {
    canvas.width = 0;
  };
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    shutGarage?.();
    window.removeEventListener('resize', onResize);
    if (raf) cancelAnimationFrame(raf);
  });

  build();
  car = makeCar(road);
  camX = car.x - road.w * CAMERA_AT;
  fuelBar.style.width = '100%';
  // Back where the child left off: the same vehicle, at the same time of day.
  let saved: ReturnType<typeof readSave> = null;
  try {
    saved = readSave(localStorage.getItem(SAVE_KEY));
  } catch {
    /* private browsing: start with the little red car in daylight */
  }
  if (saved) {
    vehicle = vehicleById(saved.vehicle) ?? vehicle;
    job = jobOf(vehicle);
    wantNight = saved.night;
    dusk = saved.night ? 1 : 0;
    night.textContent = wantNight ? '☀️' : '🌙';
    root.classList.toggle('night', wantNight);
  }
  garage.textContent = vehicle.emoji;
  garage.dataset.vehicle = vehicle.id;
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
}

const game: GameModule = { ...meta, start };
export default game;
