/**
 * Every robot has its own dance. A pose is a pure function of where the music is (a continuous
 * beat count), so all the robots stay in step with the groove and with each other, and a dance
 * never drifts the way a separate timer would.
 */
export type DanceId = 'stomp' | 'tap' | 'sway' | 'bob' | 'strum' | 'mallet' | 'lean' | 'bow' | 'shake' | 'ring';

export const DANCES: readonly DanceId[] = ['stomp', 'tap', 'sway', 'bob', 'strum', 'mallet', 'lean', 'bow', 'shake', 'ring'];

export interface Pose {
  /** Lift as a share of the figure's height (up is positive). */
  y: number;
  /** Whole-body tilt, degrees (clockwise is positive). */
  rot: number;
  sx: number;
  sy: number;
  /** Head tilt, degrees. */
  head: number;
  /** How far each arm is lifted away from its resting place, degrees. */
  armL: number;
  armR: number;
  /** Tilt of the instrument, degrees. */
  prop: number;
}

const TAU = Math.PI * 2;

/** Zero on the beat and the half beat's worth of hop in between: feet land on the beat. */
const hop = (beat: number): number => Math.abs(Math.sin(Math.PI * beat));
/** One on the beat, nought halfway between. */
const thump = (beat: number): number => (1 + Math.cos(TAU * beat)) / 2;
/** A half-wave: swings up and rests; for a stick coming down on a drum. */
const strike = (x: number): number => Math.max(0, Math.sin(TAU * x));

/**
 * The pose at `beat` (0 … 4, continuous; every dance repeats exactly every 4 beats).
 * `level` 1 … 3 is how busy the robot plays: bigger and, on level 3, double time.
 * `pulse` 0 … 1 is a flash that follows each note the robot plays.
 */
export function pose(dance: DanceId, beat: number, level: number, pulse = 0): Pose {
  const a = 0.75 + 0.125 * Math.min(3, Math.max(1, level));
  const k = level >= 3 ? 2 : 1;
  const p: Pose = { y: 0, rot: 0, sx: 1, sy: 1, head: 0, armL: 0, armR: 0, prop: 0 };
  switch (dance) {
    case 'stomp': {
      const t = thump(beat);
      p.sy = 1 - 0.07 * a * t;
      p.sx = 1 + 0.04 * a * t;
      p.head = 6 * a * t;
      p.armL = 24 * a * Math.max(0, Math.sin(Math.PI * beat));
      p.armR = 24 * a * Math.max(0, -Math.sin(Math.PI * beat));
      p.y = 0.03 * a * hop(beat * k);
      break;
    }
    case 'tap':
      p.y = 0.04 * a * hop(beat);
      p.armL = 40 * a * strike(beat * k);
      p.armR = 40 * a * strike(beat * k + 0.5);
      p.head = 5 * a * Math.sin(TAU * beat);
      break;
    case 'sway':
      p.rot = 8 * a * Math.sin(Math.PI * beat);
      p.y = 0.03 * a * hop(beat);
      p.head = -4 * a * Math.sin(Math.PI * beat);
      p.armL = 8 * a * Math.sin(Math.PI * beat);
      p.armR = -8 * a * Math.sin(Math.PI * beat);
      p.prop = -6 * a * Math.sin(Math.PI * beat);
      break;
    case 'bob':
      p.y = 0.07 * a * hop(beat);
      p.head = 7 * a * Math.cos(TAU * beat);
      p.armL = 16 * a * hop(beat * k);
      p.armR = 16 * a * hop(beat * k + 0.5);
      p.rot = 3 * a * Math.sin(Math.PI * beat);
      break;
    case 'strum':
      p.y = 0.05 * a * hop(beat);
      p.rot = 4 * a * Math.sin(TAU * beat);
      p.armR = 18 * a * Math.sin(TAU * beat * 2 * k);
      p.armL = 4 * a * Math.sin(TAU * beat);
      p.prop = 3 * a * Math.sin(TAU * beat);
      break;
    case 'mallet':
      p.y = 0.05 * a * hop(beat);
      p.armL = 36 * a * strike(beat * k);
      p.armR = 36 * a * strike(beat * k + 0.5);
      p.head = 5 * a * Math.sin(TAU * beat);
      break;
    case 'lean': {
      const s = Math.sin((Math.PI * beat) / 2);
      p.rot = -9 * a * s;
      p.y = 0.03 * a * hop(beat);
      p.prop = 7 * a * s;
      p.head = 4 * a * Math.sin(TAU * beat);
      p.armL = 4 * a * s;
      p.armR = 4 * a * s;
      break;
    }
    case 'bow':
      p.rot = 6 * a * Math.sin(Math.PI * beat);
      p.y = 0.03 * a * hop(beat);
      p.armR = 22 * a * Math.sin(TAU * beat * k);
      p.head = 7 * a * Math.sin(Math.PI * beat);
      p.prop = 2 * a * Math.sin(TAU * beat);
      break;
    case 'shake':
      p.y = 0.06 * a * Math.abs(Math.sin(TAU * beat));
      p.armL = 16 * a * Math.sin(TAU * beat * 4);
      p.armR = 16 * a * Math.sin(TAU * beat * 4 + Math.PI);
      p.rot = 5 * a * Math.sin(TAU * beat);
      p.head = 5 * a * Math.sin(TAU * beat * 2);
      break;
    case 'ring':
      p.y = 0.05 * a * hop(beat);
      p.armL = 26 * a * strike(beat * k);
      p.armR = 26 * a * strike(beat * k + 0.5);
      p.head = 6 * a * Math.sin(TAU * beat * 2);
      p.prop = 6 * a * Math.sin(TAU * beat * 2);
      break;
  }
  if (pulse > 0) {
    p.y += 0.04 * pulse;
    p.sx *= 1 + 0.05 * pulse;
    p.sy *= 1 + 0.05 * pulse;
  }
  return p;
}
