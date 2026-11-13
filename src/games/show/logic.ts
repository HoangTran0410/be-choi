import type { DrumKind, InstrumentId, SampleKey, Timbre } from '../../core/audio';
import { noteFreq } from '../../core/music';

/** The five notes of the C pentatonic scale: any order of them sounds nice. Note index 0…4. */
export const DEGREES: readonly string[] = ['C4', 'D4', 'E4', 'G4', 'A4'];

export type InstId = 'piano' | 'guitar' | 'violin' | 'flute' | 'trumpet' | 'xylo' | 'drum' | 'harp';

/** What the performer's paws and body do when a note sounds. */
export type Action = 'keys' | 'strum' | 'bow' | 'blow' | 'mallet' | 'hit' | 'pluck' | 'shake' | 'squeeze';

/** The instruments the show shelf adds to the eight the guessing game and the band share. */
export type ExtraId =
  | 'ukulele'
  | 'sax'
  | 'marimba'
  | 'bell'
  | 'kalimba'
  | 'accordion'
  | 'harmonica'
  | 'banjo'
  | 'handpan'
  | 'steelpan'
  | 'panflute'
  | 'vibraphone'
  | 'tambourine'
  | 'maracas';
/** Anything on the show shelf. */
export type ShowId = InstId | ExtraId;

/** Instrument family, used to pick look-alike choices in the guessing game. */
export type Family = 'strings' | 'wind' | 'percussion' | 'keys';

export interface PhraseNote {
  /** Note index 0…4. */
  p: number;
  /** Length in beats. */
  d: number;
}

export type Sound = { t: 'note'; timbre: Timbre } | { t: 'inst'; id: InstrumentId } | { t: 'drum'; kinds: readonly DrumKind[] };

export interface InstDef<I extends string = InstId> {
  id: I;
  /** What the child sees written and what the voice says. */
  name: string;
  family: Family;
  action: Action;
  bpm: number;
  /** Octave shift of the five notes (0 = C4…A4, 1 = one octave up). */
  oct: number;
  sound: Sound;
  /** The short tune the performer plays (public domain or a plain scale/arpeggio). */
  phrase: readonly PhraseNote[];
}

const n = (p: number, d = 1): PhraseNote => ({ p, d });

export const INSTRUMENTS: readonly InstDef[] = [
  {
    id: 'piano',
    name: 'đàn piano',
    family: 'keys',
    action: 'keys',
    bpm: 112,
    oct: 0,
    sound: { t: 'note', timbre: 'piano' },
    // Twinkle, twinkle: C C G G A A G
    phrase: [n(0), n(0), n(3), n(3), n(4), n(4), n(3, 2), n(2), n(2), n(1), n(1), n(0, 2)],
  },
  {
    id: 'guitar',
    name: 'đàn ghi-ta',
    family: 'strings',
    action: 'strum',
    bpm: 100,
    oct: 0,
    sound: { t: 'note', timbre: 'guitar' },
    phrase: [n(0, 0.5), n(2, 0.5), n(3, 0.5), n(4, 0.5), n(3, 0.5), n(2, 0.5), n(0, 1), n(1, 0.5), n(3, 0.5), n(4, 0.5), n(3, 0.5), n(1, 0.5), n(0, 2)],
  },
  {
    id: 'violin',
    name: 'đàn vi-ô-lông',
    family: 'strings',
    action: 'bow',
    bpm: 84,
    oct: 0,
    sound: { t: 'note', timbre: 'violin' },
    phrase: [n(3, 2), n(4), n(3), n(2, 2), n(1), n(2), n(3, 2), n(0, 2)],
  },
  {
    id: 'flute',
    name: 'sáo',
    family: 'wind',
    action: 'blow',
    bpm: 120,
    oct: 1,
    sound: { t: 'note', timbre: 'flute' },
    phrase: [n(0, 0.5), n(1, 0.5), n(2, 0.5), n(3, 0.5), n(4, 1), n(3, 0.5), n(4, 0.5), n(3, 1), n(2, 0.5), n(1, 0.5), n(0, 2)],
  },
  {
    id: 'trumpet',
    name: 'kèn trum-pét',
    family: 'wind',
    action: 'blow',
    bpm: 108,
    oct: 0,
    sound: { t: 'note', timbre: 'trumpet' },
    // A fanfare: C C C G, then up and home.
    phrase: [n(0, 0.5), n(0, 0.5), n(0, 0.5), n(3, 1.5), n(3, 0.5), n(4, 1), n(3, 2), n(2, 0.5), n(1, 0.5), n(0, 2)],
  },
  {
    id: 'xylo',
    name: 'đàn mộc cầm',
    family: 'percussion',
    action: 'mallet',
    bpm: 132,
    oct: 0,
    sound: { t: 'note', timbre: 'xylo' },
    phrase: [n(0, 0.5), n(1, 0.5), n(2, 0.5), n(3, 0.5), n(4, 0.5), n(3, 0.5), n(2, 0.5), n(1, 0.5), n(0, 1), n(2, 1), n(4, 2)],
  },
  {
    id: 'drum',
    name: 'trống',
    family: 'percussion',
    action: 'hit',
    bpm: 108,
    oct: 0,
    sound: { t: 'drum', kinds: ['kick', 'tom', 'snare', 'wood', 'hat'] },
    phrase: [n(0), n(0), n(2), n(0), n(0), n(0), n(2), n(2, 0.5), n(2, 0.5), n(1), n(0, 2)],
  },
  {
    id: 'harp',
    name: 'đàn hạc',
    family: 'strings',
    action: 'pluck',
    bpm: 96,
    oct: 0,
    sound: { t: 'inst', id: 'harp' },
    phrase: [n(0, 0.5), n(1, 0.5), n(2, 0.5), n(3, 0.5), n(4, 0.5), n(4, 0.5), n(3, 0.5), n(2, 0.5), n(1, 0.5), n(0, 0.5), n(2, 1), n(0, 2)],
  },
];

/** The twelve-bar tune of the extras: "Mary had a little lamb" in C D E G, rhythms for the shakers. */
const MARY: readonly PhraseNote[] = [n(2), n(1), n(0), n(1), n(2), n(2), n(2, 2), n(1), n(1), n(1, 2), n(2), n(3), n(3, 2)];
const JINGLE: readonly PhraseNote[] = [n(2), n(2), n(2, 2), n(2), n(2), n(2, 2), n(2), n(3), n(0, 1.5), n(1, 0.5), n(2, 3)];
const ARP: readonly PhraseNote[] = [n(0, 0.5), n(2, 0.5), n(3, 0.5), n(4, 0.5), n(3, 0.5), n(2, 0.5), n(0, 1), n(1, 0.5), n(3, 0.5), n(4, 0.5), n(3, 0.5), n(1, 0.5), n(0, 2)];
const GROOVE: readonly PhraseNote[] = [n(0), n(1, 0.5), n(1, 0.5), n(2), n(1, 0.5), n(1, 0.5), n(0), n(2), n(1, 0.5), n(1, 0.5), n(0, 2)];

const inst = (
  id: ExtraId,
  name: string,
  family: Family,
  action: Action,
  bpm: number,
  oct: number,
  sound: Sound,
  phrase: readonly PhraseNote[],
): InstDef<ExtraId> => ({ id, name, family, action, bpm, oct, sound, phrase });

/** Everything with real recordings that also has a good picture, beyond the shared eight. */
export const EXTRA_INSTRUMENTS: readonly InstDef<ExtraId>[] = [
  inst('ukulele', 'đàn u-ku-lê-lê', 'strings', 'strum', 104, 0, { t: 'inst', id: 'ukulele' }, MARY),
  inst('sax', 'kèn sa-xô-phôn', 'wind', 'blow', 96, 0, { t: 'note', timbre: 'sax' }, [n(3, 2), n(4), n(3), n(2, 2), n(1), n(2), n(3, 2), n(0, 2)]),
  inst('marimba', 'đàn ma-rim-ba', 'percussion', 'mallet', 120, 0, { t: 'inst', id: 'marimba' }, MARY),
  inst('bell', 'đàn chuông nhỏ', 'percussion', 'mallet', 116, 1, { t: 'note', timbre: 'bell' }, JINGLE),
  inst('kalimba', 'đàn ka-lim-ba', 'strings', 'pluck', 100, 0, { t: 'inst', id: 'kalimba' }, ARP),
  inst('accordion', 'đàn a-cọc-đê-ông', 'keys', 'squeeze', 120, 0, { t: 'inst', id: 'accordion' }, MARY),
  inst('harmonica', 'kèn ha-mô-ni-ca', 'wind', 'blow', 104, 0, { t: 'inst', id: 'harmonica' }, [n(0), n(1), n(2), n(3, 2), n(2), n(1), n(0, 2), n(3), n(4), n(3, 2), n(0, 2)]),
  inst('banjo', 'đàn ban-giô', 'strings', 'strum', 112, 0, { t: 'inst', id: 'banjo' }, JINGLE),
  inst('handpan', 'trống hen-pan', 'percussion', 'hit', 104, 0, { t: 'inst', id: 'handpan' }, ARP),
  inst('steelpan', 'trống thép', 'percussion', 'hit', 112, 0, { t: 'inst', id: 'steelpan' }, MARY),
  inst('panflute', 'sáo pan', 'wind', 'blow', 100, 0, { t: 'inst', id: 'panflute' }, [n(0, 0.5), n(1, 0.5), n(2, 0.5), n(3, 0.5), n(4, 1), n(3, 1), n(2, 0.5), n(1, 0.5), n(0, 2)]),
  inst('vibraphone', 'đàn vi-ba-phôn', 'percussion', 'mallet', 108, 0, { t: 'inst', id: 'vibraphone' }, ARP),
  inst('tambourine', 'trống lắc tay', 'percussion', 'shake', 112, 0, { t: 'inst', id: 'tambourine' }, GROOVE),
  inst('maracas', 'ma-ra-cát', 'percussion', 'shake', 120, 0, { t: 'inst', id: 'maracas' }, GROOVE),
];

/** The whole shelf of the show: the shared eight first, then the others. */
export const SHOW_INSTRUMENTS: readonly InstDef<ShowId>[] = [...INSTRUMENTS, ...EXTRA_INSTRUMENTS];

export const showInst = (id: string): InstDef<ShowId> | undefined => SHOW_INSTRUMENTS.find((i) => i.id === id);

export const INST_IDS: readonly InstId[] = INSTRUMENTS.map((i) => i.id);

export function instOf(id: string): InstDef {
  return INSTRUMENTS.find((i) => i.id === id) ?? (INSTRUMENTS[0] as InstDef);
}

/** Frequency of pad `idx` on an instrument; the pad index wraps so any number is safe. */
export function padFreq(def: Pick<InstDef<string>, 'oct'>, idx: number): number {
  const i = ((Math.round(idx) % DEGREES.length) + DEGREES.length) % DEGREES.length;
  return noteFreq(DEGREES[i] as string) * Math.pow(2, def.oct);
}

export interface Timed {
  p: number;
  atMs: number;
  durMs: number;
}

/** When each note of a phrase starts and how long it lasts, at the given tempo. */
export function timeline(phrase: readonly PhraseNote[], bpm: number): Timed[] {
  const beat = 60000 / bpm;
  let at = 0;
  return phrase.map((note) => {
    const t = { p: note.p, atMs: Math.round(at), durMs: Math.round(note.d * beat) };
    at += note.d * beat;
    return t;
  });
}

/** Total length of a phrase in ms. */
export function phraseMs(def: Pick<InstDef<string>, 'phrase' | 'bpm'>): number {
  const last = timeline(def.phrase, def.bpm).at(-1);
  return last ? last.atMs + last.durMs : 0;
}

/** Position of the next glowing pad in the follow-along, wrapping back to the start. */
export function nextStep(step: number, len: number): number {
  return len <= 0 ? 0 : (step + 1) % len;
}

/** Play one pad of an instrument now, or `delay` seconds from now. */
export function playPad(
  audio: Pick<import('../../core/audio').AudioEngine, 'note' | 'drum' | 'inst'>,
  def: Pick<InstDef<string>, 'sound' | 'oct'>,
  idx: number,
  opts: { delay?: number; dur?: number; vel?: number } = {},
): void {
  const { delay = 0, dur = 0.9, vel = 0.9 } = opts;
  if (def.sound.t === 'drum') {
    const kinds = def.sound.kinds;
    const k = kinds[((idx % kinds.length) + kinds.length) % kinds.length] as DrumKind;
    audio.drum(k, delay, vel);
  } else if (def.sound.t === 'inst') {
    audio.inst(def.sound.id, padFreq(def, idx), vel, dur, delay, true);
  } else {
    audio.note(padFreq(def, idx), dur, def.sound.timbre, delay, vel);
  }
}

/** The recording sets an instrument plays from, to preload before its first note (else that note is the synth's). */
export function sampleKeysOf(def: Pick<InstDef<string>, 'sound'>): SampleKey[] {
  const s = def.sound;
  if (s.t === 'note') return [`note:${s.timbre}`];
  if (s.t === 'inst') return [`inst:${s.id}`];
  return s.kinds.map((k) => `drum:${k}` as const);
}
