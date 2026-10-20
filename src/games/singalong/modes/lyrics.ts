/** Words of a line, in order. */
export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Share of a line's time over which its words light up one by one (the rest is a breath before the next line). */
export const SWEEP = 0.85;

export interface WordTiming {
  words: string[];
  /** Gap between one word lighting up and the next, ms. */
  perMs: number;
}

/**
 * When each word of a sung line should light up: evenly across the line, so the
 * child's eye is led along the words at the speed of the song.
 */
export function wordTiming(text: string, beats: number, beatMs: number): WordTiming {
  const words = wordsOf(text);
  const total = Math.max(0, beats) * Math.max(0, beatMs) * SWEEP;
  return { words, perMs: words.length > 0 ? Math.round(total / words.length) : 0 };
}

/** Slower than the written tempo: a three-year-old needs time to find the words. */
export const TEMPO = 0.85;

export function beatMsOf(bpm: number): number {
  return 60000 / (Math.max(30, bpm) * TEMPO);
}
