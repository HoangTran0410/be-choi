import { describe, expect, it } from 'vitest';
import { DRUMS, TIMBRES } from '../../core/audio';
import { parseVersioned } from '../../core/save';
import { ENTRIES, GROUPS, bandVoices, entriesOf, findEntry } from './catalog';
import { inPenta } from './instruments/scale';
import { voiceMidi } from './instruments/voices';
import {
  addStamp,
  ALBUM_SPEC,
  AUTO_PATTERNS,
  autoDegree,
  BAND_NEEDS,
  BAND_SLOTS,
  bandOpen,
  CHORDS,
  createMissions,
  emptyAlbum,
  normalizeAlbum,
  placeOf,
  roomLayout,
  setSlot,
  stepEvents,
  stepMs,
  TILE_MIN,
  TRACKS,
  trackOpen,
} from './logic';

describe('catalog', () => {
  it('has four groups and every instrument in exactly one of them', () => {
    expect(GROUPS.map((g) => g.id)).toEqual(['strike', 'pluck', 'keys', 'shake']);
    expect(GROUPS.flatMap((g) => entriesOf(g.id)).length).toBe(ENTRIES.length);
    expect(new Set(ENTRIES.map((x) => x.id)).size).toBe(ENTRIES.length);
  });

  it('covers all nine timbres, the whole drum kit and every world instrument', () => {
    const kinds = new Set(ENTRIES.map((x) => x.kind));
    for (const t of TIMBRES) expect(kinds.has(t), t).toBe(true);
    // the kit and the hand-percussion rack stand for the eleven drums
    expect(kinds.has('snare')).toBe(true);
    expect(kinds.has('cowbell')).toBe(true);
    expect(DRUMS.length).toBe(11);
    for (const k of [
      'marimba',
      'vibraphone',
      'steelpan',
      'handpan',
      'djembe',
      'gong',
      'harp',
      'ukulele',
      'banjo',
      'kalimba',
      'organ',
      'accordion',
      'harmonica',
      'panflute',
      'maracas',
      'tambourine',
      'chimes',
      'castanets',
    ])
      expect(kinds.has(k as never), k).toBe(true);
  });

  it('says every name slowly: each word set apart by a comma, no word twice', () => {
    for (const en of ENTRIES) {
      expect(en.say, en.id).toMatch(/^[\p{L}\s,]+$/u);
      expect(
        en.say.split(',').every((w) => w.trim().length > 0),
        en.id,
      ).toBe(true);
    }
  });

  it('gives each instrument five orchestra voices, all pentatonic', () => {
    for (const en of ENTRIES) {
      const v = bandVoices(en.kind);
      expect(v.length, en.id).toBe(5);
      for (const x of v) {
        const m = voiceMidi(x);
        if (m !== null) expect(inPenta(m), `${en.id} ${m}`).toBe(true);
      }
    }
  });
});

describe('album and save', () => {
  it('starts empty and earns a stamp once', () => {
    const a = emptyAlbum();
    expect(addStamp(a, 'marimba')).toBe(true);
    expect(addStamp(a, 'marimba')).toBe(false);
    expect(addStamp(a, 'nonsense')).toBe(false);
    expect(a.stamps).toEqual(['marimba']);
    expect(a.stars).toBe(1);
  });

  it('opens the orchestra room at five stamps', () => {
    const a = emptyAlbum();
    for (const en of ENTRIES.slice(0, BAND_NEEDS - 1)) addStamp(a, en.id);
    expect(bandOpen(a)).toBe(false);
    addStamp(a, ENTRIES[BAND_NEEDS]!.id);
    expect(bandOpen(a)).toBe(true);
  });

  it('only collected instruments sit in the band, and one only once', () => {
    const a = emptyAlbum();
    addStamp(a, 'marimba');
    addStamp(a, 'harp');
    expect(setSlot(a, 0, 'gong')).toBe(false);
    expect(setSlot(a, 0, 'marimba')).toBe(true);
    expect(setSlot(a, 2, 'marimba')).toBe(true);
    expect(a.band).toEqual([null, null, 'marimba', null]);
    expect(setSlot(a, 9, 'harp')).toBe(false);
    expect(setSlot(a, 2, null)).toBe(true);
  });

  it('unlocks backing tracks with stamps', () => {
    expect(trackOpen(TRACKS[0]!, BAND_NEEDS)).toBe(true);
    expect(trackOpen(TRACKS[1]!, BAND_NEEDS)).toBe(false);
    expect(trackOpen(TRACKS[2]!, 99)).toBe(true);
  });

  it('round-trips and survives garbage', () => {
    const a = emptyAlbum();
    addStamp(a, 'harp');
    setSlot(a, 1, 'harp');
    const back = parseVersioned(JSON.stringify({ ...a, v: 1 }), ALBUM_SPEC)!;
    expect(back.stamps).toEqual(['harp']);
    expect(back.band[1]).toBe('harp');
    expect(parseVersioned('{"v":99}', ALBUM_SPEC)).toBeNull();
    const dirty = normalizeAlbum({ stamps: ['harp', 'harp', 7, 'zzz'], band: ['gong', 'harp', 'harp'], track: 'nope', stars: -3 });
    expect(dirty.stamps).toEqual(['harp']);
    expect(dirty.band).toEqual([null, 'harp', null, null]);
    expect(dirty.band.length).toBe(BAND_SLOTS);
    expect(dirty.track).toBe(TRACKS[0]!.id);
    expect(dirty.stars).toBe(0);
  });

  it('reads a save from before versions (no v) through the migration', () => {
    const old = parseVersioned(JSON.stringify({ collected: ['gong'] }), ALBUM_SPEC)!;
    expect(old.stamps).toEqual(['gong']);
  });
});

describe('missions', () => {
  it('"three places" needs three different places, a strum counts as one', () => {
    const m = createMissions(10);
    expect(m.hit('string0', 0, 0.65)).toEqual([]);
    for (let i = 1; i < 6; i++) m.hit(`string${i}`, 10 + i, 0.65);
    expect(m.done().has('places')).toBe(false);
    m.hit('chord:G', 3000, 0.65);
    expect(m.done().has('places')).toBe(false);
    expect(m.hit('chord:F', 6000, 0.65)).toContain('places');
    expect(placeOf('string3')).toBe('strum');
  });

  it('asks for fewer places on an instrument that has fewer', () => {
    const m = createMissions(2);
    m.hit('a', 0, 1);
    expect(m.hit('b', 1000, 1)).toContain('places');
  });

  it('"fast" is five touches within a couple of seconds; one strum is one touch', () => {
    const m = createMissions(9);
    for (let i = 0; i < 6; i++) m.hit(`string${i}`, 5000 + i * 20, 0.65);
    expect(m.done().has('fast')).toBe(false);
    const f = createMissions(9);
    const out: string[] = [];
    for (let i = 0; i < 5; i++) out.push(...f.hit('k', i * 300, 1));
    expect(out).toContain('fast');
  });

  it('"slow" is three touches, each a good while after the last', () => {
    const m = createMissions(9);
    m.hit('k', 0, 0.4);
    m.hit('k', 1000, 0.4);
    expect(m.done().has('slow')).toBe(false);
    expect(m.hit('k', 2100, 0.4)).toContain('slow');
    const quick = createMissions(9);
    for (let i = 0; i < 6; i++) quick.hit('k', i * 400, 1);
    expect(quick.done().has('slow')).toBe(false);
  });

  it('"soft and loud" needs both', () => {
    const m = createMissions(9);
    expect(m.hit('k', 0, 0.4)).toEqual([]);
    expect(m.hit('k', 5000, 1)).toContain('dynamics');
  });

  it('finishing all four completes it', () => {
    const m = createMissions(9);
    expect(m.complete()).toBe(false);
    m.finishAll();
    expect(m.complete()).toBe(true);
  });
});

describe('room layout', () => {
  it('uses tiles of at least 72 px, and says when it must scroll', () => {
    const counts = GROUPS.map((g) => entriesOf(g.id).length);
    for (const [w, h] of [
      [390, 748],
      [844, 294],
      [1024, 700],
      [360, 600],
      [320, 400],
    ] as const) {
      const lay = roomLayout(w, h, counts);
      expect(lay.tile, `${w}x${h}`).toBeGreaterThanOrEqual(TILE_MIN);
      expect(lay.tile).toBeLessThanOrEqual(96);
    }
    expect(roomLayout(1280, 900, counts).scroll).toBe(false);
    expect(roomLayout(320, 300, counts).scroll).toBe(true);
  });
});

describe('backing tracks', () => {
  it('play only drums that exist, on 16 steps, with every chord in C major', () => {
    const drums = new Set<string>(DRUMS);
    const major = [0, 2, 4, 5, 7, 9, 11];
    for (const tr of TRACKS) {
      expect(stepMs(tr)).toBeGreaterThan(100);
      for (const [d, pat] of Object.entries(tr.drums)) {
        expect(drums.has(d), d).toBe(true);
        expect(pat!.length).toBe(16);
      }
      for (let bar = 0; bar < 4; bar++) {
        for (let step = 0; step < 16; step++) {
          for (const n of stepEvents(tr, bar, step).notes)
            expect(major.includes(n.midi % 12), `${tr.id} bar ${bar} step ${step}: ${n.midi}`).toBe(true);
        }
      }
    }
    expect(CHORDS.length).toBe(4);
  });

  it('actually plays something on the first beat', () => {
    for (const tr of TRACKS) {
      const e = stepEvents(tr, 0, 0);
      expect(e.drums.length + e.notes.length, tr.id).toBeGreaterThan(0);
    }
  });

  it('gives the other instruments gentle patterns of the five voices', () => {
    for (const p of AUTO_PATTERNS) {
      expect(p.length).toBe(16);
      for (const d of p) if (d !== null) expect(d >= 0 && d <= 4).toBe(true);
      expect(p.filter((d) => d !== null).length).toBeLessThanOrEqual(8);
    }
    expect(autoDegree(5, 0)).toBe(autoDegree(1, 0));
    expect(findEntry('marimba')).toBeDefined();
  });
});
