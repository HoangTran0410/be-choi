import { createMic, type Mic } from '../../core/mic';
import type { GameContext } from '../../core/types';
import type { Band } from './catalog';
import { ACTIVE_LEVEL, bandOf, createOnset, heightOf, HIT_LEVEL, stepTap } from './signal';

/**
 * One voice for the whole game. The microphone (when allowed) and a finger on the
 * singer both feed it, so every mode works with either, and a child whose parent
 * said "no" to the microphone is never stuck.
 */
export interface VoiceFrame {
  /** 0 … 1: the louder of the microphone and the finger. */
  level: number;
  /** Hz while someone sings and the microphone can tell, else null. */
  pitch: number | null;
  /** 0 (deep) … 1 (squeaky), held for a moment between syllables. Null when unknown. */
  height: number | null;
  band: Band | null;
  /** The level is high enough to count as singing or clapping. */
  active: boolean;
  /** A new sound began on this frame. */
  onset: boolean;
}

export interface Voice {
  /** The microphone is on and frames carry its level. */
  readonly micOn: boolean;
  /** The microphone was refused (or does not exist). The button stays, to ask again. */
  readonly micRefused: boolean;
  /** The raw microphone, for the echo game's recorder. */
  readonly mic: Mic;
  requestMic(): Promise<boolean>;
  /** A finger goes down on the singer. */
  press(): void;
  release(): void;
  /** One quick clap. */
  hit(): void;
  onFrame(fn: (frame: VoiceFrame) => void): () => void;
  last(): VoiceFrame;
}

export const FRAME_MS = 33;
/** Pitch and height outlive a gap this long, so a syllable break does not reset the reaction. */
const HOLD_MS = 280;

export function createVoice(ctx: Pick<GameContext, 'onCleanup'>): Voice {
  const mic = createMic({ pitch: true });
  const listeners = new Set<(frame: VoiceFrame) => void>();
  const onset = createOnset();
  let micLevel = 0;
  let micPitch: number | null = null;
  let tap = 0;
  let held = false;
  let refused = false;
  let asking: Promise<boolean> | null = null;
  let alive = true;
  let height: number | null = null;
  let band: Band | null = null;
  let holdLeft = 0;
  let current: VoiceFrame = { level: 0, pitch: null, height: null, band: null, active: false, onset: false };

  mic.onFrame((f) => {
    micLevel = f.level;
    micPitch = f.pitch;
  });

  const timer = setInterval(() => {
    tap = stepTap(tap, held, FRAME_MS);
    const level = Math.max(micLevel, tap);
    const h = heightOf(micPitch);
    if (h !== null) {
      height = h;
      band = bandOf(micPitch);
      holdLeft = HOLD_MS;
    } else if (holdLeft > 0) {
      holdLeft -= FRAME_MS;
    } else {
      height = null;
      band = null;
    }
    current = {
      level,
      pitch: micPitch,
      height,
      band,
      active: level > ACTIVE_LEVEL,
      onset: onset.step(level, FRAME_MS),
    };
    for (const fn of [...listeners]) fn(current);
  }, FRAME_MS);

  ctx.onCleanup(() => {
    alive = false;
    clearInterval(timer);
    listeners.clear();
    mic.stop();
  });

  return {
    get micOn() {
      return mic.listening;
    },
    get micRefused() {
      return refused;
    },
    mic,
    async requestMic() {
      if (mic.listening) return true;
      asking ??= mic.start();
      const ok = await asking;
      asking = null;
      if (!alive) {
        mic.stop();
        return false;
      }
      refused = !ok;
      return ok;
    },
    press() {
      held = true;
      tap = HIT_LEVEL;
    },
    release() {
      held = false;
    },
    hit() {
      tap = HIT_LEVEL;
    },
    onFrame(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    last: () => current,
  };
}
