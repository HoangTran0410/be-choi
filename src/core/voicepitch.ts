import type { FxKind } from './audio';

/**
 * The pitch (Hz) each recorded take sings at, in take order, so that
 * `audio.pitched(kind, hz)` can retune it by playing it faster or slower.
 *
 * Measured offline with `python3 scripts/voicepitch.py <kind>` (autocorrelation over
 * the voiced stretch, median). Only a voice that holds one pitch belongs here: an
 * animal call glides, so the median says nothing about the note a child hears.
 * The meow was measured at 1225 / 1132 / 919 Hz but glides by +-2-3 semitones
 * (the kitten take jumps an octave), which made retuned cats sound random; it is
 * now sung by `catvoice.ts` instead and has no entry. Re-measure after changing
 * the takes in `public/sfx`.
 */
export const VOICE_HZ: Readonly<Partial<Record<FxKind, readonly number[]>>> = {};

/** How fast to play a take of `kind` so that it sings at `hz`. 1 when unknown. */
export function pitchRate(kind: FxKind, take: number, hz: number): number {
  const base = VOICE_HZ[kind]?.[take];
  if (!base || !(hz > 0)) return 1;
  return hz / base;
}
