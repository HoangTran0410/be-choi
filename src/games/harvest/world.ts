/**
 * Day, night and weather. The day itself is the garden game's (same sun, same sky
 * colours), so the two farms look alike; the rain is new.
 */
import { dayPhase, daylight, skyStops } from '../garden/logic';

export { dayPhase, daylight, skyStops };

export interface Weather {
  raining: boolean;
  /** Seconds until the rain stops / starts. */
  left: number;
}

export const RAIN_MIN_S = 18;
export const RAIN_MAX_S = 26;
export const DRY_MIN_S = 70;
export const DRY_MAX_S = 130;

export function newWeather(rng: () => number = Math.random): Weather {
  return { raining: false, left: DRY_MIN_S + rng() * (DRY_MAX_S - DRY_MIN_S) };
}

/** Move the weather on. Returns 'start' or 'stop' on the tick the rain begins or ends. */
export function stepWeather(w: Weather, dt: number, rng: () => number = Math.random): 'start' | 'stop' | null {
  w.left -= Math.max(0, dt);
  if (w.left > 0) return null;
  w.raining = !w.raining;
  w.left = w.raining ? RAIN_MIN_S + rng() * (RAIN_MAX_S - RAIN_MIN_S) : DRY_MIN_S + rng() * (DRY_MAX_S - DRY_MIN_S);
  return w.raining ? 'start' : 'stop';
}

/** `gradient` for the sky behind the whole farm. */
export function skyGradient(clock: number, raining: boolean): string {
  const [top, mid, low] = skyStops(clock);
  return raining
    ? `linear-gradient(180deg, color-mix(in srgb, ${top} 70%, #64748b), color-mix(in srgb, ${mid} 70%, #94a3b8), ${low})`
    : `linear-gradient(180deg, ${top}, ${mid} 55%, ${low})`;
}

/** Where along the sky (0 … 1, left to right) the sun or the moon is, and which one. */
export function skyBodyAt(clock: number): { along: number; moon: boolean } {
  const phase = dayPhase(clock);
  const moon = phase >= 0.5;
  return { along: moon ? (phase - 0.5) * 2 : phase * 2, moon };
}

export type TimeWord = 'sáng' | 'trưa' | 'chiều' | 'tối';

/** For a parent glancing at the screen and for spoken hints. */
export function timeOfDay(clock: number): TimeWord {
  const p = dayPhase(clock);
  if (p < 0.2) return 'sáng';
  if (p < 0.42) return 'trưa';
  if (p < 0.62) return 'chiều';
  return 'tối';
}
