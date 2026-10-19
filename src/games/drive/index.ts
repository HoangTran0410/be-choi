import { startLoop } from '../../core/frame';
import { readRaw } from '../../core/save';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { FULL_THROTTLE, SAVE_KEY, makeCar, readSave, stepCar, vehicleById } from './logic';
import { jobOf, stepHop } from './jobs';
import { CAMERA_AT, CAMERA_LAG, DUSK_PER_SECOND, MAX_STEP } from './config';
import { makeDrive, type Drive } from './state';
import { build, watchPerf } from './road';
import { halts, stopLine, traffic, wakeLights, wakeRails } from './trains';
import { forks, showPlace } from './fork';
import { errands, refreshAct } from './errands';
import { stepFlyers } from './fx';
import { draw } from './render';
import { bindControls } from './controls';
import './style.css';

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
 *
 * The state lives in one `Drive` (state.ts) handed to each module: road.ts fits
 * the canvas, trains.ts holds the lights, level crossing and other traffic,
 * errands.ts the job in hand, fork.ts the choice of way, render.ts draws and
 * controls.ts listens to the child and saves what they chose.
 */

/** One frame of simulation. */
function step(d: Drive, dt: number): void {
  const { car, road } = d;
  d.clock += dt;
  d.dusk += Math.max(-1, Math.min(1, (d.wantNight ? 1 : 0) - d.dusk)) * Math.min(1, dt * DUSK_PER_SECOND * 4);
  d.dusk = Math.max(0, Math.min(1, d.dusk));
  const target = d.steer !== 0 ? car.x + d.steer * road.unit * FULL_THROTTLE * 2 : Math.max(car.x, d.nudge);
  wakeLights(d);
  wakeRails(d, dt);
  const stops = halts(d);
  traffic(d, dt, stops);
  forks(d);
  stepCar(car, target, dt, road, d.vehicle, stopLine(d, stops));
  d.camX += (car.x - road.w * CAMERA_AT - d.camX) * Math.min(1, dt * CAMERA_LAG);
  errands(d, dt);
  refreshAct(d);
  showPlace(d);
  stepFlyers(d, dt);
  for (let i = d.hops.length - 1; i >= 0; i--) {
    const hop = d.hops[i]!;
    // The wave from the doorway waits until somebody is actually at the door.
    if (stepHop(hop, dt) && !hop.boarding) d.waved = d.clock;
    if (hop.t >= 1) d.hops.splice(i, 1);
  }
}

function start(ctx: GameContext): void {
  const d = makeDrive(ctx);
  const { el } = d;
  const c = el.canvas.getContext('2d');

  ctx.onCleanup(watchPerf(d));

  function loop(_now: number, dtMs: number): void {
    if (!d.alive) return;
    // No gap yet on the first frame (or the first after the tab was hidden).
    const dt = dtMs ? Math.min(MAX_STEP, dtMs / 1000) : 0.016;
    build(d);
    if (!c || !d.road.w) return;
    step(d, dt);
    draw(d, c);
  }

  bindControls(d);

  const onResize = (): void => {
    el.canvas.width = 0;
  };
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    d.alive = false;
    d.shutGarage?.();
    window.removeEventListener('resize', onResize);
  });

  build(d);
  d.car = makeCar(d.road);
  d.camX = d.car.x - d.road.w * CAMERA_AT;
  el.fuelBar.style.width = '100%';
  // Back where the child left off: the same vehicle, at the same time of day.
  const saved = readSave(readRaw(SAVE_KEY));
  if (saved) {
    d.vehicle = vehicleById(saved.vehicle) ?? d.vehicle;
    d.job = jobOf(d.vehicle);
    d.wantNight = saved.night;
    d.dusk = saved.night ? 1 : 0;
    el.night.textContent = d.wantNight ? '☀️' : '🌙';
    el.root.classList.toggle('night', d.wantNight);
  }
  el.garage.textContent = d.vehicle.emoji;
  el.garage.dataset.vehicle = d.vehicle.id;
  startLoop(ctx, loop);
}

const game: GameModule = { ...meta, start };
export default game;
