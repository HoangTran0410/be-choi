import { SONGS, type Song, type SongNote } from '../../core/music';

/** "C4 C4 G4:2 R:1" → notes; ":x" is beats (default 1). Same syntax as core/music. */
function seq(text: string): SongNote[] {
  return text
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, d] = tok.split(':');
      return { n: n ?? 'R', d: d ? Number(d) : 1 };
    });
}

/** Public-domain melodies only, all notes within SCALE_C. */
export const EXTRA_SONGS: readonly Song[] = [
  {
    // Row, Row, Row Your Boat (6/8). One beat = a dotted quarter, so a quarter
    // is 0.67 and an eighth 0.33; the final note is a dotted half.
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
    notes: seq(
      'E4 D4 C4:2 E4 D4 C4:2 ' +
        'C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 ' +
        'E4 D4 C4:2',
    ),
  },
  {
    // Rain, Rain, Go Away (sol–mi chant).
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

/** Everything the song strip offers: the shared melodies first, then the xylophone extras. */
export const ALL_SONGS: readonly Song[] = [...SONGS, ...EXTRA_SONGS];
