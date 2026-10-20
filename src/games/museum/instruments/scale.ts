/** Notes as MIDI numbers (60 = C4), and the two scales the simulations use. */

export const midiFreq = (m: number): number => Math.round(440 * Math.pow(2, (m - 69) / 12) * 100) / 100;

/** Semitones of C major pentatonic within an octave. */
export const PENTA = [0, 2, 4, 7, 9] as const;
/** Semitones of C major. */
export const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;

export function inPenta(m: number): boolean {
  return (PENTA as readonly number[]).includes(((m % 12) + 12) % 12);
}

/** Nearest pentatonic note; a tie goes up. */
export function snapPenta(m: number): number {
  if (inPenta(m)) return m;
  for (let d = 1; d <= 2; d++) {
    if (inPenta(m + d)) return m + d;
    if (inPenta(m - d)) return m - d;
  }
  return m;
}

/** `count` ascending pentatonic notes from `start` (a C). */
export function pentaFrom(start: number, count: number): number[] {
  const out: number[] = [];
  let m = start;
  while (out.length < count) {
    if (inPenta(m)) out.push(m);
    m++;
  }
  return out;
}

/** `count` ascending notes of C major from `start` (a C). */
export function majorFrom(start: number, count: number): number[] {
  const out: number[] = [];
  let m = start;
  while (out.length < count) {
    if ((MAJOR as readonly number[]).includes(((m % 12) + 12) % 12)) out.push(m);
    m++;
  }
  return out;
}

/** Apply the harmony mode to one note. */
export function tune(m: number, harmony: 'free' | 'pentatonic'): number {
  return harmony === 'pentatonic' ? snapPenta(m) : m;
}

/** The notes of the four chords every fretted instrument offers (all in C major). */
export const CHORD_ORDER = ['C', 'Am', 'F', 'G'] as const;
export type ChordName = (typeof CHORD_ORDER)[number];
