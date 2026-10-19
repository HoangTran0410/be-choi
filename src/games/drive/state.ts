import { h, mulberry32 } from '../../core/dom';
import type { GameContext } from '../../core/types';
import { VEHICLES, makeCar, makeRoad, propsIn, type Car, type Prop, type Road, type Vehicle } from './logic';
import { jobOf, type Hop, type Job, type Load } from './jobs';
import type { Crosser, Traveller } from './traffic';
import { makeNight, type Scene } from './scenery';
import { HERD_GAP, JAM_GAP, type Flyer, type Light } from './config';

/** The elements the game puts on the stage. */
export interface Els {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  horn: HTMLElement;
  act: HTMLElement;
  night: HTMLElement;
  badge: HTMLElement;
  fuelBar: HTMLElement;
  fuel: HTMLElement;
  forkPanel: HTMLElement;
  back: HTMLElement;
  fwd: HTMLElement;
  garage: HTMLElement;
}

/** Everything one drive session shares: handed to each module instead of being captured. */
export interface Drive {
  ctx: GameContext;
  el: Els;
  rng: () => number;
  alive: boolean;
  dpr: number;
  road: Road;
  car: Car;
  vehicle: Vehicle;
  job: Job;
  camX: number;
  clock: number;
  /**
   * Which way the child is holding: 1 forward, -1 back, 0 coasting. Driving lives
   * on its own two buttons because the road itself is for prodding — a finger put
   * down to shake a tree must never also be a foot on the accelerator.
   */
  steer: number;
  /** A world x the hint is coaxing the car towards, ignored once it is reached. */
  nudge: number;
  /** What is in the back right now. */
  loads: Load[];
  /** Pick-up points already emptied, so nothing is collected twice. */
  served: Set<number>;
  /** Fires already put out. */
  doused: Set<number>;
  /** The fire being hosed, and how long the hose has been on it. */
  hosing: { slot: number; t: number } | null;
  lights: Map<number, Light>;
  /** Crossings the car has woken up: slot → seconds into the cycle. */
  crossings: Map<number, number>;
  /** Forks decided, and whether the uphill way was taken. */
  chosen: Map<number, boolean>;
  /** Slot → when it was last prodded, for the wobble. */
  pokes: Map<number, number>;
  flyers: Flyer[];
  /** Loads in mid-air between the roadside and the back of the vehicle. */
  hops: Hop[];
  /** Where the seat or the load bed was last drawn, so a hop has somewhere to land. */
  seat: { x: number; y: number };
  travellers: Traveller[];
  crossers: Crosser[];
  wet: Set<number>;
  deliveries: number;
  waved: number;
  /** 0 in daylight, 1 at night, sliding between the two. */
  dusk: number;
  wantNight: boolean;
  /** Countdowns for the things that turn up on their own. */
  nextTraffic: number;
  nextJam: number;
  nextHerd: number;
  /** Forks already announced, and whether the low tank has been mentioned. */
  asked: Set<number>;
  warned: boolean;
  /** Whichever job button is being held down. */
  working: boolean;
  /** The fork the panel is currently offering, if any. */
  asking: number | null;
  /** Closes the garage door, when it is open. */
  shutGarage: (() => void) | null;
  nightLayer: ReturnType<typeof makeNight>;
}

/** Build the DOM, mount it on the stage, and return the fresh state. */
export function makeDrive(ctx: GameContext): Drive {
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

  const road = makeRoad(1, 1);
  const vehicle = VEHICLES[0]!;
  return {
    ctx,
    el: { root, canvas, horn, act, night, badge, fuelBar, fuel, forkPanel, back, fwd, garage },
    rng: mulberry32(7),
    alive: true,
    dpr: 1,
    road,
    car: makeCar(road),
    vehicle,
    job: jobOf(vehicle),
    camX: 0,
    clock: 0,
    steer: 0,
    nudge: 0,
    loads: [],
    served: new Set(),
    doused: new Set(),
    hosing: null,
    lights: new Map(),
    crossings: new Map(),
    chosen: new Map(),
    pokes: new Map(),
    flyers: [],
    hops: [],
    seat: { x: 0, y: 0 },
    travellers: [],
    crossers: [],
    wet: new Set(),
    deliveries: 0,
    waved: -9,
    dusk: 0,
    wantNight: false,
    nextTraffic: 1.5,
    nextJam: JAM_GAP,
    nextHerd: HERD_GAP,
    asked: new Set(),
    warned: false,
    working: false,
    asking: null,
    shutGarage: null,
    nightLayer: makeNight(),
  };
}

export const sceneOf = (d: Drive): Scene => ({ road: d.road, camX: d.camX, clock: d.clock, dusk: d.dusk });
export const topSpeed = (d: Drive): number => d.vehicle.speed * d.road.unit;
/** World x → screen x. */
export const screenX = (d: Drive, x: number): number => x - d.camX;

/** Everything on screen, plus a little either side. */
export function inView(d: Drive): Prop[] {
  return propsIn(d.road, d.camX - d.road.unit * 3, d.camX + d.road.w + d.road.unit * 4);
}
