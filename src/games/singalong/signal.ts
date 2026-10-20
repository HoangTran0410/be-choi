/**
 * Small pure helpers that turn the raw voice (or a finger) into things the stage
 * can react to: how high the voice is, when a new sound starts, and when a
 * recording should stop on its own.
 */
import type { Band } from './catalog';

/** Below this the voice counts as low, above this as high (children sing roughly 250 – 500 Hz). */
export const LOW_HZ = 260;
export const HIGH_HZ = 420;

/** Low / middle / high, or null when there is no pitch to judge. */
export function bandOf(hz: number | null): Band | null {
  if (hz === null || !Number.isFinite(hz) || hz <= 0) return null;
  if (hz < LOW_HZ) return 0;
  if (hz > HIGH_HZ) return 2;
  return 1;
}

/** 0 (deep) … 1 (squeaky) on a musical scale, so an octave is the same distance anywhere. */
export function heightOf(hz: number | null): number | null {
  if (hz === null || !Number.isFinite(hz) || hz <= 0) return null;
  const lo = Math.log2(150);
  const hi = Math.log2(650);
  const v = (Math.log2(hz) - lo) / (hi - lo);
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** A level above this counts as "making sound". */
export const ACTIVE_LEVEL = 0.2;

export interface Onset {
  /** Feed one frame; true on the frame a new sound starts. */
  step(level: number, dtMs: number): boolean;
  reset(): void;
}

/** Hysteresis plus a short cooldown, so one loud "aaa" is one hit and a clap is one hit. */
export function createOnset(on = 0.38, off = 0.2, cooldownMs = 150): Onset {
  let high = false;
  let wait = 0;
  return {
    step(level, dtMs) {
      wait = Math.max(0, wait - dtMs);
      if (!high && level >= on && wait === 0) {
        high = true;
        wait = cooldownMs;
        return true;
      }
      if (high && level <= off) high = false;
      return false;
    },
    reset() {
      high = false;
      wait = 0;
    },
  };
}

/** Level of a finger on the singer: a firm hit, settling to a steady hold, fading when let go. */
export const HOLD_LEVEL = 0.6;
export const HIT_LEVEL = 0.9;

export function stepTap(level: number, held: boolean, dtMs: number): number {
  const target = held ? HOLD_LEVEL : 0;
  if (level > target) return Math.max(target, level - dtMs * 0.004);
  return target;
}

export type RecordState = 'waiting' | 'voice' | 'done' | 'gaveup';

export interface AutoStopOptions {
  /** Give up if nothing is sung for this long. */
  startTimeoutMs?: number;
  /** Stop after this much quiet once singing has begun. */
  silenceMs?: number;
  /** Never record longer than this. */
  maxMs?: number;
  /** A sound shorter than this is a cough, not singing. */
  minVoiceMs?: number;
}

export interface AutoStop {
  feed(level: number, dtMs: number): RecordState;
}

/** Decide when a recording is over without anybody pressing "stop". */
export function createAutoStop(opts: AutoStopOptions = {}): AutoStop {
  const startTimeout = opts.startTimeoutMs ?? 4000;
  const silence = opts.silenceMs ?? 1100;
  const max = opts.maxMs ?? 8000;
  const minVoice = opts.minVoiceMs ?? 300;
  let total = 0;
  let voiced = 0;
  let quiet = 0;
  let state: RecordState = 'waiting';
  return {
    feed(level, dtMs) {
      if (state === 'done' || state === 'gaveup') return state;
      total += dtMs;
      if (level > ACTIVE_LEVEL) {
        voiced += dtMs;
        quiet = 0;
      } else {
        quiet += dtMs;
      }
      if (voiced >= minVoice) state = 'voice';
      if (state === 'voice' && (quiet >= silence || total >= max)) state = 'done';
      else if (state === 'waiting' && total >= startTimeout) state = 'gaveup';
      return state;
    },
  };
}
