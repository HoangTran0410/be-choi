import type { DrumKind } from '../../core/audio';
import { findSong, noteFreq, type Song } from '../../core/music';
import type { InstId } from '../show/logic';

/** The loop runs on eighth-note steps; a bar is four beats = 8 steps. */
export const STEPS_PER_BAR = 8;
export const SLOTS = 4;

export type Role = 'melody' | 'chords' | 'arp' | 'pad' | 'bass' | 'rhythm';

export interface BandInst {
  id: InstId;
  role: Role;
  /** Octave shift for the notes of the part. */
  oct: number;
  /** Place in the mix, 0…1. */
  gain: number;
}

/** What each instrument plays in the band: every one has a part that fits the tune whichever mix the child makes. */
export const BAND_INSTS: readonly BandInst[] = [
  { id: 'xylo', role: 'melody', oct: 0, gain: 0.9 },
  { id: 'flute', role: 'melody', oct: 1, gain: 0.85 },
  { id: 'piano', role: 'chords', oct: 0, gain: 0.8 },
  { id: 'guitar', role: 'arp', oct: 0, gain: 0.85 },
  { id: 'harp', role: 'arp', oct: 1, gain: 0.7 },
  { id: 'violin', role: 'pad', oct: 0, gain: 0.7 },
  { id: 'trumpet', role: 'bass', oct: 0, gain: 0.75 },
  { id: 'drum', role: 'rhythm', oct: 0, gain: 0.9 },
];

export function bandInst(id: InstId): BandInst {
  return BAND_INSTS.find((b) => b.id === id) ?? (BAND_INSTS[0] as BandInst);
}

/** Traditional Vietnamese tunes and public-domain nursery melodies from core/music. */
export const BAND_SONGS: readonly string[] = ['butterfly', 'backimthang', 'twinkle'];

export type StepEvent = { kind: 'note'; freq: number; steps: number } | { kind: 'drum'; drum: DrumKind };

export interface QNote {
  /** Start step. */
  at: number;
  steps: number;
  name: string;
}

/** The melody on the eighth-note grid. Rests are dropped; the position of each note keeps its rest. */
export function quantize(song: Song): QNote[] {
  const out: QNote[] = [];
  let cum = 0;
  for (const n of song.notes) {
    const at = Math.round(cum * 2);
    const end = Math.round((cum + n.d) * 2);
    if (n.n !== 'R') out.push({ at, steps: Math.max(1, end - at), name: n.n });
    cum += n.d;
  }
  return out;
}

export function loopSteps(song: Song): number {
  const total = song.notes.reduce((a, n) => a + n.d, 0);
  return Math.max(1, Math.ceil(Math.round(total * 2) / STEPS_PER_BAR)) * STEPS_PER_BAR;
}

interface Chord {
  root: string;
  /** Semitones above the root. */
  tones: readonly number[];
  /** Pitch classes of the chord tones (0 = C). */
  pcs: readonly number[];
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function chord(root: string, minor = false): Chord {
  const tones = minor ? [0, 3, 7] : [0, 4, 7];
  const r = PC[root] as number;
  return { root, tones, pcs: tones.map((t) => (r + t) % 12) };
}
/** The four chords every tune here is harmonised with (C, G, F, A minor). */
export const CHORDS: readonly Chord[] = [chord('C'), chord('G'), chord('F'), chord('A', true)];

function pitchClass(name: string): number {
  const m = /^([A-G])([#b]?)/.exec(name);
  if (!m) return 0;
  return ((PC[m[1] as string] as number) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/**
 * The chord under each bar: the one whose tones the bar's melody spends most time on, notes on the beat counting more (ties go to
 * C, then G, F, Am), the first and last bar always C so the tune starts and ends at home.
 */
export function chordsPerBar(song: Song): Chord[] {
  const bars = loopSteps(song) / STEPS_PER_BAR;
  const notes = quantize(song);
  const out: Chord[] = [];
  for (let b = 0; b < bars; b++) {
    if (b === 0 || b === bars - 1) {
      out.push(CHORDS[0] as Chord);
      continue;
    }
    const lo = b * STEPS_PER_BAR;
    const hi = lo + STEPS_PER_BAR;
    let best = CHORDS[0] as Chord;
    let bestScore = -1;
    for (const c of CHORDS) {
      let score = 0;
      for (const n of notes) {
        const overlap = Math.min(hi, n.at + n.steps) - Math.max(lo, n.at);
        if (overlap <= 0) continue;
        const pc = pitchClass(n.name);
        if (!c.pcs.includes(pc)) continue;
        // Notes on the beat count more; a note that is the chord's root counts a little extra.
        score += overlap * (n.at % 4 === 0 ? 1.5 : 1) + (pc === c.pcs[0] ? 0.25 * overlap : 0);
      }
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    out.push(best);
  }
  return out;
}

/** Frequency of chord tone `i` (0 root, 1 third, 2 fifth) with the root in octave 3, shifted `oct` octaves. */
export function chordFreq(c: Chord, i: number, oct = 0): number {
  const tone = c.tones[((i % 3) + 3) % 3] as number;
  return noteFreq(`${c.root}3`) * Math.pow(2, tone / 12 + oct);
}

/** One loop of a part: for every step, the events that start on it. */
export function buildPart(song: Song, inst: BandInst): StepEvent[][] {
  const steps = loopSteps(song);
  const grid: StepEvent[][] = Array.from({ length: steps }, () => []);
  const add = (s: number, e: StepEvent): void => {
    grid[s]?.push(e);
  };
  if (inst.role === 'melody') {
    for (const n of quantize(song)) {
      if (n.at < steps) add(n.at, { kind: 'note', freq: noteFreq(n.name) * Math.pow(2, inst.oct), steps: n.steps });
    }
    return grid;
  }
  const cs = chordsPerBar(song);
  cs.forEach((c, b) => {
    const s0 = b * STEPS_PER_BAR;
    switch (inst.role) {
      case 'chords':
        for (const s of [0, 4]) for (let i = 0; i < 3; i++) add(s0 + s, { kind: 'note', freq: chordFreq(c, i, inst.oct), steps: 4 });
        break;
      case 'arp':
        [0, 1, 2, 1, 0, 1, 2, 1].forEach((tone, k) => add(s0 + k, { kind: 'note', freq: chordFreq(c, tone, inst.oct), steps: 2 }));
        break;
      case 'pad':
        add(s0, { kind: 'note', freq: chordFreq(c, 0, inst.oct), steps: STEPS_PER_BAR });
        add(s0, { kind: 'note', freq: chordFreq(c, 2, inst.oct), steps: STEPS_PER_BAR });
        break;
      case 'bass':
        add(s0, { kind: 'note', freq: chordFreq(c, 0, inst.oct), steps: 3 });
        add(s0 + 4, { kind: 'note', freq: chordFreq(c, 2, inst.oct), steps: 3 });
        break;
      case 'rhythm':
        add(s0, { kind: 'drum', drum: 'kick' });
        add(s0 + 2, { kind: 'drum', drum: 'hat' });
        add(s0 + 4, { kind: 'drum', drum: 'tom' });
        add(s0 + 6, { kind: 'drum', drum: 'hat' });
        if (b % 2 === 1) add(s0 + 7, { kind: 'drum', drum: 'wood' });
        break;
      default:
        break;
    }
  });
  return grid;
}

export function stepMs(song: Song): number {
  return 60000 / song.bpm / 2;
}

export function songOf(id: string): Song {
  const s = findSong(id);
  if (!s) throw new Error(`no song ${id}`);
  return s;
}

/**
 * Steps to schedule now: every step whose start time lies before `now + lookaheadMs` and that has
 * not been scheduled yet (`next` is the first unscheduled step number, counted from `startedAt`).
 */
export function dueSteps(startedAt: number, now: number, lookaheadMs: number, stepLen: number, next: number): { step: number; atMs: number }[] {
  const out: { step: number; atMs: number }[] = [];
  for (let s = Math.max(0, next); ; s++) {
    const atMs = startedAt + s * stepLen;
    if (atMs >= now + lookaheadMs) break;
    out.push({ step: s, atMs });
    if (out.length > 64) break;
  }
  return out;
}

export type Slots = readonly (InstId | null)[];

export function emptySlots(): (InstId | null)[] {
  return Array.from({ length: SLOTS }, () => null);
}

/** Tapping an instrument on the shelf: off the stage when it is on it, else onto the first free place. */
export function toggleOnStage(slots: Slots, id: InstId): { slots: (InstId | null)[]; result: 'added' | 'removed' | 'full' } {
  const at = slots.indexOf(id);
  const next = [...slots];
  if (at >= 0) {
    next[at] = null;
    return { slots: next, result: 'removed' };
  }
  const free = next.indexOf(null);
  if (free < 0) return { slots: next, result: 'full' };
  next[free] = id;
  return { slots: next, result: 'added' };
}

/** Dropping an instrument on place `i`: it moves there; whoever was there swaps places, or leaves if the dropped one came from the shelf. */
export function placeAt(slots: Slots, id: InstId, i: number): (InstId | null)[] {
  const next = [...slots];
  if (i < 0 || i >= next.length) return next;
  const from = next.indexOf(id);
  const displaced = next[i] ?? null;
  if (from === i) return next;
  if (from >= 0) next[from] = displaced;
  next[i] = id;
  return next;
}
