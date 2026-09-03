/**
 * Note names, the 8-bar C major scale used by the xylophone/piano games, a
 * handful of public-domain nursery melodies with Vietnamese titles, and a tiny
 * scheduler that steps through a melody with setTimeout (cancellable).
 */
const SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

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

/** One line of a song: what the child sings while that stretch of melody plays. */
export interface Phrase {
  /** Big picture for the line, for a child who cannot read yet. */
  emoji: string;
  /** Vietnamese line. */
  text: string;
  /** Length in beats (quarter notes). The phrases of a song add up to its melody. */
  beats: number;
}

export interface Song {
  id: string;
  /** Vietnamese title, spoken aloud. */
  title: string;
  icon: string;
  bpm: number;
  notes: readonly SongNote[];
  /**
   * Words to sing, one line per musical phrase. Melodies with no Vietnamese words
   * of their own leave this out: they are for playing, not for singing along to.
   */
  lyrics?: readonly Phrase[];
}

/** A song a child can actually sing: it has words. */
export type SungSong = Song & { lyrics: readonly Phrase[] };

function line(emoji: string, text: string, beats: number): Phrase {
  return { emoji, text, beats };
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

/**
 * Every melody the app knows, shared by the games that need a tune (the xylophone
 * play-along, the karaoke stage, the bedtime lullaby). Nursery melodies are public
 * domain; the Vietnamese children's songs were transcribed from cảm âm the family
 * collected, with the rhythm written out by ear. Songs wider than the eight
 * xylophone bars are fine here — `fitsScale` keeps them off the xylophone. The
 * order is what the child sees: what a Vietnamese family sings first, foreign
 * nursery rhymes after; games that need one song by name use `findSong`.
 */
export const SONGS: readonly Song[] = [
  {
    id: 'butterfly',
    title: 'Kìa con bướm vàng',
    icon: '🦋',
    bpm: 112,
    notes: seq(
      'C4 D4 E4 C4 C4 D4 E4 C4:2 ' +
        'E4 F4 G4:2 E4 F4 G4:2 ' +
        'G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 ' +
        'G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 ' +
        'C4 G4 C4:2 C4 G4 C4:2',
    ),
    lyrics: [
      line('🦋', 'Kìa con bướm vàng', 4),
      line('🦋', 'Kìa con bướm vàng', 4),
      line('🪽', 'Xoè đôi cánh', 4),
      line('🪽', 'Xoè đôi cánh', 4),
      line('☁️', 'Bươm bướm bay hai ba vòng', 4),
      line('☁️', 'Bươm bướm bay hai ba vòng', 4),
      line('👀', 'Em ngồi xem', 4),
      line('👀', 'Em ngồi xem', 4),
    ],
  },
  {
    // Dân ca Nam Bộ. Cảm âm: mi2 re2 do2 / sol do2 re2 la … (plain = octave 4, "2" = octave 5).
    id: 'backimthang',
    title: 'Bắc kim thang',
    icon: '🪜',
    bpm: 108,
    notes: seq(
      'E5 D5 C5:1.5 G4:0.5 C5 D5 A4:2 ' +
        'A4 C5 G4:1.5 G4:0.5 A4 C5 G4:2 ' +
        'E5 E5 G4:1.5 A4:0.5 G4 G4 E5:2 ' +
        'E5 E5 E5:1.5 A4:0.5 A4 C5 D5:2 ' +
        'D5 D5 D5:1.5 E5:0.5 E5 C5 G4:2 ' +
        'C5 G4 A4 G4 G4 E5 C5 G4 C5:2',
    ),
    lyrics: [
      line('🪜', 'Bắc kim thang, cà lang bí rợ', 8),
      line('🏠', 'Cột qua kèo, là kèo qua cột', 8),
      line('🛢️', 'Chú bán dầu, qua cầu mà té', 8),
      line('🐸', 'Chú bán ếch, ở lại làm chi', 9),
      line('🥁', 'Con le le, đánh trống thổi kèn', 9),
      line('🐦', 'Con bìm bịp thổi tò tí te tò te', 10),
    ],
  },
  {
    id: 'canha',
    title: 'Cả nhà thương nhau',
    icon: '👨‍👩‍👧',
    bpm: 110,
    notes: seq('C5 C5 C5 A4 C5 D5 A4:2 ' + 'A4 D5 D5 C5 D5 G5 E5:2 ' + 'C5 D5 F5 D5 F5 G5 G5:2 ' + 'E5 D5 G5 A4 D5 C5 C5:2'),
    lyrics: [
      line('👨', 'Ba thương con vì con giống mẹ', 8),
      line('👩', 'Mẹ thương con vì con giống ba', 8),
      line('🏡', 'Cả nhà ta cùng yêu thương nhau', 8),
      line('💗', 'Xa là nhớ, gần nhau là cười', 8),
    ],
  },
  {
    // The only one of the Vietnamese songs that fits the eight xylophone bars.
    id: 'chaulenba',
    title: 'Cháu lên ba',
    icon: '🧒',
    bpm: 116,
    notes: seq(
      'A4 G4 F4 G4 F4 G4 A4:2 ' +
        'G4 G4 A4 F4:0.5 A4:0.5 G4 C5 F4:2 ' +
        'G4 A4 F4 C4:0.5 C4:0.5 F4 G4 A4:2 ' +
        'G4:0.5 F4 F4 A4 G4:0.5 F4:0.5 G4 C5 F4:2 ' +
        'F4:0.5 C5 A4 F4 F4:0.5 F4:0.5 C5 A4 F4:2',
    ),
    lyrics: [
      line('🧒', 'Cháu lên ba, cháu đi mẫu giáo', 8),
      line('👩‍🏫', 'Cô thương cháu vì cháu không khóc nhè', 9),
      line('🌱', 'Không khóc nhè thì mẹ trồng cây trái', 9),
      line('🚜', 'Ba vào nhà máy, ông bà vui cấy cày', 10),
      line('🎶', 'Là lá la la, là là lá la la', 10),
    ],
  },
  {
    id: 'chauyeuba',
    title: 'Cháu yêu bà',
    icon: '👵',
    bpm: 104,
    notes: seq(
      'F4 A4 F4 A4 G4 F4 A4:2 ' +
        'A4 F4 A4 F4 A4 G4 G4:2 ' +
        'A4 G4 F4 A4 A4 F4 G4:2 ' +
        'G4 A4 G4 F4 A4 A4 F4 F4:2 ' +
        'A4 G4 D5 A4 A4 D5 G4:2 ' +
        'G4 A4 G4 F4 A4 A4 F4 F4:2',
    ),
    lyrics: [
      line('👵', 'Bà ơi bà, cháu yêu bà lắm', 8),
      line('☁️', 'Tóc bà trắng, màu trắng như mây', 8),
      line('🤝', 'Cháu yêu bà, cháu nắm bàn tay', 8),
      line('😊', 'Khi cháu vâng lời, cháu biết bà vui', 9),
      line('🤝', 'Cháu yêu bà, cháu nắm bàn tay', 8),
      line('😊', 'Khi cháu vâng lời, cháu biết bà vui', 9),
    ],
  },
  {
    id: 'ngungon',
    title: 'Chúc bé ngủ ngon',
    icon: '🌙',
    bpm: 84,
    notes: seq(
      'G5 E5 C5 E5 E5:0.5 F5:0.5 E5:0.5 D5:0.5 C5:2 ' +
        'C5:0.5 A5 A5 G5 E5 F5:0.5 E5:0.5 D5:0.5 D5:2 ' +
        'G5 E5 C5 E5 E5:0.5 F5:0.5 E5 C5:2 ' +
        'A4 C5 G4 C5 B4:0.5 C5:0.5 B4:0.5 D5:0.5 C5:2 ' +
        'A4 C5 B4 C5 A4 B4 C5:2',
    ),
    lyrics: [
      line('🌙', 'Bé ơi ngủ đi, đêm đã khuya rồi', 10),
      line('💭', 'Để những giấc mơ đẹp sẽ luôn bên em', 10),
      line('🛏️', 'Bé ơi ngủ ngoan, trong tiếng ru hời', 9),
      line('🌕', 'Vầng trăng đợi em cùng bay vào giấc mơ', 10),
      line('💤', 'À ơi… à ơi… à à ơi…', 8),
    ],
  },
  {
    // "Happy Birthday to You" (public domain), F major, 3/4 with a pickup. The Bb
    // is outside SCALE_C, so the xylophone play-along simply skips those two notes.
    id: 'birthday',
    title: 'Chúc mừng sinh nhật',
    icon: '🎂',
    bpm: 120,
    notes: seq(
      'C4:0.75 C4:0.25 D4 C4 F4 E4:2 C4:0.75 C4:0.25 D4 C4 G4 F4:2 C4:0.75 C4:0.25 C5 A4 F4 E4 D4:2 Bb4:0.75 Bb4:0.25 A4 F4 G4 F4:2',
    ),
    lyrics: [
      line('🎂', 'Chúc mừng sinh nhật', 6),
      line('🎉', 'Chúc mừng sinh nhật', 6),
      line('🥳', 'Chúc mừng bé yêu của cả nhà', 7),
      line('🎈', 'Chúc mừng sinh nhật!', 6),
    ],
  },
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
  {
    // Row, Row, Row Your Boat (6/8). One beat is a dotted quarter, so a quarter
    // is 0.67 and an eighth 0.33; the last note is a dotted half.
    id: 'row',
    title: 'Chèo thuyền',
    icon: '🚣',
    bpm: 96,
    notes: seq(
      'C4 C4 C4:0.67 D4:0.33 E4 ' +
        'E4:0.67 D4:0.33 E4:0.67 F4:0.33 G4 ' +
        'C5:0.33 C5:0.33 C5:0.33 G4:0.33 G4:0.33 G4:0.33 E4:0.33 E4:0.33 E4:0.33 C4:0.33 C4:0.33 C4:0.33 ' +
        'G4:0.67 F4:0.33 E4:0.67 D4:0.33 C4:2',
    ),
  },
  {
    // Hot Cross Buns: "one a penny, two a penny" runs are eighths.
    id: 'buns',
    title: 'Bánh nướng',
    icon: '🥐',
    bpm: 110,
    notes: seq('E4 D4 C4:2 E4 D4 C4:2 C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 E4 D4 C4:2'),
  },
  {
    // Rain, Rain, Go Away (the sol–mi chant every playground knows).
    id: 'rain',
    title: 'Mưa ơi đi đi',
    icon: '🌧️',
    bpm: 100,
    notes: seq(
      'G4 E4 G4:0.5 G4:0.5 E4:2 ' +
        'G4:0.5 G4:0.5 E4 A4:0.5 G4:0.5 G4 E4:2 ' +
        'G4:0.5 G4:0.5 E4 A4:0.5 G4:0.5 G4 E4:2 ' +
        'G4 E4 G4:0.5 G4:0.5 E4:2',
    ),
  },
];

/** True when the song has words, so a singing game can offer it. */
export function hasLyrics(song: Song): song is SungSong {
  return (song.lyrics?.length ?? 0) > 0;
}

/** Which line is being sung at `beat`. Before the start → 0, past the end → the last line. */
export function phraseAt(phrases: readonly Phrase[], beat: number): number {
  if (phrases.length === 0) return 0;
  let at = 0;
  for (let i = 0; i < phrases.length; i++) {
    at += phrases[i]?.beats ?? 0;
    if (beat < at) return i;
  }
  return phrases.length - 1;
}

export function totalBeats(phrases: readonly Phrase[]): number {
  return phrases.reduce((sum, phrase) => sum + phrase.beats, 0);
}

/** True when every note fits the eight xylophone bars, so the play-along can ask for them all. */
export function fitsScale(song: Song): boolean {
  return song.notes.every((n) => n.n === 'R' || SCALE_C.includes(n.n));
}

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
