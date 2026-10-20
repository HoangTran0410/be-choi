import type { DrumKind, InstrumentId, Timbre } from '../../../core/audio';
import type { GameContext } from '../../../core/types';

/** Every sound source in the app that has a playable simulation. */
export type InstrumentKind = Timbre | DrumKind | InstrumentId;

/** How a board is built and played. */
export type Family =
  | 'keyboard'
  | 'bars'
  | 'tines'
  | 'chimes'
  | 'fret'
  | 'harp'
  | 'bow'
  | 'tube'
  | 'harmonica'
  | 'panflute'
  | 'accordion'
  | 'kit'
  | 'rack'
  | 'djembe'
  | 'pan'
  | 'gong'
  | 'shake';

/** `free` = the instrument's own scale; `pentatonic` = every note snapped to C major pentatonic, so nothing can clash. */
export type Harmony = 'free' | 'pentatonic';

export type Shape =
  { t: 'rect'; x: number; y: number; w: number; h: number } | { t: 'ell'; cx: number; cy: number; rx: number; ry: number };

/** What a zone sounds like when it is touched. */
export type Voice =
  | { t: 'note'; timbre: Timbre; freq: number; dur: number }
  | { t: 'inst'; id: InstrumentId; freq: number; dur?: number }
  | { t: 'drum'; drum: DrumKind };

/**
 * play   – a bar, key, pad, drum head: sounds when touched (and when a finger slides onto it, if the board glides)
 * chord  – picks the chord the strings will sound (fretted instruments)
 * hole   – a finger hole / valve / key that toggles and changes the note (wind)
 * blow   – the mouthpiece: hold it to make the sound
 * strum  – the strings of a fretted instrument: swipe across them
 * bow    – a place on a bowed string: drag along it
 * shake  – a shaker: tap it or wave a finger (or the device) over it
 */
export type Role = 'play' | 'chord' | 'hole' | 'blow' | 'strum' | 'bow' | 'shake';

export interface Zone {
  id: string;
  shape: Shape;
  role: Role;
  voices: Voice[];
  /** A touch target that is smaller than the 72 px rule on purpose (a black key, the rim of a drum). */
  small?: boolean;
  /** Holding a finger on it after the hit damps the sound (gong, chimes). */
  mute?: boolean;
  /** Greyed out because it is outside the chosen scale (still plays, snapped). */
  dim?: boolean;
}

export interface StrumSpec {
  /** Where the strings are: x positions (`axis: 'x'`) or y positions, in board pixels, in string order. */
  lines: number[];
  axis: 'x' | 'y';
  /** Chord name → one voice per string (null = muted string). */
  chords: Record<string, (Voice | null)[]>;
  order: string[];
}

export interface Board {
  kind: InstrumentKind;
  family: Family;
  w: number;
  h: number;
  /** Portrait boards turn keyboards and bars on their side. */
  portrait: boolean;
  harmony: Harmony;
  zones: Zone[];
  /** The whole drawing, an `<svg>…</svg>` string with a `<g class="z" data-z="id">` for each zone. */
  svg: string;
  /** Sliding a finger from zone to zone plays each one it crosses. */
  glide: boolean;
  strum?: StrumSpec;
  /** Wind: maps which holes are covered to the note sounded. */
  fingering?: (covered: boolean[]) => Voice;
  /** Ids of the hole zones, in order. */
  holes?: string[];
}

export interface NoteEvent {
  kind: InstrumentKind;
  zoneId: string;
  voice: Voice | null;
  /** 0…1, how hard it was played (from the pace of touching). */
  vel: number;
}

export interface InstrumentOptions {
  harmony?: Harmony;
  /** When false the instrument is drawn but silent and untouchable. */
  enabled?: boolean;
}

export interface InstrumentHandle {
  readonly kind: InstrumentKind;
  /** The current board (rebuilt when the host resizes). */
  board(): Board;
  /** Listen to every note played (also those the child did not touch: a strum plays several). Returns an unsubscribe function. */
  onNote(cb: (e: NoteEvent) => void): () => void;
  setEnabled(on: boolean): void;
  /** Play a zone from code (e.g. a demo); counts as a touch. */
  hit(zoneId: string, vel?: number): void;
  destroy(): void;
}

export type CreateInstrument = (kind: InstrumentKind, host: HTMLElement, ctx: GameContext, opts?: InstrumentOptions) => InstrumentHandle;
