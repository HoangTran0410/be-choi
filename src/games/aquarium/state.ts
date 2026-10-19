import type { Point } from '../../core/creature';
import { perf } from '../../core/frame';
import { decorCount } from '../../core/quality';
import {
  makeTank,
  type Bubble,
  type Creature,
  type Decor,
  type Food,
  type Interest,
  type Nudge,
  type Plant,
  type Rock,
  type Shelter,
  type Tank,
} from './logic';

const MAX_BUBBLES = 90;

/** The few elements the game owns. */
export interface Els {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  feed: HTMLButtonElement;
  net: HTMLElement;
  add: HTMLButtonElement;
  lamp: HTMLButtonElement;
}

/** Everything that changes while the tank runs, shared by input, simulation and drawing. */
export interface State {
  els: Els;
  alive: boolean;
  dpr: number;
  tank: Tank;
  creatures: Creature[];
  plants: Plant[];
  decor: Decor[];
  rocks: Rock[];
  sand: number[];
  bubbles: Bubble[];
  foods: Food[];
  nudge: Nudge | null;
  shelters: Shelter[];
  /** Something that was just poked, and is worth a look. */
  interest: Interest | null;
  /** The fish in the child's fingers, and where the finger went down. */
  held: Creature | null;
  grabFrom: Point | null;
  grabCandidate: Creature | null;
  /** A plant or an ornament the child is sliding along the sand. */
  moving: Plant | Decor | null;
  /** What would be slid along the sand if the finger travels from here. */
  movable: Plant | Decor | null;
  /** Lights out: the tank is dark except for the pool under the lamp. */
  night: boolean;
  /** Eases between day and night so the switch is a dimmer, not a light switch. */
  dusk: number;
  taps: number;
  clock: number;
  frame: number;
  feeding: boolean;
  /** When the last handful went in, on the tank's own clock. */
  lastFed: number;
}

export function createState(els: Els): State {
  return {
    els,
    alive: true,
    dpr: 1,
    tank: makeTank(1, 1),
    creatures: [],
    plants: [],
    decor: [],
    rocks: [],
    sand: [],
    bubbles: [],
    foods: [],
    nudge: null,
    shelters: [],
    interest: null,
    held: null,
    grabFrom: null,
    grabCandidate: null,
    moving: null,
    movable: null,
    night: false,
    dusk: 0,
    taps: 0,
    clock: 0,
    frame: 0,
    feeding: false,
    lastFed: -Infinity,
  };
}

/** Bubbles are decoration: fewer while the device struggles. */
export function maxBubbles(): number {
  return decorCount(MAX_BUBBLES, perf.low, 10);
}
