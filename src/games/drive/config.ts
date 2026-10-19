/** Tuning constants and small shared shapes for the drive screen. */

/** Longest frame the drive will take in one step. */
export const MAX_STEP = 0.05;
/** The car sits this far across the screen, so there is road to see ahead. */
export const CAMERA_AT = 0.34;
/** How fast the camera catches up with the car. */
export const CAMERA_LAG = 6;
export const DROP_WAVE_MS = 1400;
/** How fast the sky slides between day and night when the button is pressed. */
export const DUSK_PER_SECOND = 0.55;
/** A tap this far from something (in units) counts as prodding it. */
export const POKE_REACH = 1.4;
/** How long between new vehicles joining the road. */
export const TRAFFIC_GAP = 3.2;
/** How long between traffic jams, and between herds of ducks. Both are meant to
 *  be a surprise, not a toll booth: too often and the road stops being a drive. */
export const JAM_GAP = 62;
export const HERD_GAP = 46;
/** The child is warned once the tank is under this. */
export const LOW_FUEL = 0.22;

export interface Flyer {
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
export interface Light {
  redAt: number;
  green: boolean;
}
