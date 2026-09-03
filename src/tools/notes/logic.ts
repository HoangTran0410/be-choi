/**
 * The model behind the notes editor, with no DOM in it: a draft of one song, the
 * edits the editor can make to that draft, the beat arithmetic that says where the
 * lyric lines fall against the melody, and the `seq(…)` / `line(…)` source text to
 * paste back into `core/music.ts`. The editor only ever reads `music.ts`; nothing
 * here writes a file.
 */
import type { Phrase, Song, SongNote } from '../../core/music';

/** The rest token used by `seq`. */
export const REST = 'R';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
/** Lowest and highest octave a note can be dragged to. */
const MIN_OCTAVE = 2;
const MAX_OCTAVE = 7;

/** Note lengths the editor offers, in beats. 0.33/0.67 are the 6/8 songs' eighth and quarter. */
export const DURATIONS: readonly number[] = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4];

/** One song being edited. Notes and phrases are copies, so editing never touches SONGS. */
export interface Draft {
  id: string;
  title: string;
  icon: string;
  bpm: number;
  notes: SongNote[];
  /** Empty for a melody with no words of its own. */
  phrases: Phrase[];
}

export function draftFromSong(song: Song): Draft {
  return {
    id: song.id,
    title: song.title,
    icon: song.icon,
    bpm: song.bpm,
    notes: song.notes.map((n) => ({ n: n.n, d: n.d })),
    phrases: (song.lyrics ?? []).map((p) => ({ emoji: p.emoji, text: p.text, beats: p.beats })),
  };
}

function cloneDraft(draft: Draft): Draft {
  return { ...draft, notes: draft.notes.map((n) => ({ ...n })), phrases: draft.phrases.map((p) => ({ ...p })) };
}

// ---- Pitch ----

export interface Pitch {
  letter: string;
  acc: '' | '#' | 'b';
  octave: number;
}

export function parsePitch(name: string): Pitch | null {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) return null;
  return { letter: m[1] ?? 'C', acc: (m[2] ?? '') as Pitch['acc'], octave: Number(m[3]) };
}

/**
 * Where a note sits on the grid: one row per letter, so seven rows to the octave.
 * A flat or sharp shares the row of its letter and wears a badge — the whole songbook
 * has exactly one accidental (`Bb4`), which is not worth twelve rows an octave.
 */
export function pitchRow(name: string): number {
  const p = parsePitch(name);
  if (!p) return -1;
  return p.octave * 7 + LETTERS.indexOf(p.letter as (typeof LETTERS)[number]);
}

export function rowPitch(row: number): string {
  const octave = Math.floor(row / 7);
  return `${LETTERS[((row % 7) + 7) % 7] ?? 'C'}${octave}`;
}

/** Move a note up or down the scale. The accidental is dropped: `♮ ♯ ♭` is its own control. */
export function stepPitch(name: string, steps: number): string {
  const row = pitchRow(name);
  if (row < 0) return name;
  const next = Math.min(MAX_OCTAVE * 7 + 6, Math.max(MIN_OCTAVE * 7, row + steps));
  return rowPitch(next);
}

export function setAcc(name: string, acc: Pitch['acc']): string {
  const p = parsePitch(name);
  if (!p) return name;
  return `${p.letter}${acc}${p.octave}`;
}

/**
 * The grid rows for a melody, top (highest) first, with `pad` spare rows above and
 * below so a note has somewhere to be dragged to. Rests live on their own row and
 * are not counted here.
 */
export function pitchRows(notes: readonly SongNote[], pad = 1): string[] {
  const rows = notes.map((n) => pitchRow(n.n)).filter((r) => r >= 0);
  const lo = (rows.length > 0 ? Math.min(...rows) : pitchRow('C4')) - pad;
  const hi = (rows.length > 0 ? Math.max(...rows) : pitchRow('C5')) + pad;
  const out: string[] = [];
  for (let r = hi; r >= lo; r--) out.push(rowPitch(r));
  return out;
}

// ---- Duration ----

/** Round to the nearest 0.25 beat, never shorter than that. */
export function snapDuration(beats: number): number {
  return Math.max(0.25, Math.round(beats * 4) / 4);
}

/** Move to the next longer (or shorter) length the editor offers. */
export function stepDuration(beats: number, steps: number): number {
  let nearest = 0;
  for (let i = 1; i < DURATIONS.length; i++) {
    const here = DURATIONS[i] ?? 0;
    const best = DURATIONS[nearest] ?? 0;
    if (Math.abs(here - beats) < Math.abs(best - beats)) nearest = i;
  }
  const at = Math.min(DURATIONS.length - 1, Math.max(0, nearest + steps));
  return DURATIONS[at] ?? 1;
}

// ---- Beats ----

/** Rounded to 2 decimals: 0.33 + 0.33 + 0.33 should read as 0.99, not 0.9899999. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The beat each note starts on. */
export function noteStarts(notes: readonly SongNote[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const note of notes) {
    out.push(round2(at));
    at += note.d;
  }
  return out;
}

export function totalNoteBeats(notes: readonly SongNote[]): number {
  return round2(notes.reduce((sum, n) => sum + n.d, 0));
}

export interface Span {
  start: number;
  end: number;
}

/** Where each lyric line begins and ends, in beats. */
export function phraseSpans(phrases: readonly Phrase[]): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const phrase of phrases) {
    out.push({ start: round2(at), end: round2(at + phrase.beats) });
    at += phrase.beats;
  }
  return out;
}

export interface BeatCheck {
  notes: number;
  lyrics: number;
  /** Positive: the melody runs past the words. Negative: the words run past the melody. */
  diff: number;
}

export function beatCheck(draft: Draft): BeatCheck {
  const notes = totalNoteBeats(draft.notes);
  const lyrics = round2(draft.phrases.reduce((sum, p) => sum + p.beats, 0));
  return { notes, lyrics, diff: round2(notes - lyrics) };
}

/**
 * Lyric lines whose ending falls in the middle of a note. That note is held across the
 * line break, so the karaoke line changes mid-note — the thing that has to be seen to
 * be fixed.
 */
export function overflowingPhrases(notes: readonly SongNote[], phrases: readonly Phrase[]): Set<number> {
  const starts = noteStarts(notes);
  const out = new Set<number>();
  phraseSpans(phrases).forEach((span, i) => {
    for (let j = 0; j < notes.length; j++) {
      const start = starts[j] ?? 0;
      const end = round2(start + (notes[j]?.d ?? 0));
      if (start < span.end && end > span.end) out.add(i);
    }
  });
  return out;
}

/** Index of the first and last note of a lyric line, for looping just that line. */
export function phraseNoteRange(notes: readonly SongNote[], phrases: readonly Phrase[], index: number): Span | null {
  const span = phraseSpans(phrases)[index];
  if (!span) return null;
  const starts = noteStarts(notes);
  let first = -1;
  let last = -1;
  for (let i = 0; i < notes.length; i++) {
    const start = starts[i] ?? 0;
    if (start >= span.start && start < span.end) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return first < 0 ? null : { start: first, end: last };
}

// ---- Edits ----

export function withNote(draft: Draft, index: number, patch: Partial<SongNote>): Draft {
  const next = cloneDraft(draft);
  const note = next.notes[index];
  if (!note) return draft;
  next.notes[index] = { n: patch.n ?? note.n, d: patch.d ?? note.d };
  return next;
}

/** Copy the note at `index` in right after it, so a new note starts from something sensible. */
export function withInsertedNote(draft: Draft, index: number): Draft {
  const next = cloneDraft(draft);
  const note = next.notes[index] ?? { n: 'C4', d: 1 };
  next.notes.splice(index + 1, 0, { n: note.n, d: note.d });
  return next;
}

export function withoutNote(draft: Draft, index: number): Draft {
  if (draft.notes.length <= 1 || !draft.notes[index]) return draft;
  const next = cloneDraft(draft);
  next.notes.splice(index, 1);
  return next;
}

/** Lyric lines are whole numbers of beats everywhere in the songbook; keep it that way. */
export function withPhraseBeats(draft: Draft, index: number, beats: number): Draft {
  const phrase = draft.phrases[index];
  if (!phrase) return draft;
  const next = cloneDraft(draft);
  const at = next.phrases[index];
  if (at) at.beats = Math.max(1, Math.round(beats));
  return next;
}

// ---- Source text ----

function num(n: number): string {
  return String(round2(n));
}

export function noteToken(note: SongNote): string {
  return note.d === 1 ? note.n : `${note.n}:${num(note.d)}`;
}

/**
 * The melody broken into one line per lyric line, which is how the songbook is written
 * and the only way a long `seq` string stays readable. A melody with no words is broken
 * every 8 beats; anything left over after the last lyric line gets its own line.
 */
export function noteLines(draft: Draft): string[] {
  const starts = noteStarts(draft.notes);
  const spans =
    draft.phrases.length > 0
      ? phraseSpans(draft.phrases)
      : Array.from({ length: Math.ceil(totalNoteBeats(draft.notes) / 8) }, (_, i) => ({ start: i * 8, end: i * 8 + 8 }));
  const lines: string[] = [];
  let taken = 0;
  for (const span of spans) {
    const tokens: string[] = [];
    while (taken < draft.notes.length && (starts[taken] ?? 0) < span.end) {
      const note = draft.notes[taken];
      if (note) tokens.push(noteToken(note));
      taken++;
    }
    if (tokens.length > 0) lines.push(tokens.join(' '));
  }
  const rest = draft.notes.slice(taken);
  if (rest.length > 0) lines.push(rest.map(noteToken).join(' '));
  return lines;
}

export type Quote = '"' | "'";

function str(text: string, quote: Quote): string {
  return `${quote}${text}${quote}`;
}

/**
 * The `notes:` property, laid out the way the songbook writes it: one quoted line per
 * lyric line, joined with `+`, with a trailing space inside every line but the last.
 */
export function seqSource(draft: Draft, quote: Quote = '"'): string {
  const lines = noteLines(draft);
  if (lines.length <= 1) return `    notes: seq(${str(lines[0] ?? '', quote)}),`;
  const body = lines
    .map((line, i) => {
      const text = i === lines.length - 1 ? line : `${line} `;
      const indent = i === 0 ? '      ' : '        ';
      const tail = i === lines.length - 1 ? '' : ' +';
      return `${indent}${str(text, quote)}${tail}`;
    })
    .join('\n');
  return `    notes: seq(\n${body},\n    ),`;
}

export function lyricsSource(draft: Draft, quote: Quote = '"'): string {
  if (draft.phrases.length === 0) return '';
  const body = draft.phrases.map((p) => `      line(${str(p.emoji, quote)}, ${str(p.text, quote)}, ${num(p.beats)}),`).join('\n');
  return `    lyrics: [\n${body}\n    ],`;
}

/** What the 📋 button puts on the clipboard: the melody, plus the words when their beats moved. */
export function clipboardSource(draft: Draft, song: Song, quote: Quote = '"'): string {
  const moved = draft.phrases.some((p, i) => p.beats !== song.lyrics?.[i]?.beats);
  const lyrics = moved ? lyricsSource(draft, quote) : '';
  return lyrics ? `${seqSource(draft, quote)}\n${lyrics}` : seqSource(draft, quote);
}

// ---- Drafts kept between reloads ----

export function draftKey(id: string): string {
  return `be-choi:notes:${id}`;
}

export function serializeDraft(draft: Draft): string {
  return JSON.stringify({
    notes: draft.notes.map(noteToken),
    phrases: draft.phrases.map((p) => p.beats),
  });
}

/**
 * Read a saved draft back onto `song`. Only the melody and the lyric beats were saved,
 * so the words themselves always come from the file — a draft can never go stale about
 * them. Returns null for anything that does not parse.
 */
export function parseDraft(raw: string, song: Song): Draft | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { notes, phrases } = data as { notes?: unknown; phrases?: unknown };
  if (!Array.isArray(notes) || notes.length === 0 || !Array.isArray(phrases)) return null;
  const draft = draftFromSong(song);
  const parsed: SongNote[] = [];
  for (const token of notes) {
    if (typeof token !== 'string') return null;
    const [name, beats] = token.split(':');
    if (!name || (name !== REST && !parsePitch(name))) return null;
    const d = beats === undefined ? 1 : Number(beats);
    if (!Number.isFinite(d) || d <= 0) return null;
    parsed.push({ n: name, d });
  }
  if (phrases.length !== draft.phrases.length) return null;
  for (let i = 0; i < phrases.length; i++) {
    const beats = phrases[i];
    if (typeof beats !== 'number' || !Number.isFinite(beats) || beats <= 0) return null;
    const phrase = draft.phrases[i];
    if (phrase) phrase.beats = beats;
  }
  draft.notes = parsed;
  return draft;
}

// ---- Undo ----

export interface History<T> {
  /** Record a new state. Anything that had been undone is dropped. */
  push(value: T): void;
  undo(): T | null;
  redo(): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
}

const HISTORY_MAX = 200;

export function createHistory<T>(initial: T): History<T> {
  let states: T[] = [initial];
  let at = 0;
  return {
    push(value) {
      states = states.slice(0, at + 1);
      states.push(value);
      if (states.length > HISTORY_MAX) states.shift();
      at = states.length - 1;
    },
    undo() {
      if (at === 0) return null;
      at--;
      return states[at] ?? null;
    },
    redo() {
      if (at >= states.length - 1) return null;
      at++;
      return states[at] ?? null;
    },
    canUndo: () => at > 0,
    canRedo: () => at < states.length - 1,
  };
}
