import { NUMBERS_VI, type Item } from '../../core/content';
import type { SongNote } from '../../core/music';

export interface Flavor {
  id: string;
  /** Vietnamese flavour name, spoken aloud. */
  name: string;
  /** Sponge colour. */
  cake: string;
  /** Icing / drip colour. */
  icing: string;
}

export const FLAVORS: readonly Flavor[] = [
  { id: 'strawberry', name: 'dâu', cake: '#f9a8d4', icing: '#fdf2f8' },
  { id: 'chocolate', name: 'sô-cô-la', cake: '#8b5a2b', icing: '#d9a066' },
  { id: 'vanilla', name: 'va-ni', cake: '#fde68a', icing: '#fffbeb' },
  { id: 'matcha', name: 'trà xanh', cake: '#86efac', icing: '#ecfdf5' },
  { id: 'blueberry', name: 'việt quất', cake: '#c4b5fd', icing: '#f5f3ff' },
];

export const TOPPINGS: readonly Item[] = [
  { emoji: '🍓', name: 'dâu tây' },
  { emoji: '🍒', name: 'anh đào' },
  { emoji: '🫐', name: 'việt quất' },
  { emoji: '🍫', name: 'sô-cô-la' },
  { emoji: '🍬', name: 'kẹo' },
  { emoji: '🍪', name: 'bánh quy' },
  { emoji: '🥝', name: 'kiwi' },
  { emoji: '🍇', name: 'nho' },
];

export const MAX_CANDLES = 6;

function seq(text: string): SongNote[] {
  // "C4:0.75 C4:0.25 D4" → notes; ":x" is beats (default 1)
  return text
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, d] = tok.split(':');
      return { n: n ?? 'R', d: d ? Number(d) : 1 };
    });
}

/** "Happy Birthday to You" (public domain), in F major, 3/4 with a pickup. */
export const HAPPY_BIRTHDAY: readonly SongNote[] = seq(
  'C4:0.75 C4:0.25 D4 C4 F4 E4:2 C4:0.75 C4:0.25 D4 C4 G4 F4:2 C4:0.75 C4:0.25 C5 A4 F4 E4 D4:2 Bb4:0.75 Bb4:0.25 A4 F4 G4 F4:2',
);
export const HAPPY_BIRTHDAY_BPM = 120;

export type Phase = 'decorate' | 'light' | 'blow' | 'done';
export type PhaseEvent = 'lightAll' | 'allLit' | 'allOut' | 'again';

/** Decorate → light → blow → done → decorate. Events that do not apply keep the phase. */
export function nextPhase(phase: Phase, event: PhaseEvent): Phase {
  switch (phase) {
    case 'decorate':
      return event === 'lightAll' ? 'light' : phase;
    case 'light':
      return event === 'allLit' ? 'blow' : phase;
    case 'blow':
      return event === 'allOut' ? 'done' : phase;
    case 'done':
      return event === 'again' ? 'decorate' : phase;
  }
}

/**
 * Loudness of a time-domain byte buffer from an AnalyserNode (128 = silence):
 * RMS of the signal, 0 for silence up to about 1 for a full-scale square wave.
 */
export function blowStrength(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = ((samples[i] ?? 128) - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length));
}

/** A blow this loud (two polls in a row) puts the candles out. */
export const BLOW_THRESHOLD = 0.12;

/** How many candles there are, spoken like counting the child's age. */
export function candleWord(n: number): string {
  return NUMBERS_VI[n] ?? String(n);
}
