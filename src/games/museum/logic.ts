import type { DrumKind, Timbre } from '../../core/audio';
import { loadVersioned, saveVersioned, type VersionedSpec } from '../../core/save';
import { ENTRIES, findEntry } from './catalog';

/* ------------------------------------------------------------------ album */

export const SAVE_KEY = 'be-choi:museum';
export const BAND_SLOTS = 4;
/** Stamps needed to open the orchestra room. */
export const BAND_NEEDS = 5;

export interface Album {
  v: 1;
  /** Entry ids the child has earned a stamp for, in the order earned. */
  stamps: string[];
  /** The orchestra: up to four entry ids (null = empty slot). */
  band: (string | null)[];
  /** Backing track id. */
  track: string;
  /** Stars earned in the museum (a stamp is one, a concert is one). */
  stars: number;
}

export function emptyAlbum(): Album {
  return { v: 1, stamps: [], band: Array.from({ length: BAND_SLOTS }, () => null), track: TRACKS[0]!.id, stars: 0 };
}

/** Make whatever was loaded safe: known ids only, no duplicates, four slots, only collected instruments in the band. */
export function normalizeAlbum(raw: Record<string, unknown>): Album {
  const base = emptyAlbum();
  const stamps = Array.isArray(raw.stamps) ? raw.stamps.filter((x): x is string => typeof x === 'string' && !!findEntry(x)) : [];
  base.stamps = [...new Set(stamps)];
  const band = Array.isArray(raw.band) ? raw.band : [];
  const seen = new Set<string>();
  base.band = Array.from({ length: BAND_SLOTS }, (_, i) => {
    const id = band[i];
    if (typeof id !== 'string' || !base.stamps.includes(id) || seen.has(id)) return null;
    seen.add(id);
    return id;
  });
  if (typeof raw.track === 'string' && TRACKS.some((t) => t.id === raw.track)) base.track = raw.track;
  if (typeof raw.stars === 'number' && Number.isFinite(raw.stars) && raw.stars >= 0) base.stars = Math.floor(raw.stars);
  return base;
}

export const ALBUM_SPEC: VersionedSpec<Album> = {
  current: 1,
  // v0 (never shipped) kept `collected` instead of `stamps`.
  migrations: { 0: (old) => ({ ...old, stamps: old.stamps ?? old.collected }) },
  validate: (data) => normalizeAlbum(data),
};

export function loadAlbum(): Album {
  return loadVersioned(SAVE_KEY, ALBUM_SPEC) ?? emptyAlbum();
}
export function saveAlbum(a: Album): boolean {
  return saveVersioned(SAVE_KEY, a, ALBUM_SPEC);
}

export const hasStamp = (a: Album, id: string): boolean => a.stamps.includes(id);
export const bandOpen = (a: Album): boolean => a.stamps.length >= BAND_NEEDS;
export const stampsLeft = (a: Album): number => Math.max(0, BAND_NEEDS - a.stamps.length);

/** Earn a stamp. Returns true when it is new (and then also counts a star). */
export function addStamp(a: Album, id: string): boolean {
  if (!findEntry(id) || a.stamps.includes(id)) return false;
  a.stamps.push(id);
  a.stars++;
  return true;
}

/** Put `id` in `slot` (taking it out of any other slot); null empties the slot. Only collected instruments go in. */
export function setSlot(a: Album, slot: number, id: string | null): boolean {
  if (slot < 0 || slot >= BAND_SLOTS) return false;
  if (id !== null) {
    if (!a.stamps.includes(id)) return false;
    a.band = a.band.map((x) => (x === id ? null : x));
  }
  a.band[slot] = id;
  return true;
}

/** Collected entries, in catalog order. */
export const collected = (a: Album): string[] => ENTRIES.filter((x) => a.stamps.includes(x.id)).map((x) => x.id);

/* ---------------------------------------------------------------- missions */

export type MissionId = 'places' | 'fast' | 'slow' | 'dynamics';
export const MISSIONS: readonly MissionId[] = ['places', 'fast', 'slow', 'dynamics'];

/** Notes closer together than this count as one touch (a strum is one touch, not six). */
export const DEDUPE_MS = 70;
export const PLACES_NEEDED = 3;
export const FAST_COUNT = 5;
export const FAST_WINDOW_MS = 2400;
export const SLOW_GAP_MS = 800;
export const SLOW_MAX_GAP_MS = 5000;
export const SLOW_COUNT = 3;
export const SOFT_MAX = 0.5;
export const LOUD_MIN = 0.9;

/** The "place" a zone counts as: all the strings of a guitar are one place, the strum. */
export function placeOf(zoneId: string): string {
  return /^string\d+$/.test(zoneId) ? 'strum' : zoneId;
}

export interface MissionTracker {
  /** Feed one note; returns the missions this note just completed. */
  hit(zoneId: string, t: number, vel: number): MissionId[];
  done(): ReadonlySet<MissionId>;
  complete(): boolean;
  /** Mark everything done (a stamp already earned). */
  finishAll(): void;
}

export function createMissions(placesAvailable: number): MissionTracker {
  const need = Math.max(1, Math.min(PLACES_NEEDED, placesAvailable));
  const done = new Set<MissionId>();
  const places = new Set<string>();
  const recent: number[] = [];
  let last: number | null = null;
  let chain = 0;
  let soft = false;
  let loud = false;

  const finish = (id: MissionId, out: MissionId[]): void => {
    if (!done.has(id)) {
      done.add(id);
      out.push(id);
    }
  };

  return {
    hit(zoneId, t, vel) {
      const out: MissionId[] = [];
      places.add(placeOf(zoneId));
      if (places.size >= need) finish('places', out);
      if (vel <= SOFT_MAX) soft = true;
      if (vel >= LOUD_MIN) loud = true;
      if (soft && loud) finish('dynamics', out);
      // pace: count one touch per DEDUPE_MS
      if (last === null || t - last >= DEDUPE_MS) {
        recent.push(t);
        while (recent.length && t - recent[0]! > FAST_WINDOW_MS) recent.shift();
        if (recent.length >= FAST_COUNT) finish('fast', out);
        if (last === null || t - last > SLOW_MAX_GAP_MS) chain = 1;
        else if (t - last >= SLOW_GAP_MS) chain++;
        else chain = 1;
        if (chain >= SLOW_COUNT) finish('slow', out);
        last = t;
      }
      return out;
    },
    done: () => done,
    complete: () => MISSIONS.every((m) => done.has(m)),
    finishAll() {
      for (const m of MISSIONS) done.add(m);
    },
  };
}

/* ------------------------------------------------------------- room layout */

export interface RoomLayout {
  /** Tile edge in px (≥ 72). */
  tile: number;
  /** Cabinets side by side (1 portrait, 2 wide). */
  columns: number;
  /** The room needs to scroll because 72 px tiles do not fit. */
  scroll: boolean;
}

export const TILE_MIN = 72;
export const TILE_MAX = 96;
const GAP = 8;
const CAB_PAD = 10;
const CAB_HEAD = 4;
const FOYER_H = 96;
const MARGIN = 8;

/** Height of the room for tile `s` laid out in `columns` columns of cabinets. */
function roomHeight(w: number, s: number, columns: number, counts: readonly number[]): number {
  const inner = (w - MARGIN * 2 - GAP * (columns - 1)) / columns - CAB_PAD * 2;
  const perRow = Math.max(1, Math.floor((inner + GAP) / (s + GAP)));
  const heights = counts.map((n) => Math.ceil(n / perRow) * (s + GAP) - GAP + CAB_PAD * 2 + CAB_HEAD);
  if (columns === 1) return heights.reduce((a, b) => a + b + GAP, FOYER_H) + MARGIN;
  // two columns: deal the cabinets out to the shorter one
  const col = [FOYER_H + GAP, 0];
  for (const hh of heights) {
    const k = col[0]! <= col[1]! ? 0 : 1;
    col[k]! += hh + GAP;
  }
  return Math.max(col[0]!, col[1]!) + MARGIN;
}

/**
 * One cabinet open on its own: the biggest tile (72…140 px) that lets `n` tiles fill a `w` x `hh`
 * area without scrolling. Falls back to 72 (the area may then scroll) when even that does not fit.
 */
export function shelfLayout(w: number, hh: number, n: number): { tile: number; scroll: boolean } {
  for (let s = 140; s >= TILE_MIN; s -= 4) {
    const perRow = Math.max(1, Math.floor((w + GAP) / (s + GAP)));
    if (Math.ceil(n / perRow) * (s + GAP) - GAP <= hh) return { tile: s, scroll: false };
  }
  return { tile: TILE_MIN, scroll: true };
}

/** Pick the biggest tile size (72…96 px) that lets the whole room show; otherwise 72 and scroll. */
export function roomLayout(w: number, h: number, counts: readonly number[]): RoomLayout {
  const columns = w >= 700 ? 2 : 1;
  for (let s = TILE_MAX; s >= TILE_MIN; s -= 4) {
    if (roomHeight(w, s, columns, counts) <= h) return { tile: s, columns, scroll: false };
  }
  // 72 px never fits: try one column the other way before scrolling
  const other = columns === 1 ? 2 : 1;
  if (other === 2 && w >= 560 && roomHeight(w, TILE_MIN, 2, counts) <= h) return { tile: TILE_MIN, columns: 2, scroll: false };
  return { tile: TILE_MIN, columns, scroll: true };
}

/* ---------------------------------------------------------- backing tracks */

export interface Track {
  id: string;
  emoji: string;
  name: string;
  bpm: number;
  /** Stamps needed to unlock it. */
  needs: number;
  /** 16 sixteenth-note steps per drum: x = hit. */
  drums: Partial<Record<DrumKind, string>>;
  /** Steps (0-15) on which the chord sounds, and how it is played. */
  chordSteps: number[];
  chordTimbre: Timbre;
  /** Spread the chord up one note per step (a harp-like arpeggio) instead of all at once. */
  arpeggio: boolean;
  bassSteps: number[];
}

/** Four bars, every chord in C major: C, Am, F, G. */
export const CHORDS: readonly (readonly number[])[] = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
];
export const BASS_ROOTS: readonly number[] = [48, 45, 41, 43];

export const TRACKS: readonly Track[] = [
  {
    id: 'sun',
    emoji: '☀️',
    name: 'Nắng',
    bpm: 96,
    needs: BAND_NEEDS,
    drums: { kick: 'x.......x.......', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    chordSteps: [0, 8],
    chordTimbre: 'piano',
    arpeggio: false,
    bassSteps: [0, 10],
  },
  {
    id: 'star',
    emoji: '🌙',
    name: 'Sao đêm',
    bpm: 76,
    needs: 9,
    drums: { kick: 'x...............', shaker: '....x.......x...', triangle: 'x...............' },
    chordSteps: [0, 4, 8, 12],
    chordTimbre: 'bell',
    arpeggio: true,
    bassSteps: [0],
  },
  {
    id: 'sea',
    emoji: '🌊',
    name: 'Biển',
    bpm: 112,
    needs: 14,
    drums: { kick: 'x..x..x.x..x..x.', wood: '..x...x...x...x.', shaker: 'xxxxxxxxxxxxxxxx' },
    chordSteps: [0, 6, 10],
    chordTimbre: 'piano',
    arpeggio: false,
    bassSteps: [0, 6, 8],
  },
];

export const trackById = (id: string): Track => TRACKS.find((t) => t.id === id) ?? TRACKS[0]!;
export const trackOpen = (t: Track, stamps: number): boolean => stamps >= t.needs;

export interface StepEvents {
  drums: DrumKind[];
  notes: Array<{ midi: number; timbre: Timbre; dur: number }>;
}

/** Everything the backing plays at `step` (0-15) of `bar` (any integer; the chords cycle every four). */
export function stepEvents(track: Track, bar: number, step: number): StepEvents {
  const b = ((bar % CHORDS.length) + CHORDS.length) % CHORDS.length;
  const out: StepEvents = { drums: [], notes: [] };
  for (const [kind, pat] of Object.entries(track.drums) as [DrumKind, string][]) {
    if (pat[step] === 'x') out.drums.push(kind);
  }
  const chord = CHORDS[b]!;
  const at = track.chordSteps.indexOf(step);
  if (at >= 0) {
    if (track.arpeggio) out.notes.push({ midi: chord[at % chord.length]! + (at >= 3 ? 12 : 0), timbre: track.chordTimbre, dur: 1.4 });
    else for (const m of chord) out.notes.push({ midi: m, timbre: track.chordTimbre, dur: 1.1 });
  }
  if (track.bassSteps.includes(step)) out.notes.push({ midi: BASS_ROOTS[b]!, timbre: 'bass', dur: 0.5 });
  return out;
}

/** Milliseconds per sixteenth note. */
export const stepMs = (t: Track): number => 60000 / t.bpm / 4;

/**
 * What an instrument that is not being played by the child plays by itself:
 * one of four gentle patterns of the five orchestra voices (0 = lowest), by slot.
 */
export const AUTO_PATTERNS: readonly (readonly (number | null)[])[] = [
  [0, null, null, null, null, null, null, null, 0, null, null, null, 2, null, null, null],
  [null, null, 2, null, null, null, 4, null, null, null, 3, null, null, null, 4, null],
  [1, null, null, null, 3, null, null, null, 1, null, null, 2, 3, null, null, null],
  [null, null, 4, null, 3, null, 4, null, null, null, 4, null, 2, null, null, null],
];
export const autoDegree = (slot: number, step: number): number | null => AUTO_PATTERNS[((slot % 4) + 4) % 4]![step % 16] ?? null;

/** Seconds of playing, with a hand on an instrument, that make a concert worth a star. */
export const CONCERT_MS = 45000;
