import type { DrumKind } from '../../core/audio';

export interface Pad {
  kind: DrumKind;
  /** Emoji shown on the pad. */
  emoji: string;
  /** Vietnamese name spoken when the pad is hit. */
  name: string;
  /** Pad colour (hex). */
  color: string;
}

/** Six drum pads, one per synthesized percussion sound. */
export const PADS: readonly Pad[] = [
  { kind: 'kick', emoji: '🥁', name: 'trống cái', color: '#ef4444' },
  { kind: 'snare', emoji: '🪘', name: 'trống con', color: '#f97316' },
  { kind: 'hat', emoji: '✨', name: 'chũm chọe', color: '#facc15' },
  { kind: 'tom', emoji: '🪵', name: 'trống tom', color: '#22c55e' },
  { kind: 'clap', emoji: '👏', name: 'vỗ tay', color: '#3b82f6' },
  { kind: 'cowbell', emoji: '🔔', name: 'chuông bò', color: '#a855f7' },
];

export const BEAT_BPM = 100;
/** Eighth notes: one bar of 4/4. */
export const BEAT_STEPS = 8;

/**
 * Sounds that play on a given eighth-note step of the play-along beat.
 * Kick on beats 1 and 3, snare on 2 and 4, hi-hat on every step. Wraps past the bar.
 */
export function beatAt(step: number): DrumKind[] {
  const s = ((step % BEAT_STEPS) + BEAT_STEPS) % BEAT_STEPS;
  const kinds: DrumKind[] = [];
  if (s % 4 === 0) kinds.push('kick');
  if (s % 4 === 2) kinds.push('snare');
  kinds.push('hat');
  return kinds;
}

/** Milliseconds per eighth-note step. */
export function stepMs(bpm: number = BEAT_BPM): number {
  return 60000 / bpm / 2;
}

export const STAR_EVERY = 40;
