import type { FxKind } from './audio';

/**
 * The pitch (Hz) each recorded take sings at, in take order, so that
 * `audio.pitched(kind, hz)` can retune it by playing it faster or slower.
 *
 * Measured offline with `python3 scripts/voicepitch.py` (autocorrelation over the
 * voiced stretch, median). A meow glides, so this is the middle of the glide, not
 * a single note: retuned meows land within about a semitone of the target, which
 * a child hears as "the right tune", not as a tuner reads it. A voice that is not
 * listed cannot be retuned and `pitched` falls back to a synthesized voice.
 *
 * Re-measure after changing the takes in `public/sfx`.
 */
export const VOICE_HZ: Readonly<Partial<Record<FxKind, readonly number[]>>> = {
  // meow-0 (kitten) · meow-1 (kittens) · meow-2 (one cat)
  meow: [1225, 1132, 919],
};

/** How fast to play a take of `kind` so that it sings at `hz`. 1 when unknown. */
export function pitchRate(kind: FxKind, take: number, hz: number): number {
  const base = VOICE_HZ[kind]?.[take];
  if (!base || !(hz > 0)) return 1;
  return hz / base;
}
