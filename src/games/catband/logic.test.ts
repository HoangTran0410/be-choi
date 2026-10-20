import { describe, expect, it } from 'vitest';
import { SONGS, findSong, noteFreq } from '../../core/music';
import { mulberry32 } from '../../core/dom';
import { DRAWN_DESIGNS } from './cats';
import {
  BASE_DESIGNS,
  BEATS_PER_BAR,
  CAT_COUNT,
  CAT_PC,
  CHORD_NAMES,
  NEW_DESIGNS,
  NUMBER_WORDS,
  SAVE_KEY,
  SONG_UNLOCKS,
  STYLES,
  barEvents,
  bassHz,
  bestChord,
  buildFinale,
  catHz,
  catScale,
  catSize,
  chordCats,
  chordHz,
  chordTones,
  chorusBar,
  createGuide,
  designsFor,
  harmonyBar,
  joinChorus,
  loadCatSave,
  makeMemory,
  memoryCheck,
  memoryStart,
  newCatsFor,
  songChords,
  songSteps,
  songUnlocked,
  storeCatSave,
} from './logic';

describe('cats and notes', () => {
  it('maps the eight cats to C D E F G A B C, rising', () => {
    expect(CAT_PC).toEqual([0, 2, 4, 5, 7, 9, 11, 0]);
    for (let i = 1; i < CAT_COUNT; i++) expect(catHz(i)).toBeGreaterThan(catHz(i - 1));
  });
  it('sings an octave above the written scale, and the last cat is one octave over the first', () => {
    expect(catHz(0)).toBeCloseTo(noteFreq('C4') * 2, 1);
    expect(catHz(7) / catHz(0)).toBeCloseTo(2, 1);
  });
  it('a flat is a semitone down', () => {
    expect(catHz(6, -1) / catHz(6)).toBeCloseTo(Math.pow(2, -1 / 12), 5);
  });
  it('the higher the voice, the smaller the cat', () => {
    for (let i = 1; i < CAT_COUNT; i++) expect(catScale(i)).toBeLessThan(catScale(i - 1));
    expect(catScale(0)).toBe(1);
    expect(catScale(CAT_COUNT - 1)).toBeGreaterThan(0.6);
    expect([catSize(0), catSize(4), catSize(7)]).toEqual(['to', 'vừa', 'nhỏ']);
  });
});

describe('designs and unlocking', () => {
  it('starts with eight different, drawn cats', () => {
    const d = designsFor(0);
    expect(d.length).toBe(CAT_COUNT);
    expect(new Set(d.map((x) => x.id)).size).toBe(CAT_COUNT);
    expect(d.map((x) => x.id)).toEqual(BASE_DESIGNS.map((x) => x.id));
  });
  it('every design can be drawn and has a name that starts with Mèo', () => {
    for (const d of [...BASE_DESIGNS, ...NEW_DESIGNS]) {
      expect(DRAWN_DESIGNS, d.id).toContain(d.id);
      expect(d.name.startsWith('Mèo')).toBe(true);
      expect(d.say.length).toBeGreaterThan(0);
    }
    expect(NEW_DESIGNS.map((d) => d.name)).toEqual(
      expect.arrayContaining(['Mèo đen', 'Mèo tam thể', 'Mèo cam', 'Mèo đeo nơ', 'Mèo phi hành gia', 'Mèo DJ']),
    );
  });
  it('each star brings exactly one new cat, never repeats one, and stops at all of them', () => {
    let prev = designsFor(0).map((x) => x.id);
    for (let stars = 1; stars <= NEW_DESIGNS.length + 3; stars++) {
      const cur = designsFor(stars).map((x) => x.id);
      expect(new Set(cur).size).toBe(CAT_COUNT);
      const changed = cur.filter((id, i) => id !== prev[i]).length;
      expect(changed).toBe(stars <= NEW_DESIGNS.length ? 1 : 0);
      prev = cur;
    }
    expect(newCatsFor(-3)).toBe(0);
    expect(newCatsFor(99)).toBe(NEW_DESIGNS.length);
    expect(designsFor(99).every((d) => NEW_DESIGNS.includes(d))).toBe(true);
  });
  it('some songs are free and every song exists, is unique, and opens by stars', () => {
    expect(new Set(SONG_UNLOCKS.map((s) => s.id)).size).toBe(SONG_UNLOCKS.length);
    for (const s of SONG_UNLOCKS) expect(findSong(s.id), s.id).toBeDefined();
    expect(SONG_UNLOCKS.filter((s) => s.need === 0).length).toBeGreaterThanOrEqual(3);
    expect(songUnlocked('twinkle', 0)).toBe(true);
    expect(songUnlocked('birthday', 0)).toBe(false);
    expect(songUnlocked('birthday', 99)).toBe(true);
    expect(songUnlocked('nope', 99)).toBe(false);
    const needs = SONG_UNLOCKS.map((s) => s.need);
    expect([...needs].sort((a, b) => a - b)).toEqual(needs);
  });
});

describe('saving', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  it('round-trips with a version', () => {
    const s = store();
    expect(storeCatSave({ stars: 4, faces: {} }, s)).toBe(true);
    expect(JSON.parse(s.m.get(SAVE_KEY) ?? '{}').v).toBe(2);
    expect(loadCatSave(s)).toEqual({ stars: 4, faces: {} });
  });
  it('starts at zero for nothing, junk, or a save from the future', () => {
    const s = store();
    expect(loadCatSave(s)).toEqual({ stars: 0, faces: {} });
    s.setItem(SAVE_KEY, '{oops');
    expect(loadCatSave(s)).toEqual({ stars: 0, faces: {} });
    s.setItem(SAVE_KEY, JSON.stringify({ v: 99, stars: 7 }));
    expect(loadCatSave(s)).toEqual({ stars: 0, faces: {} });
    s.setItem(SAVE_KEY, JSON.stringify({ v: 1, stars: -2 }));
    expect(loadCatSave(s)).toEqual({ stars: 0, faces: {} });
  });
  it('blocked storage does not throw', () => {
    expect(loadCatSave(null)).toEqual({ stars: 0, faces: {} });
    expect(storeCatSave({ stars: 1, faces: {} }, null)).toBe(false);
  });
});

describe('saving, older and odder', () => {
  const store = (raw: string) => ({ getItem: () => raw, setItem: () => undefined, removeItem: () => undefined });
  it('reads a version-1 save (stars only) and starts with no photo faces', () => {
    expect(loadCatSave(store(JSON.stringify({ v: 1, stars: 5 })))).toEqual({ stars: 5, faces: {} });
  });
  it('keeps good photo faces and drops bad seats', () => {
    const raw = JSON.stringify({ v: 2, stars: 1, faces: { '2': 'abc', '9': 'x', z: 'y', '3': 7 } });
    expect(loadCatSave(store(raw))).toEqual({ stars: 1, faces: { '2': 'abc' } });
  });
});

describe('memory phrases', () => {
  it('start at 2 notes and grow with the stars up to 5', () => {
    expect([0, 2, 3, 6, 9, 30].map(memoryStart)).toEqual([2, 2, 3, 4, 5, 5]);
  });
  it('are made of real cats, never the same one three times in a row', () => {
    for (let seed = 1; seed < 60; seed++) {
      const seq = makeMemory(5, mulberry32(seed));
      expect(seq.length).toBe(5);
      for (let i = 0; i < 5; i++) {
        expect(seq[i]).toBeGreaterThanOrEqual(0);
        expect(seq[i]).toBeLessThan(CAT_COUNT);
        if (i >= 2) expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false);
      }
    }
  });
  it('are checked note by note, and a wrong cat is only wrong, never a dead end', () => {
    const seq = [3, 3, 5];
    expect(memoryCheck(seq, 0, 3)).toBe('ok');
    expect(memoryCheck(seq, 1, 4)).toBe('wrong');
    expect(memoryCheck(seq, 2, 5)).toBe('complete');
  });
});

describe('songs as cats', () => {
  it('turns every song in the picker into steps on real cats, with no rests, in order', () => {
    for (const { id } of SONG_UNLOCKS) {
      const song = findSong(id)!;
      const steps = songSteps(song);
      expect(steps.length, id).toBe(song.notes.filter((n) => n.n !== 'R').length);
      let beat = -1;
      for (const s of steps) {
        expect(s.cat).toBeGreaterThanOrEqual(0);
        expect(s.cat).toBeLessThan(CAT_COUNT);
        expect(s.beat).toBeGreaterThanOrEqual(beat);
        beat = s.beat;
      }
    }
  });
  it('keeps each note on a cat of the same letter (the tune keeps its tune)', () => {
    for (const song of SONGS) {
      const steps = songSteps(song);
      const pcs = song.notes.filter((n) => n.n !== 'R').map((n) => n.n.replace(/\d/, ''));
      steps.forEach((s, i) => {
        const letterPc = (CAT_PC[s.cat] ?? 0) + s.semis;
        expect(((letterPc % 12) + 12) % 12, `${song.id}#${i} ${pcs[i]}`).toBe(s.pc);
      });
    }
  });
  it('twinkle is cat 0 0 4 4 5 5 4', () => {
    const steps = songSteps(findSong('twinkle')!);
    expect(steps.slice(0, 7).map((s) => s.cat)).toEqual([0, 0, 4, 4, 5, 5, 4]);
  });
  it('birthday has a flat (the B flat) and keeps it flat', () => {
    const steps = songSteps(findSong('birthday')!);
    expect(steps.some((s) => s.semis === -1)).toBe(true);
  });
  it('a tune wider than the cats is folded onto them', () => {
    const steps = songSteps(findSong('chauyeuba')!);
    expect(steps.every((s) => s.cat >= 0 && s.cat < CAT_COUNT)).toBe(true);
  });
});

describe('the light guide never gets stuck', () => {
  const steps = songSteps(findSong('twinkle')!);
  it('waits on a wrong cat, moves on a right one, and finishes', () => {
    const g = createGuide(steps);
    expect(g.lit).toBe(steps[0]!.cat);
    const wrong = (g.lit! + 1) % CAT_COUNT;
    expect(g.tap(wrong)).toBe('wait');
    expect(g.index).toBe(0);
    expect(g.tap(g.lit!)).toBe('right');
    expect(g.index).toBe(1);
    expect(g.progress).toBeCloseTo(1 / steps.length);
  });
  it('whatever is tapped, a cat is always lit until the end, and tapping the lit cat always finishes', () => {
    for (const { id } of SONG_UNLOCKS) {
      const st = songSteps(findSong(id)!);
      const rnd = mulberry32(id.length * 7919);
      const g = createGuide(st);
      let taps = 0;
      while (!g.done) {
        expect(g.lit, `${id} lit`).not.toBeNull();
        // Half the time a random cat (maybe right, maybe not), half the time the lit one.
        const cat = rnd() < 0.5 ? Math.floor(rnd() * CAT_COUNT) : g.lit!;
        const before = g.index;
        const res = g.tap(cat);
        expect(g.index === before || g.index === before + 1).toBe(true);
        if (res === 'wait') expect(g.index).toBe(before);
        if (++taps > st.length * 200) throw new Error(`${id}: stuck`);
      }
      expect(g.lit).toBeNull();
      expect(g.progress).toBe(1);
      expect(g.tap(0)).toBe('done');
    }
  });
  it('the same cat twice in a row is two steps', () => {
    const g = createGuide(steps);
    g.tap(steps[0]!.cat);
    expect(g.lit).toBe(steps[1]!.cat);
    expect(steps[0]!.cat).toBe(steps[1]!.cat);
  });
  it('an empty song is already done', () => {
    const g = createGuide([]);
    expect(g.done).toBe(true);
    expect(g.lit).toBeNull();
    expect(g.progress).toBe(1);
  });
});

describe('chords', () => {
  it('know their notes', () => {
    expect(chordTones('C')).toEqual([0, 4, 7]);
    expect(chordTones('Am')).toEqual([9, 0, 4]);
    expect(chordTones('G')).toEqual([7, 11, 2]);
  });
  it('give the cats that can sing over them', () => {
    expect(chordCats('C')).toEqual([0, 2, 4, 7]);
    expect(chordCats('F')).toEqual([0, 3, 5, 7]);
    expect(chordCats('G')).toEqual([1, 4, 6]);
    expect(chordCats('Am')).toEqual([0, 2, 5, 7]);
    for (const c of CHORD_NAMES) expect(chordCats(c).length, c).toBeGreaterThanOrEqual(2);
  });
  it('voice a triad around middle C with the bass far below', () => {
    const hz = chordHz('C');
    expect(hz[0]).toBeCloseTo(261.63, 1);
    expect(hz[1]).toBeCloseTo(329.63, 1);
    expect(hz[2]).toBeCloseTo(392, 1);
    for (const c of CHORD_NAMES) {
      expect(bassHz(c)).toBeLessThan(chordHz(c)[0]!);
      expect(chordHz(c)[0]).toBeGreaterThan(150);
      expect(chordHz(c)[2]).toBeLessThan(600);
    }
  });
  it('bestChord picks the chord a melody sits on', () => {
    const w = new Array<number>(12).fill(0);
    expect(bestChord(w)).toBe('C');
    w[5] = 2;
    w[9] = 1;
    w[0] = 1;
    expect(bestChord(w)).toBe('F');
    const g = new Array<number>(12).fill(0);
    g[7] = 2;
    g[11] = 1;
    g[2] = 1;
    expect(bestChord(g)).toBe('G');
  });
  it('every song gets one chord per bar and ends at home', () => {
    for (const { id } of SONG_UNLOCKS) {
      const song = findSong(id)!;
      const chords = songChords(song);
      expect(chords.length, id).toBeGreaterThan(2);
      expect(chords[chords.length - 1]).toBe('C');
    }
    // …and the chord holds up its bar: more than half of the melody's length is on chord notes (the rest are passing notes).
    for (const { id } of SONG_UNLOCKS) {
      const song = findSong(id)!;
      const steps = songSteps(song);
      const per = id === 'birthday' ? 3 : 4;
      const chords = songChords(song, steps);
      let covered = 0;
      let total = 0;
      for (const s of steps) {
        const bar = Math.min(chords.length - 1, Math.floor((s.beat + 1e-6) / per));
        total += s.dur;
        if (chordTones(chords[bar]!).includes(s.pc)) covered += s.dur;
      }
      expect(covered / total, id).toBeGreaterThan(0.5);
    }
  });
});

describe('the band', () => {
  it('plays only on beats inside the bar, with real notes', () => {
    for (const style of STYLES) {
      for (const chord of CHORD_NAMES) {
        for (let bar = 0; bar < 4; bar++) {
          const ev = barEvents(style.id, chord, bar);
          expect(ev.length).toBeGreaterThan(3);
          for (const e of ev) {
            expect(e.t).toBeGreaterThanOrEqual(0);
            expect(e.t).toBeLessThan(BEATS_PER_BAR);
            if (e.kind === 'bass') expect(e.hz).toBeGreaterThan(30);
            if (e.kind === 'chord') expect(e.hz.every((x) => x > 100 && x < 700)).toBe(true);
          }
        }
      }
    }
  });
  it('has three styles with a progression of chords that exist', () => {
    expect(STYLES.map((s) => s.id)).toEqual(['vui', 'rock', 'em']);
    for (const s of STYLES) for (const c of s.progression) expect(CHORD_NAMES).toContain(c);
  });
  it('plays drums only when there is no chord', () => {
    for (const style of STYLES) {
      const ev = barEvents(style.id, null, 0);
      expect(ev.length).toBeGreaterThan(0);
      expect(ev.every((e) => e.kind === 'drum')).toBe(true);
    }
  });
  it('each style has its own drums, bass and chords', () => {
    const kinds = (id: 'vui' | 'rock' | 'em') => new Set(barEvents(id, 'C', 0).map((e) => e.kind));
    for (const id of ['vui', 'rock', 'em'] as const) expect(kinds(id)).toEqual(new Set(['drum', 'bass', 'chord']));
    expect(barEvents('rock', 'C', 0).some((e) => e.kind === 'drum' && e.drum === 'crash')).toBe(true);
  });
});

describe('cats singing along', () => {
  it('only ever sing notes of the chord, over any chord, any seed', () => {
    for (const chord of CHORD_NAMES) {
      const ok = new Set(chordCats(chord));
      for (let seed = 1; seed <= 40; seed++) {
        const hits = harmonyBar(chord, mulberry32(seed));
        expect(hits.length).toBeGreaterThanOrEqual(2);
        expect(hits.length).toBeLessThanOrEqual(3);
        for (const hit of hits) {
          expect(ok.has(hit.cat), `${chord} cat ${hit.cat}`).toBe(true);
          expect(hit.t).toBeGreaterThanOrEqual(0);
          expect(hit.t).toBeLessThan(BEATS_PER_BAR);
        }
        expect(new Set(hits.map((x) => x.t)).size).toBe(hits.length);
      }
    }
  });
  it('the chorus grows with the child, capped, without repeats', () => {
    let c: number[] = [];
    c = joinChorus(c, 3);
    c = joinChorus(c, 3);
    expect(c).toEqual([3]);
    for (const n of [1, 2, 4, 5, 6]) c = joinChorus(c, n);
    expect(c.length).toBe(4);
    expect(c).toEqual([2, 4, 5, 6]);
  });
  it('the chorus sits out the bars whose chord does not fit a member', () => {
    expect(chorusBar([0, 2, 6], 'C').map((h) => h.cat)).toEqual([0, 2]);
    expect(chorusBar([0, 2, 6], 'G').map((h) => h.cat)).toEqual([6]);
    for (const chord of CHORD_NAMES) {
      const ok = new Set(chordCats(chord));
      for (const h of chorusBar([0, 1, 2, 3, 4, 5, 6, 7], chord)) {
        expect(ok.has(h.cat)).toBe(true);
        expect(h.t).toBeLessThan(BEATS_PER_BAR);
      }
    }
  });
});

describe('the finale', () => {
  it('has every melody note on its beat, and the band under it, in order', () => {
    for (const { id } of SONG_UNLOCKS) {
      const song = findSong(id)!;
      const steps = songSteps(song);
      const { events, totalMs } = buildFinale(song, 'vui', steps);
      const cats = events.filter((e) => 'cat' in e);
      expect(cats.length).toBe(steps.length);
      expect(events.some((e) => 'ev' in e)).toBe(true);
      for (let i = 1; i < events.length; i++) expect(events[i]!.ms).toBeGreaterThanOrEqual(events[i - 1]!.ms);
      expect(totalMs).toBeGreaterThan(events[events.length - 1]!.ms - 1);
      const beatMs = 60000 / song.bpm;
      expect((cats[0] as { ms: number }).ms).toBe(steps[0]!.beat * beatMs);
    }
  });
});

describe('the names', () => {
  it('has a number word for every cat (shown as text, never spoken on a tap)', () => {
    expect(NUMBER_WORDS.length).toBe(CAT_COUNT);
    for (const d of designsFor(3)) expect(d.say.length).toBeGreaterThan(0);
  });
});

describe('tuning: the cats and the band share one A440 scale', () => {
  const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  const cents = (a: number, b: number) => Math.abs(1200 * Math.log2(a / b));
  const fold = (hz: number, ref: number) => {
    let x = hz;
    while (x > ref * 1.4142) x /= 2;
    while (x < ref / 1.4142) x *= 2;
    return x;
  };

  it('every cat sits on the equal-tempered note it is named for (C5 D5 E5 F5 G5 A5 B5 C6)', () => {
    [72, 74, 76, 77, 79, 81, 83, 84].forEach((m, cat) => expect(cents(catHz(cat), midiHz(m))).toBeLessThan(1));
  });

  it('a cat that sings over a chord is on one of the chord tones, to the cent', () => {
    for (const name of CHORD_NAMES) {
      const tones = chordHz(name);
      for (const cat of chordCats(name)) {
        const best = Math.min(...tones.map((t) => cents(catHz(cat), fold(t, catHz(cat)))));
        expect(best, `${name} ${cat}`).toBeLessThan(1);
      }
    }
  });

  it('the bass is the chord root, in tune with the cats', () => {
    for (const name of CHORD_NAMES) {
      const root = chordTones(name)[0] as number;
      const pcHz = midiHz(72 + root);
      expect(cents(fold(bassHz(name), pcHz), pcHz)).toBeLessThan(1);
    }
  });
});
