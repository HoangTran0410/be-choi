import { describe, it, expect } from 'vitest';
import { SONGS, type Song } from '../../core/music';
import {
  beatCheck,
  clipboardSource,
  createHistory,
  draftFromSong,
  DURATIONS,
  lyricsSource,
  noteLines,
  noteStarts,
  noteToken,
  overflowingPhrases,
  parseDraft,
  parsePitch,
  phraseNoteRange,
  phraseSpans,
  pitchRow,
  pitchRows,
  rowPitch,
  seqSource,
  serializeDraft,
  setAcc,
  snapDuration,
  stepDuration,
  stepPitch,
  totalNoteBeats,
  withInsertedNote,
  withNote,
  withoutNote,
  withPhraseBeats,
} from './logic';

/** A song whose numbers are small enough to check by hand: 5 beats of melody, 4 of words. */
const TOY: Song = {
  id: 'toy',
  title: 'Bài thử',
  icon: '🧸',
  bpm: 100,
  notes: [
    { n: 'C4', d: 1 },
    { n: 'D4', d: 1 },
    { n: 'E4', d: 2 },
    { n: 'G4', d: 1 },
  ],
  lyrics: [
    { emoji: '🧸', text: 'Một hai', beats: 2 },
    { emoji: '🎈', text: 'Ba bốn', beats: 2 },
  ],
};

describe('draft', () => {
  it('copies the song so editing never touches SONGS', () => {
    const draft = draftFromSong(TOY);
    const note = draft.notes[0];
    if (note) note.n = 'A4';
    const phrase = draft.phrases[0];
    if (phrase) phrase.beats = 99;
    expect(TOY.notes[0]?.n).toBe('C4');
    expect(TOY.lyrics?.[0]?.beats).toBe(2);
  });

  it('leaves phrases empty for a melody with no words', () => {
    const twinkle = SONGS.find((s) => s.id === 'twinkle') as Song;
    expect(draftFromSong(twinkle).phrases).toEqual([]);
  });
});

describe('pitch', () => {
  it('parses letter, accidental and octave', () => {
    expect(parsePitch('C4')).toEqual({ letter: 'C', acc: '', octave: 4 });
    expect(parsePitch('Bb4')).toEqual({ letter: 'B', acc: 'b', octave: 4 });
    expect(parsePitch('R')).toBeNull();
  });

  it('gives one row per letter, so a flat shares its letter’s row', () => {
    expect(pitchRow('B4')).toBe(pitchRow('Bb4'));
    expect(pitchRow('C5')).toBe(pitchRow('B4') + 1);
    expect(rowPitch(pitchRow('A4'))).toBe('A4');
  });

  it('steps up and down the scale, crossing the octave', () => {
    expect(stepPitch('C4', 1)).toBe('D4');
    expect(stepPitch('B4', 1)).toBe('C5');
    expect(stepPitch('C4', -1)).toBe('B3');
    expect(stepPitch('C4', 7)).toBe('C5');
  });

  it('drops the accidental when stepping, because ♮♯♭ is its own control', () => {
    expect(stepPitch('Bb4', 1)).toBe('C5');
    expect(setAcc('B4', 'b')).toBe('Bb4');
    expect(setAcc('Bb4', '')).toBe('B4');
  });

  it('stops at the ends of the keyboard', () => {
    expect(stepPitch('C4', -100)).toBe('C2');
    expect(stepPitch('C4', 100)).toBe('B7');
  });

  it('lists rows high to low with padding around the melody', () => {
    const rows = pitchRows(TOY.notes);
    expect(rows[0]).toBe('A4');
    expect(rows[rows.length - 1]).toBe('B3');
    expect(rows).toEqual(['A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3']);
  });

  it('falls back to one octave when the melody is all rests', () => {
    expect(pitchRows([{ n: 'R', d: 1 }], 0)).toEqual(['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4']);
  });
});

describe('duration', () => {
  it('snaps to a quarter beat and never to zero', () => {
    expect(snapDuration(0.9)).toBe(1);
    expect(snapDuration(1.13)).toBe(1.25);
    expect(snapDuration(-3)).toBe(0.25);
  });

  it('steps through the lengths on offer, from whatever is nearest', () => {
    expect(stepDuration(1, 1)).toBe(1.5);
    expect(stepDuration(1, -1)).toBe(0.75);
    expect(stepDuration(0.3, 1)).toBe(0.5);
    expect(stepDuration(DURATIONS[0] ?? 0, -1)).toBe(0.25);
    expect(stepDuration(4, 1)).toBe(4);
  });
});

describe('beats', () => {
  it('says where each note starts', () => {
    expect(noteStarts(TOY.notes)).toEqual([0, 1, 2, 4]);
    expect(totalNoteBeats(TOY.notes)).toBe(5);
  });

  it('keeps triplet lengths readable instead of drifting', () => {
    const thirds = [
      { n: 'C4', d: 0.33 },
      { n: 'D4', d: 0.33 },
      { n: 'E4', d: 0.33 },
    ];
    expect(totalNoteBeats(thirds)).toBe(0.99);
    expect(noteStarts(thirds)).toEqual([0, 0.33, 0.66]);
  });

  it('reports the melody running past the words', () => {
    expect(beatCheck(draftFromSong(TOY))).toEqual({ notes: 5, lyrics: 4, diff: 1 });
  });

  it('lays the lyric lines out on the beat', () => {
    expect(phraseSpans(TOY.lyrics ?? [])).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('flags the lyric line a held note is carried across', () => {
    // E4:2 starts on beat 2 and ends on beat 4, so it sits inside line 2 — nothing is carried.
    expect(overflowingPhrases(TOY.notes, TOY.lyrics ?? [])).toEqual(new Set());
    const carried = [
      { n: 'C4', d: 1 },
      { n: 'D4', d: 2 },
      { n: 'E4', d: 1 },
    ];
    // D4:2 runs from beat 1 to beat 3, across the end of line 1.
    expect(overflowingPhrases(carried, TOY.lyrics ?? [])).toEqual(new Set([0]));
  });

  it('finds the notes belonging to one lyric line, for looping it', () => {
    expect(phraseNoteRange(TOY.notes, TOY.lyrics ?? [], 0)).toEqual({ start: 0, end: 1 });
    expect(phraseNoteRange(TOY.notes, TOY.lyrics ?? [], 1)).toEqual({ start: 2, end: 2 });
    expect(phraseNoteRange(TOY.notes, TOY.lyrics ?? [], 9)).toBeNull();
  });
});

describe('edits', () => {
  it('returns a new draft and leaves the old one alone', () => {
    const draft = draftFromSong(TOY);
    const next = withNote(draft, 0, { n: 'A4' });
    expect(next.notes[0]?.n).toBe('A4');
    expect(next.notes[0]?.d).toBe(1);
    expect(draft.notes[0]?.n).toBe('C4');
  });

  it('inserts a copy of a note after it, and deletes', () => {
    const draft = draftFromSong(TOY);
    expect(withInsertedNote(draft, 0).notes.map(noteToken)).toEqual(['C4', 'C4', 'D4', 'E4:2', 'G4']);
    expect(withoutNote(draft, 1).notes.map(noteToken)).toEqual(['C4', 'E4:2', 'G4']);
  });

  it('keeps at least one note', () => {
    const one = draftFromSong({ ...TOY, notes: [{ n: 'C4', d: 1 }] });
    expect(withoutNote(one, 0)).toBe(one);
  });

  it('moves a lyric line to a whole number of beats, never below one', () => {
    const draft = draftFromSong(TOY);
    expect(withPhraseBeats(draft, 0, 3.4).phrases[0]?.beats).toBe(3);
    expect(withPhraseBeats(draft, 0, 0).phrases[0]?.beats).toBe(1);
    expect(withPhraseBeats(draft, 9, 3)).toBe(draft);
  });
});

describe('source text', () => {
  it('writes a beat-long note bare and everything else with its length', () => {
    expect(noteToken({ n: 'C4', d: 1 })).toBe('C4');
    expect(noteToken({ n: 'C4', d: 2 })).toBe('C4:2');
    expect(noteToken({ n: 'G4', d: 0.5 })).toBe('G4:0.5');
    expect(noteToken({ n: 'R', d: 0.33 })).toBe('R:0.33');
  });

  it('breaks the melody into one line per lyric line', () => {
    expect(noteLines(withPhraseBeats(draftFromSong(TOY), 1, 3))).toEqual(['C4 D4', 'E4:2 G4']);
  });

  it('gives the notes past the last lyric line a line of their own', () => {
    // G4 starts on beat 4, where the words have already run out.
    expect(noteLines(draftFromSong(TOY))).toEqual(['C4 D4', 'E4:2', 'G4']);
  });

  it('breaks a wordless melody every 8 beats', () => {
    const rain = SONGS.find((s) => s.id === 'rain') as Song;
    const lines = noteLines(draftFromSong(rain));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ').split(/\s+/)).toEqual(rain.notes.map(noteToken));
  });

  it('round-trips every song in the songbook, note for note', () => {
    for (const song of SONGS) {
      const tokens = noteLines(draftFromSong(song)).join(' ').trim().split(/\s+/);
      expect(tokens, song.id).toEqual(song.notes.map(noteToken));
    }
  });

  it('lays the seq() call out the way the songbook writes it', () => {
    expect(seqSource(withPhraseBeats(draftFromSong(TOY), 1, 3))).toBe(
      ['    notes: seq(', '      "C4 D4 " +', '        "E4:2 G4",', '    ),'].join('\n'),
    );
  });

  it('keeps a one-line melody on one line, and can use single quotes', () => {
    const short = draftFromSong({ ...TOY, lyrics: [{ emoji: '🧸', text: 'Một', beats: 8 }] });
    expect(seqSource(short, "'")).toBe("    notes: seq('C4 D4 E4:2 G4'),");
  });

  it('writes the lyric lines back as line() calls', () => {
    expect(lyricsSource(draftFromSong(TOY))).toBe(
      ['    lyrics: [', '      line("🧸", "Một hai", 2),', '      line("🎈", "Ba bốn", 2),', '    ],'].join('\n'),
    );
    expect(lyricsSource(draftFromSong({ ...TOY, lyrics: undefined }))).toBe('');
  });

  it('copies the words too, but only once their beats have moved', () => {
    const draft = draftFromSong(TOY);
    expect(clipboardSource(draft, TOY)).not.toContain('lyrics:');
    expect(clipboardSource(withPhraseBeats(draft, 0, 3), TOY)).toContain('line("🧸", "Một hai", 3),');
  });
});

describe('saved drafts', () => {
  it('round-trips a draft through storage', () => {
    const edited = withPhraseBeats(withNote(draftFromSong(TOY), 0, { n: 'Bb4', d: 0.5 }), 1, 5);
    const back = parseDraft(serializeDraft(edited), TOY);
    expect(back?.notes.map(noteToken)).toEqual(['Bb4:0.5', 'D4', 'E4:2', 'G4']);
    expect(back?.phrases.map((p) => p.beats)).toEqual([2, 5]);
  });

  it('always takes the words themselves from the file, never from the draft', () => {
    const raw = serializeDraft(draftFromSong(TOY));
    const renamed: Song = {
      ...TOY,
      lyrics: [
        { emoji: '🐤', text: 'Lời mới', beats: 2 },
        { emoji: '🎈', text: 'Ba bốn', beats: 2 },
      ],
    };
    expect(parseDraft(raw, renamed)?.phrases[0]?.text).toBe('Lời mới');
  });

  it('refuses anything that does not parse', () => {
    expect(parseDraft('not json', TOY)).toBeNull();
    expect(parseDraft('null', TOY)).toBeNull();
    expect(parseDraft('{"notes":[],"phrases":[]}', TOY)).toBeNull();
    expect(parseDraft('{"notes":["H9"],"phrases":[2,2]}', TOY)).toBeNull();
    expect(parseDraft('{"notes":["C4:x"],"phrases":[2,2]}', TOY)).toBeNull();
    // The song grew a lyric line since the draft was saved.
    expect(parseDraft('{"notes":["C4"],"phrases":[2]}', TOY)).toBeNull();
  });

  it('keeps a rest', () => {
    expect(parseDraft('{"notes":["R:2","C4"],"phrases":[2,2]}', TOY)?.notes[0]).toEqual({ n: 'R', d: 2 });
  });

  it('keys drafts per song', () => {
    expect(serializeDraft(draftFromSong(TOY))).toContain('C4');
  });
});

describe('history', () => {
  it('walks back and forward', () => {
    const h = createHistory('a');
    expect(h.canUndo()).toBe(false);
    h.push('b');
    h.push('c');
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
    expect(h.canRedo()).toBe(true);
  });

  it('drops the redo branch once a new edit lands', () => {
    const h = createHistory('a');
    h.push('b');
    h.undo();
    h.push('c');
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe('a');
  });
});
