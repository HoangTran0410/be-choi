import { DRUMS, type AudioEngine, type DrumKind, type Timbre } from '../../core/audio';
import { pick, randInt, shuffle } from '../../core/dom';
import { noteFreq, schedule, type SongNote } from '../../core/music';

export interface Instrument {
  id: string;
  emoji: string;
  /** Vietnamese name, spoken aloud (never shown as text). */
  name: string;
  /** Synth voice; `'drum'` phrases use `DrumKind` names instead of note names. */
  timbre: Timbre | 'drum';
  /** Pastel tile background. */
  color: string;
  bpm: number;
  /** Short signature phrase; `n` is a note name, a `DrumKind` (drum only) or `'R'` for a rest. */
  phrase: readonly SongNote[];
}

/** Correct answers before the celebration and star. */
export const QUIZ_ROUNDS = 5;

/** Options shown per quiz round (the answer plus two decoys). */
const OPTIONS = 3;

function seq(text: string): SongNote[] {
  // "C4 E4 G4:2" → notes; ":x" is beats (default 1)
  return text
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, d] = tok.split(':');
      return { n: n ?? 'R', d: d ? Number(d) : 1 };
    });
}

export const INSTRUMENTS: readonly Instrument[] = [
  { id: 'piano', emoji: '🎹', name: 'đàn piano', timbre: 'piano', color: '#fbcfe8', bpm: 120, phrase: seq('C4 E4 G4 C5:2') },
  {
    id: 'guitar',
    emoji: '🎸',
    name: 'đàn ghi-ta',
    timbre: 'guitar',
    color: '#fed7aa',
    bpm: 120,
    phrase: seq('C4:0.5 E4:0.5 G4:0.5 C5:1.5'),
  },
  { id: 'violin', emoji: '🎻', name: 'đàn vi-ô-lông', timbre: 'violin', color: '#ddd6fe', bpm: 96, phrase: seq('E4:1.5 G4:0.5 A4:2') },
  { id: 'trumpet', emoji: '🎺', name: 'kèn trumpet', timbre: 'trumpet', color: '#fef08a', bpm: 120, phrase: seq('G4 G4 C5:2') },
  { id: 'sax', emoji: '🎷', name: 'kèn sắc-xô', timbre: 'sax', color: '#bbf7d0', bpm: 108, phrase: seq('D4 F4 A4:2') },
  { id: 'bell', emoji: '🔔', name: 'chuông', timbre: 'bell', color: '#bfdbfe', bpm: 112, phrase: seq('C5 G4 E4 C4:2') },
  {
    id: 'drum',
    emoji: '🥁',
    name: 'trống',
    timbre: 'drum',
    color: '#fecaca',
    bpm: 132,
    phrase: seq('kick snare kick snare:0.5 hat:0.5 kick'),
  },
];

export function isDrumKind(n: string): n is DrumKind {
  return (DRUMS as readonly string[]).includes(n);
}

export interface QuizRound {
  answer: Instrument;
  /** Three distinct instruments, shuffled; exactly one is `answer`. */
  options: Instrument[];
}

/** One listening question. The answer is never the instrument with id `excludeId`. */
export function makeQuizRound(rng: () => number = Math.random, excludeId?: string): QuizRound {
  const pool = INSTRUMENTS.filter((i) => i.id !== excludeId);
  const answer = pool[randInt(0, pool.length - 1, rng)];
  if (!answer) throw new Error('band: INSTRUMENTS is empty');
  const decoys = pick(
    INSTRUMENTS.filter((i) => i.id !== answer.id),
    OPTIONS - 1,
    rng,
  );
  return { answer, options: shuffle([answer, ...decoys], rng) };
}

/**
 * Play an instrument's phrase with setTimeout scheduling. `onStep(i)` fires as
 * each note (or rest) starts, `onDone` after the last one ends. Returns a
 * cancel function; cancelling never calls `onDone`.
 */
export function playPhrase(audio: AudioEngine, inst: Instrument, onStep?: (i: number) => void, onDone?: () => void): () => void {
  return schedule(
    inst.phrase,
    inst.bpm,
    (i, note, ms) => {
      onStep?.(i);
      if (note.n === 'R') return;
      if (inst.timbre === 'drum') {
        if (isDrumKind(note.n)) audio.drum(note.n);
        return;
      }
      audio.note(noteFreq(note.n), (ms / 1000) * 0.9, inst.timbre);
    },
    onDone,
  );
}
