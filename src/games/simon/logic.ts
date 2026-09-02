export interface SimonPad {
  emoji: string;
  /** Vietnamese name, used as the accessible label. */
  name: string;
  /** Scientific pitch name, e.g. `C4`. */
  note: string;
  /** Pad colour (hex). */
  color: string;
}

/** Four animal pads on a C major chord, low to high. */
export const PADS: readonly SimonPad[] = [
  { emoji: '🐸', name: 'con ếch', note: 'C4', color: '#22c55e' },
  { emoji: '🐱', name: 'con mèo', note: 'E4', color: '#facc15' },
  { emoji: '🐶', name: 'con chó', note: 'G4', color: '#3b82f6' },
  { emoji: '🐦', name: 'con chim', note: 'C5', color: '#ec4899' },
];

/** The first melody has this many notes. */
export const START_LEN = 2;
/** After a melody this long is repeated, the game starts over. */
export const MAX_LEN = 6;
/** Repeating a melody this long earns a star. */
export const STAR_AT = 4;
/** How long each pad lights up and sounds. */
export const PLAY_MS = 550;
/** Silence between two pads of the melody. */
export const GAP_MS = 180;

/** A random pad index that would not make three of the same pad in a row. */
function nextPad(seq: readonly number[], rng: () => number): number {
  const last = seq[seq.length - 1];
  const beforeLast = seq[seq.length - 2];
  const banned = last !== undefined && last === beforeLast ? last : -1;
  const choices = PADS.map((_, i) => i).filter((i) => i !== banned);
  return choices[Math.floor(rng() * choices.length)] ?? 0;
}

/** `seq` plus one more pad index; never the same pad three times in a row. */
export function extend(seq: readonly number[], rng: () => number = Math.random): number[] {
  return [...seq, nextPad(seq, rng)];
}

/** `len` pad indices; never the same pad three times in a row. */
export function makeSequence(len: number, rng: () => number = Math.random): number[] {
  let seq: number[] = [];
  for (let i = 0; i < len; i++) seq = extend(seq, rng);
  return seq;
}

/**
 * The child tapped `pad` at position `step` of `seq`:
 * `'complete'` when it matches the last step, `'ok'` when it matches an
 * earlier one, `'wrong'` otherwise.
 */
export function checkStep(seq: readonly number[], step: number, pad: number): 'ok' | 'wrong' | 'complete' {
  if (seq[step] !== pad) return 'wrong';
  return step === seq.length - 1 ? 'complete' : 'ok';
}
