import { SCALE_C, scaleIndex, type Song } from '../../core/music';

/** The eight bars, C4 … C5 (longest/lowest first). */
export const BARS: readonly string[] = SCALE_C;

/** Rainbow bar colours, low to high. */
export const BAR_COLORS: readonly string[] = [
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
];

/** Length of bar `i` as a percent of the longest bar: 100 for C4, 62 for C5, linear in between. */
export function barLength(i: number): number {
  return Math.round((100 - (38 * i) / 7) * 100) / 100;
}

export interface Expected {
  /** SCALE_C index of the bar to hit. */
  bar: number;
  /** Position of that note in `song.notes`. */
  index: number;
}

/** The next playable note at or after `index` (rests skipped), or null when the song is finished. */
export function expectedBar(song: Song, index: number): Expected | null {
  for (let i = Math.max(0, index); i < song.notes.length; i++) {
    const note = song.notes[i];
    if (!note || note.n === 'R') continue;
    const bar = scaleIndex(note.n);
    if (bar < 0) continue;
    return { bar, index: i };
  }
  return null;
}

export interface Advance {
  index: number;
  correct: boolean;
  /** Nothing is left to play after this note. */
  done: boolean;
}

/** Tapping `tappedBar` at song position `index`: move past the note when it is the expected one. */
export function advance(song: Song, index: number, tappedBar: number): Advance {
  const expected = expectedBar(song, index);
  if (!expected) return { index, correct: false, done: true };
  if (expected.bar !== tappedBar) return { index, correct: false, done: false };
  const next = expected.index + 1;
  return { index: next, correct: true, done: expectedBar(song, next) === null };
}
