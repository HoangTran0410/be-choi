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

// ---- record & replay ----

/** One recorded strike: bar index and ms since the recording started. */
export interface RecEvent {
  bar: number;
  t: number;
}

/** A recording stops on its own after this long. */
export const REC_MAX_MS = 60000;
/** Strikes kept per recording (a toddler mashing bars for a minute stays well under this). */
export const REC_MAX_EVENTS = 400;

function isRecEvent(v: unknown): v is RecEvent {
  if (typeof v !== 'object' || v === null) return false;
  const { bar, t } = v as Record<string, unknown>;
  return (
    typeof bar === 'number' &&
    Number.isInteger(bar) &&
    bar >= 0 &&
    bar < BARS.length &&
    typeof t === 'number' &&
    Number.isFinite(t) &&
    t >= 0 &&
    t <= REC_MAX_MS
  );
}

/** JSON for localStorage; only `bar` and `t` are kept, capped at REC_MAX_EVENTS. */
export function serializeRec(events: readonly RecEvent[]): string {
  return JSON.stringify(events.slice(0, REC_MAX_EVENTS).map(({ bar, t }) => ({ bar, t })));
}

/** Inverse of serializeRec. Null for invalid JSON or a malformed event; capped at REC_MAX_EVENTS. */
export function parseRec(json: string): RecEvent[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const out: RecEvent[] = [];
  for (const item of data) {
    if (!isRecEvent(item)) return null;
    if (out.length < REC_MAX_EVENTS) out.push({ bar: item.bar, t: item.t });
  }
  return out;
}
