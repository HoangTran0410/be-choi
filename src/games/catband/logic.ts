import type { DrumKind, Timbre } from '../../core/audio';
import { SCALE_C, noteFreq, type Song } from '../../core/music';
import { loadVersioned, saveVersioned, type Backend } from '../../core/save';

/* ------------------------------------------------------------------------ *
 * The eight cats and their notes
 * ------------------------------------------------------------------------ */

export const CAT_COUNT = 8;

/** Pitch class (0 = C) of each cat's note: C D E F G A B C. */
export const CAT_PC: readonly number[] = [0, 2, 4, 5, 7, 9, 11, 0];

/**
 * The pitch a cat meows at. The scale is C5…C6, an octave above the one the
 * xylophone plays: a cat's voice sits up there, and a recorded kitten
 * slowed down further than that stops sounding like a cat.
 */
export function catHz(cat: number, semitones = 0): number {
  const name = SCALE_C[Math.min(CAT_COUNT - 1, Math.max(0, cat))] ?? 'C4';
  return noteFreq(name) * 2 * Math.pow(2, semitones / 12);
}

/** Size of cat `cat` (0 = biggest, lowest voice) as a share of its cell: lower voice, bigger cat. */
export function catScale(cat: number): number {
  return 1 - 0.04 * Math.min(CAT_COUNT - 1, Math.max(0, cat));
}

export type CatSize = 'to' | 'vừa' | 'nhỏ';
export function catSize(cat: number): CatSize {
  return cat < 3 ? 'to' : cat < 6 ? 'vừa' : 'nhỏ';
}

/* ------------------------------------------------------------------------ *
 * Cat designs and what the stars unlock
 * ------------------------------------------------------------------------ */

export interface Design {
  id: string;
  /** Shown and spoken: "Mèo cam". */
  name: string;
  /** What the voice says when the written name reads badly aloud. */
  say: string;
}

/** The cats that are there from the start, one colour each. */
export const BASE_DESIGNS: readonly Design[] = [
  { id: 'xam', name: 'Mèo xám', say: 'Mèo xám' },
  { id: 'trang', name: 'Mèo trắng', say: 'Mèo trắng' },
  { id: 'vang', name: 'Mèo vàng', say: 'Mèo vàng' },
  { id: 'nau', name: 'Mèo nâu', say: 'Mèo nâu' },
  { id: 'hong', name: 'Mèo hồng', say: 'Mèo hồng' },
  { id: 'xanh', name: 'Mèo xanh', say: 'Mèo xanh' },
  { id: 'tim', name: 'Mèo tím', say: 'Mèo tím' },
  { id: 'kem', name: 'Mèo kem', say: 'Mèo kem' },
];

/** New cats, in the order the stars bring them. */
export const NEW_DESIGNS: readonly Design[] = [
  { id: 'den', name: 'Mèo đen', say: 'Mèo đen' },
  { id: 'tamthe', name: 'Mèo tam thể', say: 'Mèo tam thể' },
  { id: 'cam', name: 'Mèo cam', say: 'Mèo cam' },
  { id: 'no', name: 'Mèo đeo nơ', say: 'Mèo đeo nơ' },
  { id: 'phihanhgia', name: 'Mèo phi hành gia', say: 'Mèo phi hành gia' },
  { id: 'dj', name: 'Mèo DJ', say: 'Mèo đi-giây' },
  { id: 'vuongmien', name: 'Mèo đội vương miện', say: 'Mèo đội vương miện' },
  { id: 'cauvong', name: 'Mèo cầu vồng', say: 'Mèo cầu vồng' },
];

/** Which seat the n-th new cat takes: spread across the row, not bunched at one end. */
export const SEAT_FOR_NEW: readonly number[] = [2, 5, 0, 7, 3, 6, 1, 4];

/** How many new cats `stars` have brought (one per star, up to all of them). */
export function newCatsFor(stars: number): number {
  return Math.min(NEW_DESIGNS.length, Math.max(0, Math.floor(stars)));
}

/** Who sits on each of the eight seats once `stars` stars are earned. */
export function designsFor(stars: number): Design[] {
  const seats = [...BASE_DESIGNS];
  const n = newCatsFor(stars);
  for (let i = 0; i < n; i++) {
    const seat = SEAT_FOR_NEW[i];
    const design = NEW_DESIGNS[i];
    if (seat !== undefined && design) seats[seat] = design;
  }
  return seats;
}

/** Songs in the order the picker shows them, and how many stars each needs. */
export const SONG_UNLOCKS: readonly { id: string; need: number }[] = [
  { id: 'twinkle', need: 0 },
  { id: 'lamb', need: 0 },
  { id: 'buns', need: 0 },
  { id: 'row', need: 1 },
  { id: 'butterfly', need: 2 },
  { id: 'bridge', need: 3 },
  { id: 'rain', need: 4 },
  { id: 'farmer', need: 5 },
  { id: 'birthday', need: 6 },
  { id: 'chaulenba', need: 8 },
];

export function songUnlocked(id: string, stars: number): boolean {
  const entry = SONG_UNLOCKS.find((s) => s.id === id);
  return !!entry && stars >= entry.need;
}

/* ------------------------------------------------------------------------ *
 * Saving
 * ------------------------------------------------------------------------ */

export interface CatSave {
  /** Songs the cats have sung all the way through (the reason for new cats and songs). */
  stars: number;
  /** Family photo worn as a face, by seat (cat number) → photo id. */
  faces: Record<string, string>;
}

export const SAVE_KEY = 'be-choi:catband';
const SPEC = {
  current: 2,
  // Version 1 had only the stars; version 2 adds the photo faces.
  migrations: { 1: (old: Record<string, unknown>) => ({ ...old, faces: {} }) },
  validate(data: Record<string, unknown>): CatSave | null {
    const stars = data.stars;
    if (typeof stars !== 'number' || !Number.isFinite(stars) || stars < 0) return null;
    const faces: Record<string, string> = {};
    const raw = data.faces;
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) {
        const seat = Number(k);
        if (Number.isInteger(seat) && seat >= 0 && seat < CAT_COUNT && typeof v === 'string' && v) faces[k] = v;
      }
    }
    return { stars: Math.min(9999, Math.floor(stars)), faces };
  },
};

export function loadCatSave(storage?: Backend | null): CatSave {
  return (storage === undefined ? loadVersioned(SAVE_KEY, SPEC) : loadVersioned(SAVE_KEY, SPEC, storage)) ?? { stars: 0, faces: {} };
}

export function storeCatSave(save: CatSave, storage?: Backend | null): boolean {
  return storage === undefined ? saveVersioned(SAVE_KEY, save, SPEC) : saveVersioned(SAVE_KEY, save, SPEC, storage);
}

/* ------------------------------------------------------------------------ *
 * A song, as cats to light up
 * ------------------------------------------------------------------------ */

const LETTER: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface SongStep {
  /** Which cat sings it, 0…7. */
  cat: number;
  /** Semitones off that cat's note (a flat in the tune). Almost always 0. */
  semis: number;
  /** Start and length in beats. */
  beat: number;
  dur: number;
  /** Pitch class 0…11 of the note as written, for working out chords. */
  pc: number;
}

/**
 * Turn a tune into cats. Each note keeps its letter, so the melody keeps its
 * shape; the octave is chosen so that as much of the tune as possible sits on the
 * eight cats, and a note that still falls outside is folded back by octaves.
 * Rests are not steps: nobody has to wait for a silence.
 */
export function songSteps(song: Song): SongStep[] {
  interface Raw {
    deg: number;
    semis: number;
    beat: number;
    dur: number;
    pc: number;
  }
  const raws: Raw[] = [];
  let beat = 0;
  for (const n of song.notes) {
    const m = /^([A-G])([#b]?)(\d)$/.exec(n.n);
    if (m) {
      const letter = m[1] as string;
      const semis = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
      const deg = (Number(m[3]) - 4) * 7 + (LETTER[letter] ?? 0);
      raws.push({ deg, semis, beat, dur: n.d, pc: (((LETTER_PC[letter] ?? 0) + semis) % 12 + 12) % 12 });
    }
    beat += n.d;
  }
  let bestShift = 0;
  let bestOut = Infinity;
  for (let shift = -3; shift <= 3; shift++) {
    const out = raws.filter((r) => r.deg - 7 * shift < 0 || r.deg - 7 * shift > CAT_COUNT - 1).length;
    if (out < bestOut) {
      bestOut = out;
      bestShift = shift;
    }
  }
  return raws.map((r) => {
    let cat = r.deg - 7 * bestShift;
    while (cat < 0) cat += 7;
    while (cat > CAT_COUNT - 1) cat -= 7;
    return { cat, semis: r.semis, beat: r.beat, dur: r.dur, pc: r.pc };
  });
}

/* ------------------------------------------------------------------------ *
 * "Follow the light": a tune that waits for the child and never gets stuck
 * ------------------------------------------------------------------------ */

export type TapResult = 'right' | 'wait' | 'done';

export interface Guide {
  /** Which cat is lit, or null when the song is over. */
  readonly lit: number | null;
  readonly index: number;
  readonly total: number;
  readonly done: boolean;
  /** 0…1. */
  readonly progress: number;
  /** The step the lit cat sings. */
  readonly step: SongStep | null;
  /** The child touched `cat`. The right one moves the tune on; any other changes nothing. */
  tap(cat: number): TapResult;
}

export function createGuide(steps: readonly SongStep[]): Guide {
  let index = 0;
  const guide: Guide = {
    get lit() {
      return steps[index]?.cat ?? null;
    },
    get index() {
      return index;
    },
    get total() {
      return steps.length;
    },
    get done() {
      return index >= steps.length;
    },
    get progress() {
      return steps.length === 0 ? 1 : index / steps.length;
    },
    get step() {
      return steps[index] ?? null;
    },
    tap(cat) {
      if (index >= steps.length) return 'done';
      if (steps[index]?.cat !== cat) return 'wait';
      index++;
      return index >= steps.length ? 'done' : 'right';
    },
  };
  return guide;
}

/* ------------------------------------------------------------------------ *
 * Chords: what keeps every cat in tune with the band
 * ------------------------------------------------------------------------ */

export type ChordName = 'C' | 'F' | 'G' | 'Am' | 'Dm' | 'Em' | 'Bb';

interface ChordDef {
  root: number;
  minor: boolean;
}
const CHORD_DEFS: Record<ChordName, ChordDef> = {
  C: { root: 0, minor: false },
  F: { root: 5, minor: false },
  G: { root: 7, minor: false },
  Am: { root: 9, minor: true },
  Dm: { root: 2, minor: true },
  Em: { root: 4, minor: true },
  Bb: { root: 10, minor: false },
};
/** Order matters: on a tie the earlier chord wins, so C is the home chord. */
export const CHORD_NAMES: readonly ChordName[] = ['C', 'F', 'G', 'Am', 'Dm', 'Em', 'Bb'];

/** The three pitch classes of a chord. */
export function chordTones(chord: ChordName): number[] {
  const { root, minor } = CHORD_DEFS[chord];
  return [root, (root + (minor ? 3 : 4)) % 12, (root + 7) % 12];
}

/** The cats whose note is part of the chord: they can sing over it without a wrong note. */
export function chordCats(chord: ChordName): number[] {
  const tones = chordTones(chord);
  const out: number[] = [];
  for (let i = 0; i < CAT_COUNT; i++) if (tones.includes(CAT_PC[i] ?? -1)) out.push(i);
  return out;
}

function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** The chord as three frequencies, voiced around middle C. */
export function chordHz(chord: ChordName): number[] {
  const { root, minor } = CHORD_DEFS[chord];
  const base = root >= 7 ? 48 + root : 60 + root;
  return [base, base + (minor ? 3 : 4), base + 7].map(midiHz);
}

/** The bass note: the chord's root, two octaves under middle C. */
export function bassHz(chord: ChordName): number {
  return midiHz(36 + CHORD_DEFS[chord].root);
}

/** The chord that fits a set of notes best (`weights` by pitch class). C when there are none. */
export function bestChord(weights: readonly number[]): ChordName {
  let best: ChordName = 'C';
  let bestScore = 0;
  for (const name of CHORD_NAMES) {
    const tones = chordTones(name);
    let score = 0;
    for (let pc = 0; pc < 12; pc++) {
      const w = weights[pc] ?? 0;
      score += tones.includes(pc) ? w : -w * 0.25;
    }
    if (score > bestScore + 1e-9) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

/** Beats in a bar of a song; waltz-time birthday is 3. */
export function barBeats(song: Song): number {
  return song.id === 'birthday' ? 3 : 4;
}

/** One chord per bar of the tune, for the band to play under it. */
export function songChords(song: Song, steps: readonly SongStep[] = songSteps(song)): ChordName[] {
  const per = barBeats(song);
  const last = steps[steps.length - 1];
  const bars = last ? Math.floor((last.beat + last.dur - 1e-6) / per) + 1 : 1;
  const out: ChordName[] = [];
  for (let b = 0; b < bars; b++) {
    const weights = new Array<number>(12).fill(0);
    for (const s of steps) {
      // A note counts toward the bar it starts in, by how long it lasts.
      if (Math.floor((s.beat + 1e-6) / per) === b) weights[s.pc] = (weights[s.pc] ?? 0) + s.dur;
    }
    const empty = weights.every((w) => w === 0);
    out.push(empty ? (out[b - 1] ?? 'C') : bestChord(weights));
  }
  // The tune ends at home.
  if (out.length > 0) out[out.length - 1] = 'C';
  return out;
}

/* ------------------------------------------------------------------------ *
 * The band behind the cats
 * ------------------------------------------------------------------------ */

export type StyleId = 'vui' | 'rock' | 'em';

export interface Style {
  id: StyleId;
  /** Shown on the big button. */
  name: string;
  emoji: string;
  bpm: number;
  /** Chords for the bars of the loop. */
  progression: readonly ChordName[];
}

export const STYLES: readonly Style[] = [
  { id: 'vui', name: 'Vui', emoji: '🎈', bpm: 112, progression: ['C', 'F', 'C', 'G'] },
  { id: 'rock', name: 'Rock mèo', emoji: '🎸', bpm: 126, progression: ['C', 'C', 'F', 'G'] },
  { id: 'em', name: 'Êm', emoji: '🌙', bpm: 80, progression: ['C', 'Am', 'F', 'G'] },
];

export function styleById(id: StyleId): Style {
  return STYLES.find((s) => s.id === id) ?? (STYLES[0] as Style);
}

export const BEATS_PER_BAR = 4;

export type BandEvent =
  | { kind: 'drum'; t: number; drum: DrumKind }
  | { kind: 'bass'; t: number; hz: number; dur: number }
  | { kind: 'chord'; t: number; hz: number[]; dur: number; timbre: Timbre };

/**
 * One bar of backing, `t` in beats from the start of the bar. With no chord it is
 * drums only: that is what plays under a tune the child is still finding, where a
 * bass line would clash with whatever note comes next.
 */
export function barEvents(style: StyleId, chord: ChordName | null, bar: number): BandEvent[] {
  const ev: BandEvent[] = [];
  const d = (t: number, drum: DrumKind) => ev.push({ kind: 'drum', t, drum });
  const bass = (t: number, dur: number) => chord && ev.push({ kind: 'bass', t, hz: bassHz(chord), dur });
  const chordHit = (t: number, dur: number, timbre: Timbre) => chord && ev.push({ kind: 'chord', t, hz: chordHz(chord), dur, timbre });

  if (style === 'vui') {
    d(0, 'kick');
    d(2, 'kick');
    d(1, 'clap');
    d(3, 'clap');
    for (let t = 0.5; t < 4; t += 1) d(t, 'shaker');
    if (bar % 4 === 3) d(3.5, 'tom');
    bass(0, 0.45);
    bass(1.5, 0.35);
    bass(2, 0.45);
    chordHit(0, 0.6, 'xylo');
    chordHit(2, 0.6, 'xylo');
  } else if (style === 'rock') {
    d(0, 'kick');
    d(1.5, 'kick');
    d(2, 'kick');
    d(1, 'snare');
    d(3, 'snare');
    for (let t = 0; t < 4; t += 0.5) d(t, 'hat');
    if (bar % 4 === 0) d(0, 'crash');
    for (let t = 0; t < 4; t += 0.5) bass(t, 0.25);
    chordHit(0, 0.9, 'guitar');
    chordHit(1.5, 0.5, 'guitar');
    chordHit(2, 0.9, 'guitar');
    chordHit(3, 0.5, 'guitar');
  } else {
    d(0, 'kick');
    d(1, 'shaker');
    d(2, 'wood');
    d(3, 'shaker');
    bass(0, 1.6);
    bass(2, 1.6);
    if (chord) {
      const hz = chordHz(chord);
      const walk = [0, 1, 2, 1, 0, 1, 2, 1];
      walk.forEach((idx, i) => ev.push({ kind: 'chord', t: i * 0.5, hz: [hz[idx] ?? hz[0] ?? 261.63], dur: 0.9, timbre: 'bell' }));
    }
  }
  return ev.sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------------------ *
 * The cats singing along by themselves
 * ------------------------------------------------------------------------ */

export interface CatHit {
  /** Beats from the start of the bar. */
  t: number;
  cat: number;
}

const HARMONY_SLOTS = [0, 1, 1.5, 2, 3, 3.5];

/**
 * A few cats join in on their own: two or three notes a bar, every one a note of
 * the chord that is playing, so they cannot be out of tune with the band.
 */
export function harmonyBar(chord: ChordName, rng: () => number = Math.random, count = 2 + (rng() < 0.4 ? 1 : 0)): CatHit[] {
  const cats = chordCats(chord);
  const slots = [...HARMONY_SLOTS];
  const hits: CatHit[] = [];
  let prev = -1;
  for (let i = 0; i < count && slots.length > 0; i++) {
    const t = slots.splice(Math.floor(rng() * slots.length), 1)[0] as number;
    const options = cats.filter((c) => c !== prev);
    const cat = options[Math.floor(rng() * options.length)] ?? cats[0] ?? 0;
    hits.push({ t, cat });
    prev = cat;
  }
  return hits.sort((a, b) => a.t - b.t);
}

/** Cats the child tapped while the band was singing along: they join the chorus. */
export const MAX_CHORUS = 4;

export function joinChorus(members: readonly number[], cat: number): number[] {
  if (members.includes(cat)) return [...members];
  const next = [...members, cat];
  return next.length > MAX_CHORUS ? next.slice(next.length - MAX_CHORUS) : next;
}

const CHORUS_SLOTS = [0, 1.5, 2, 3.5];

/** The chorus's turn in a bar. Only cats that fit the chord sing, so the rest simply sit this one out. */
export function chorusBar(members: readonly number[], chord: ChordName): CatHit[] {
  const fit = new Set(chordCats(chord));
  const singers = members.filter((m) => fit.has(m));
  return singers.map((cat, i) => ({ t: CHORUS_SLOTS[i] ?? 0, cat }));
}

/* ------------------------------------------------------------------------ *
 * The whole song, with the band
 * ------------------------------------------------------------------------ */

export type FinaleEvent = { ms: number; ev: BandEvent } | { ms: number; cat: number; semis: number; dur: number };

/** Everything that happens when the cats sing a finished song, as (millisecond, thing) pairs. */
export function buildFinale(song: Song, style: StyleId, steps: readonly SongStep[] = songSteps(song)): { events: FinaleEvent[]; totalMs: number } {
  const beatMs = 60000 / song.bpm;
  const per = barBeats(song);
  const chords = songChords(song, steps);
  const events: FinaleEvent[] = [];
  for (const s of steps) events.push({ ms: s.beat * beatMs, cat: s.cat, semis: s.semis, dur: s.dur * beatMs });
  chords.forEach((chord, bar) => {
    for (const ev of barEvents(style, chord, bar)) {
      if (ev.t < per) events.push({ ms: (bar * per + ev.t) * beatMs, ev });
    }
  });
  events.sort((a, b) => a.ms - b.ms);
  return { events, totalMs: chords.length * per * beatMs };
}

/* ------------------------------------------------------------------------ *
 * "Nhớ giai điệu": the cats sing a few notes, the child sings them back
 * ------------------------------------------------------------------------ */

export const MEMORY_MIN = 2;
export const MEMORY_MAX = 5;
/** Rounds in a row that earn a star. */
export const MEMORY_ROUNDS = 3;

/** How many notes the first phrase has: one more for every 3 stars, 2 to 5. */
export function memoryStart(stars: number): number {
  return Math.min(MEMORY_MAX, MEMORY_MIN + Math.floor(Math.max(0, stars) / 3));
}

/** `len` cats to sing; never the same cat three times running. */
export function makeMemory(len: number, rng: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const banned = out.length >= 2 && out[out.length - 1] === out[out.length - 2] ? (out[out.length - 1] as number) : -1;
    const options = Array.from({ length: CAT_COUNT }, (_, c) => c).filter((c) => c !== banned);
    out.push(options[Math.floor(rng() * options.length)] ?? 0);
  }
  return out;
}

/** The child touched `cat` at position `pos`: `ok` goes on, `complete` is the last one, `wrong` means hear it again. */
export function memoryCheck(seq: readonly number[], pos: number, cat: number): 'ok' | 'complete' | 'wrong' {
  if (seq[pos] !== cat) return 'wrong';
  return pos === seq.length - 1 ? 'complete' : 'ok';
}

/* ------------------------------------------------------------------------ *
 * What the voice says
 * ------------------------------------------------------------------------ */

export const NUMBER_WORDS: readonly string[] = ['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám'];

/**
 * A slow, broken-up line for a cat the child just touched. Short sentences with
 * full stops, because the voice pauses at each one: "Mèo. Mèo cam." The three
 * kinds take turns (name, number, high or low) so the same cat is never described
 * the same way twice running.
 */
export function catLine(cat: number, design: Design, round: number): string {
  const kind = ((round % 3) + 3) % 3;
  const number = NUMBER_WORDS[cat] ?? '';
  if (kind === 0) return `Mèo. ${design.say}.`;
  if (kind === 1) return `${design.say}. Số ${number}.`;
  if (cat <= 1) return `${design.say}. Mèo to. Tiếng trầm.`;
  if (cat >= CAT_COUNT - 2) return `${design.say}. Mèo nhỏ. Tiếng cao.`;
  return `${design.say}. Mèo thứ ${number}.`;
}

/** What to say after the cats have been counted up (or down) the scale. */
export function scaleLine(up: boolean): string {
  return up ? 'Mèo nhỏ. Tiếng cao.' : 'Mèo to. Tiếng trầm.';
}
