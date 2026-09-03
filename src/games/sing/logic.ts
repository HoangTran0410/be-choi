/**
 * The parts of the stage that are not the song itself. Words, melodies and the
 * beat → line lookup live in `core/music`, so every game can share them.
 */

/** Animals watching from the front row. */
export const AUDIENCE: readonly string[] = ['🐰', '🐻', '🐼', '🦊', '🐨', '🐸'];

/** Notes that float up while the child sings, from the lowest voice to the highest. */
export const NOTE_EMOJI: readonly string[] = ['🎵', '🎶', '🎼'];

/** Low / middle / high voice, for the colour of the note that floats up. Silence counts as middle. */
export function pitchBand(hz: number | null): number {
  if (hz === null || !Number.isFinite(hz)) return 1;
  if (hz < 260) return 0;
  if (hz > 420) return 2;
  return 1;
}
