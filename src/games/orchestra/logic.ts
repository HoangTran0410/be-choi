import { DRUMS, type DrumKind, type Timbre } from '../../core/audio';

/** Sixteenth-note steps in one bar of 4/4. */
export const STEPS = 16;

/** One minute of playing with at least `STAR_MIN_ACTIVE` animals on stage earns a star. */
export const STAR_AFTER_MS = 60000;
export const STAR_MIN_ACTIVE = 3;
/** With nobody playing, the sequencer keeps counting silently for this many bars, then stops. */
export const SILENT_BARS = 8;

export interface Part {
  id: string;
  emoji: string;
  /** Vietnamese name (aria-label only; the game never speaks over the music). */
  name: string;
  kind: 'drum' | 'note';
  /** Synth voice for `note` parts. */
  timbre?: Timbre;
  /** Tile colour (hex). */
  color: string;
  /**
   * One bar, `STEPS` long. Drum parts hold a `DrumKind` per step; note parts hold
   * note names (`'C4'`, chords as `'C4+E4+G4'`); `null` is a rest.
   */
  pattern: readonly (string | null)[];
  /** Per-bar alternatives cycled with the bar counter (index 0 is `pattern`). Each is `STEPS` long. */
  bars?: readonly (readonly (string | null)[])[];
  /** How many sixteenth steps a note rings (note parts only). */
  hold?: number;
}

export interface Groove {
  id: string;
  emoji: string;
  name: string;
  bpm: number;
  /** Whole band transposed by this many semitones. */
  semitones: number;
}

/** `'C3 . . E3'` → `['C3', null, null, 'E3']`; `.` is a rest. Must have exactly `STEPS` tokens. */
function bar(text: string): (string | null)[] {
  const steps = text
    .trim()
    .split(/\s+/)
    .map((tok) => (tok === '.' ? null : tok));
  if (steps.length !== STEPS) throw new Error(`orchestra: bar needs ${STEPS} steps, got ${steps.length}`);
  return steps;
}

/** A bar with `chord` on steps 0 and 8. */
function chordBar(chord: string): (string | null)[] {
  const steps: (string | null)[] = Array.from({ length: STEPS }, () => null);
  steps[0] = chord;
  steps[8] = chord;
  return steps;
}

const CHORDS = [chordBar('C4+E4+G4'), chordBar('A3+C4+E4'), chordBar('F3+A3+C4'), chordBar('G3+B3+D4')];
const MELODY = [bar('E4 . G4 . A4 . G4 . E4 . D4 . C4 . D4 .'), bar('C4 . D4 . E4 . G4 . A4 . G4 . E4 . . .')];

/** Six animals, each looping one part of the same song. */
export const PARTS: readonly Part[] = [
  {
    id: 'bear',
    emoji: '🐻',
    name: 'trống',
    kind: 'drum',
    color: '#f97316',
    pattern: bar('kick . hat . snare . hat . kick . hat . snare . hat .'),
  },
  {
    id: 'frog',
    emoji: '🐸',
    name: 'bass',
    kind: 'note',
    timbre: 'bass',
    color: '#22c55e',
    hold: 3,
    pattern: bar('C3 . . E3 G2 . . G2 A2 . . C3 F2 . G2 .'),
  },
  {
    id: 'cat',
    emoji: '🐱',
    name: 'đàn',
    kind: 'note',
    timbre: 'piano',
    color: '#ec4899',
    hold: 4,
    pattern: CHORDS[0] ?? [],
    bars: CHORDS,
  },
  {
    id: 'rabbit',
    emoji: '🐰',
    name: 'giai điệu',
    kind: 'note',
    timbre: 'xylo',
    color: '#a855f7',
    hold: 2,
    pattern: MELODY[0] ?? [],
    bars: MELODY,
  },
  {
    id: 'monkey',
    emoji: '🐵',
    name: 'lắc',
    kind: 'drum',
    color: '#facc15',
    pattern: bar('. hat . hat . hat clap hat . hat . hat . hat clap hat'),
  },
  {
    id: 'bird',
    emoji: '🐦',
    name: 'chuông',
    kind: 'note',
    timbre: 'bell',
    color: '#3b82f6',
    hold: 2,
    pattern: bar('C5 . . E5 . . G5 . . C5 . . E5 . . G5'),
  },
];

export const GROOVES: readonly Groove[] = [
  { id: 'vui', emoji: '😊', name: 'vui', bpm: 112, semitones: 0 },
  { id: 'nhay', emoji: '🕺', name: 'nhảy', bpm: 132, semitones: 2 },
  { id: 'ru', emoji: '🌙', name: 'ru', bpm: 88, semitones: -3 },
];

export function isDrumKind(value: string): value is DrumKind {
  return (DRUMS as readonly string[]).includes(value);
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function transposeOne(note: string, semis: number): string {
  const m = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!m) return note;
  const [, letter = 'C', acc = '', oct = '4'] = m;
  const index = (BASE[letter] ?? 0) + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + Number(oct) * 12 + Math.round(semis);
  if (index < 0) return note;
  const octave = Math.floor(index / 12);
  if (octave > 9) return note;
  return `${NAMES[index % 12] ?? 'C'}${octave}`;
}

/**
 * Shift a note name by `semis` semitones: `'C4' + 2 → 'D4'`, `'B4' + 1 → 'C5'`,
 * `'C4' − 1 → 'B3'`. Accepts `#`/`b`, always writes sharps. Chords (`'C4+E4+G4'`)
 * are shifted note by note. `'R'` or anything unparseable is returned unchanged.
 */
export function transpose(note: string, semis: number): string {
  if (note.includes('+')) return note.split('+').map((n) => transposeOne(n, semis)).join('+');
  return transposeOne(note, semis);
}

/** The pattern `part` plays in bar number `bar` (cycles through `bars` when present). */
export function patternFor(part: Part, bar: number): readonly (string | null)[] {
  const bars = part.bars;
  if (!bars || bars.length === 0) return part.pattern;
  const i = ((bar % bars.length) + bars.length) % bars.length;
  return bars[i] ?? part.pattern;
}

export interface StepEvent {
  part: Part;
  /** A `DrumKind`, or note names joined with `+`. */
  value: string;
}

/** Everything the active parts play on `step` of bar `bar`. Steps wrap past the bar. */
export function stepEvents(
  active: ReadonlySet<string>,
  step: number,
  bar: number,
  parts: readonly Part[] = PARTS,
): StepEvent[] {
  const s = ((step % STEPS) + STEPS) % STEPS;
  const out: StepEvent[] = [];
  for (const part of parts) {
    if (!active.has(part.id)) continue;
    const value = patternFor(part, bar)[s];
    if (value) out.push({ part, value });
  }
  return out;
}

/** Milliseconds per sixteenth-note step. */
export function stepMs(bpm: number): number {
  return 60000 / bpm / 4;
}

/** Seconds a note of `part` rings at `bpm` (its `hold` in steps; default one eighth note). */
export function noteSeconds(part: Part, bpm: number): number {
  return (stepMs(bpm) * (part.hold ?? 2)) / 1000;
}
