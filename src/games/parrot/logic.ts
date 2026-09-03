import type { FxKind } from '../../core/audio';

/**
 * The animals that repeat the child's voice. `rate` is the playback speed of the
 * recording, which shifts the pitch with it: above 1 is small and squeaky, below
 * 1 is big and slow.
 */
export interface Critter {
  id: string;
  emoji: string;
  /** Vietnamese name, spoken when the child picks it. */
  name: string;
  rate: number;
  /** Voice used when there is no microphone, so tapping still does something. */
  fx: FxKind;
}

export const CRITTERS: readonly Critter[] = [
  { id: 'parrot', emoji: '🦜', name: 'vẹt', rate: 1.5, fx: 'chirp' },
  { id: 'mouse', emoji: '🐭', name: 'chuột', rate: 2, fx: 'kazoo' },
  { id: 'robot', emoji: '🤖', name: 'rô-bốt', rate: 0.85, fx: 'zap' },
  { id: 'elephant', emoji: '🐘', name: 'voi', rate: 0.65, fx: 'elephant' },
  { id: 'dino', emoji: '🦖', name: 'khủng long', rate: 0.5, fx: 'roar' },
];

/**
 * Longest recording; it stops on its own so a held button never runs away. Long
 * enough for a whole sung line — at five seconds a child was still mid-sentence
 * when the game cut them off. The slowest animal plays this back at half speed,
 * so this is also half of the longest playback anyone has to sit through.
 */
export const MAX_RECORD_MS = 15000;
/** Bars in the waveform strip. */
export const BARS = 16;
/** A star every this many playbacks. */
export const STAR_EVERY = 3;

export function findCritter(id: string): Critter | undefined {
  return CRITTERS.find((c) => c.id === id);
}

/**
 * Add the newest level to a rolling strip of `n` bars, oldest first. Bars stay in
 * 0 … 1 and the strip never grows past `n`.
 */
export function pushBar(bars: readonly number[], level: number, n = BARS): number[] {
  const v = level < 0 ? 0 : level > 1 ? 1 : level;
  const out = [...bars, v];
  return out.length > n ? out.slice(out.length - n) : out;
}

export function shouldStar(plays: number): boolean {
  return plays > 0 && plays % STAR_EVERY === 0;
}
