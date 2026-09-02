/**
 * Note names, the 8-bar C major scale used by the xylophone/piano games, a
 * handful of public-domain nursery melodies with Vietnamese titles, and a tiny
 * scheduler that steps through a melody with setTimeout (cancellable).
 */
const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C4' → 261.63, 'F#4' → 369.99, 'Bb3' → 233.08. Unknown names → 0. */
export function noteFreq(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) return 0;
  const [, letter, acc, oct] = m;
  const base = SEMITONES[letter ?? 'C'] ?? 0;
  const semi = base + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + (Number(oct) + 1) * 12;
  return Math.round(440 * Math.pow(2, (semi - 69) / 12) * 100) / 100;
}

/** The eight bars of a toy xylophone / one octave of the piano. */
export const SCALE_C: readonly string[] = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

/** Index of a note in SCALE_C, or -1. */
export function scaleIndex(note: string): number {
  return SCALE_C.indexOf(note);
}

export interface SongNote {
  /** Note name from SCALE_C, or 'R' for a rest. */
  n: string;
  /** Duration in beats (1 = quarter note). */
  d: number;
}

export interface Song {
  id: string;
  /** Vietnamese title, spoken aloud. */
  title: string;
  icon: string;
  bpm: number;
  notes: readonly SongNote[];
}

function seq(text: string): SongNote[] {
  // "C4 C4 G4:2 R:1" → notes; ":x" is beats (default 1)
  return text
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, d] = tok.split(':');
      return { n: n ?? 'R', d: d ? Number(d) : 1 };
    });
}

/** Public-domain melodies only (Vietnamese lyrics exist for each). All notes within SCALE_C. */
export const SONGS: readonly Song[] = [
  {
    id: 'twinkle',
    title: 'Ngôi sao lấp lánh',
    icon: '⭐',
    bpm: 100,
    notes: seq(
      'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2',
    ),
  },
  {
    id: 'butterfly',
    title: 'Kìa con bướm vàng',
    icon: '🦋',
    bpm: 112,
    notes: seq(
      'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 C4 G4 C4:2 C4 G4 C4:2',
    ),
  },
  {
    id: 'lamb',
    title: 'Con cừu nhỏ',
    icon: '🐑',
    bpm: 110,
    notes: seq('E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4'),
  },
  {
    id: 'bridge',
    title: 'Cầu Luân Đôn',
    icon: '🌉',
    bpm: 110,
    notes: seq('G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:3'),
  },
  {
    id: 'farmer',
    title: 'Bác nông dân',
    icon: '🚜',
    bpm: 110,
    notes: seq('G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:2 D4 G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:2'),
  },
];

export function findSong(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}

/**
 * Step through `notes` at `bpm`, calling `onNote(index, note, durationMs)` when each
 * note starts and `onDone` after the last one ends. Returns a cancel function.
 */
export function schedule(
  notes: readonly SongNote[],
  bpm: number,
  onNote: (index: number, note: SongNote, durationMs: number) => void,
  onDone?: () => void,
): () => void {
  const beatMs = 60000 / bpm;
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  const step = () => {
    if (cancelled) return;
    if (i >= notes.length) {
      onDone?.();
      return;
    }
    const note = notes[i] as SongNote;
    const ms = note.d * beatMs;
    onNote(i, note, ms);
    i++;
    timer = setTimeout(step, ms);
  };
  step();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
