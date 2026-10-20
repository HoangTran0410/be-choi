import { describe, it, expect } from 'vitest';
import { DRUMS, TIMBRES } from '../../core/audio';
import { INSTRUMENT_IDS } from '../../core/instruments';
import { DANCES } from './dance';
import {
  BARS,
  DEFAULT_VEL,
  DRUM_STYLES,
  LEVELS,
  SONGS,
  STEPS_PER_BAR,
  chordTones,
  isInstrument,
  pitchOf,
  safePcs,
  stepMs,
  type Hit,
  type Song,
} from './groove';
import { ROBOTS, STARTERS, barsOf, findRobot, playerFor } from './robots';

const STYLE_OF = new Map(SONGS.map((s) => [s.style, s]));

/** How many times the robot sounds (not counting a chord's notes twice) in the four-bar loop. */
function onsets(id: string, style: (typeof DRUM_STYLES)[number], level: 1 | 2 | 3): number {
  const bars = barsOf(id, style, level);
  let n = 0;
  for (let bar = 0; bar < BARS; bar++) n += new Set((bars[bar % bars.length] ?? []).map((h) => h.s)).size;
  return n;
}

function* allHits(): Generator<{ id: string; song: (typeof SONGS)[number]; level: 1 | 2 | 3; bar: number; hit: Hit }> {
  for (const r of ROBOTS) {
    for (const song of SONGS) {
      for (const level of LEVELS) {
        const bars = barsOf(r.id, song.style, level);
        for (let bar = 0; bar < BARS; bar++) {
          for (const hit of bars[bar % bars.length] ?? []) yield { id: r.id, song, level, bar, hit };
        }
      }
    }
  }
}

describe('the robots', () => {
  it('has 14–16 robots, 5 of them on the shelf at the start', () => {
    expect(ROBOTS.length).toBeGreaterThanOrEqual(14);
    expect(ROBOTS.length).toBeLessThanOrEqual(16);
    expect(STARTERS.length).toBe(5);
    for (const id of STARTERS) expect(findRobot(id)).toBeDefined();
  });

  it('starts with a beat, a bass, an accompaniment and a melody so the first song is complete', () => {
    const roles = new Set(STARTERS.map((id) => findRobot(id)!.role));
    for (const role of ['beat', 'bass', 'chord', 'melody'] as const) expect(roles.has(role)).toBe(true);
  });

  it('gives every robot its own id, name, colour, colour word and instrument', () => {
    for (const key of ['id', 'name', 'color', 'colorName'] as const) {
      expect(new Set(ROBOTS.map((r) => r[key])).size, key).toBe(ROBOTS.length);
    }
    expect(new Set(ROBOTS.map((r) => r.look.prop)).size).toBe(ROBOTS.length);
    for (const r of ROBOTS) {
      expect(r.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(r.look.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(DANCES).toContain(r.dance);
      expect(TIMBRES).toContain(r.timbre);
    }
  });

  it('does not make two robots look alike: head, antenna, eyes, belly and ears are not all the same', () => {
    const faces = ROBOTS.map((r) => [r.look.head, r.look.antenna, r.look.eyes, r.look.belly, r.look.ears].join('/'));
    expect(new Set(faces).size).toBe(ROBOTS.length);
  });

  it('covers every group of instruments and every dance', () => {
    expect(new Set(ROBOTS.map((r) => r.group))).toEqual(new Set(['gõ', 'gảy', 'thổi', 'kéo', 'phím']));
    expect(new Set(ROBOTS.map((r) => r.dance)).size).toBeGreaterThanOrEqual(8);
  });

  it('parses a pattern for every robot, song feel and level', () => {
    for (const r of ROBOTS) {
      for (const style of DRUM_STYLES) {
        for (const level of LEVELS) {
          const bars = barsOf(r.id, style, level);
          expect([1, 2, 4]).toContain(bars.length);
          expect(bars.flat().length, `${r.id} ${style} L${level} is silent`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('each level is at least as busy as the one before, and the busy one is clearly busier than the easy one', () => {
    for (const r of ROBOTS) {
      for (const style of DRUM_STYLES) {
        const busy = LEVELS.map((l) => onsets(r.id, style, l));
        expect(busy[1], `${r.id} ${style}`).toBeGreaterThanOrEqual(busy[0]!);
        expect(busy[2], `${r.id} ${style}`).toBeGreaterThanOrEqual(busy[1]!);
        expect(busy[2], `${r.id} ${style} L3 vs L1`).toBeGreaterThan(busy[0]!);
        // "dễ – vừa – rộn" must be felt: at least a third more onsets from easy to busy.
        expect(busy[2]!, `${r.id} ${style} L3 vs L1 ratio`).toBeGreaterThanOrEqual(Math.ceil(busy[0]! * 1.3));
      }
    }
  });
});

describe('every robot always plays in tune', () => {
  it('every note of every pattern belongs to its bar: the chord or the key pentatonic', () => {
    let tonal = 0;
    for (const { id, song, bar, hit } of allHits()) {
      if (!hit.p) continue;
      tonal++;
      const midi = pitchOf(song, bar, hit.p);
      const safe = safePcs(song, bar);
      expect(safe.has(((midi % 12) + 12) % 12), `${id} in ${song.id} bar ${bar}: midi ${midi}`).toBe(true);
    }
    expect(tonal).toBeGreaterThan(2500);
  });

  it('notes that are held (4+ steps) are chord tones (with their colour tone), so nothing clashes while it rings', () => {
    for (const { id, song, bar, hit } of allHits()) {
      if (!hit.p || hit.d < 4) continue;
      const midi = pitchOf(song, bar, hit.p);
      const chord = new Set(chordTones(song.chords[bar]!));
      expect(chord.has(((midi % 12) + 12) % 12), `${id} holds a non-chord note in ${song.id} bar ${bar}`).toBe(true);
    }
  });

  it('every hit lands inside the bar and every note fits its length', () => {
    for (const { id, hit } of allHits()) {
      expect(hit.s, id).toBeGreaterThanOrEqual(0);
      expect(hit.s, id).toBeLessThan(STEPS_PER_BAR);
      expect(hit.d, id).toBeGreaterThan(0);
      if (hit.p) expect(hit.s + hit.d, `${id} runs past the bar line`).toBeLessThanOrEqual(STEPS_PER_BAR + 0.0001);
      if (hit.drum) expect(DRUMS).toContain(hit.drum);
    }
  });

  it('keeps every note in a register a phone speaker and a small ear can use', () => {
    for (const { id, song, bar, hit } of allHits()) {
      if (!hit.p) continue;
      const midi = pitchOf(song, bar, hit.p);
      const robot = findRobot(id)!;
      expect(midi, `${id} too low`).toBeGreaterThanOrEqual(40);
      expect(midi, `${id} too high`).toBeLessThanOrEqual(robot.role === 'bass' ? 63 : 91);
    }
  });

  it('drum robots play only drums and the others only notes', () => {
    for (const r of ROBOTS) {
      const hits = DRUM_STYLES.flatMap((st) => LEVELS.flatMap((l) => barsOf(r.id, st, l).flat()));
      const drums = hits.filter((h) => h.drum).length;
      if (r.role === 'beat') expect(drums, r.id).toBe(hits.length);
      else if (r.role !== 'color') expect(drums, r.id).toBe(0);
    }
  });

  it('there is a song-specific feel: the kick plays four on the floor in the disco', () => {
    const disco = STYLE_OF.get('disco')!;
    const bars = barsOf('kick', disco.style, 2);
    expect(bars[0]!.map((h) => h.s)).toEqual([0, 4, 8, 12]);
    const pop = barsOf('kick', 'pop', 2);
    expect(pop[0]!.map((h) => h.s)).not.toEqual([0, 4, 8, 12]);
  });
});

const SONG_OF = (style: string): Song => SONGS.find((x) => x.style === style)!;
const volOf = (id: string, song: Song): number => {
  const vol = playerFor(findRobot(id)!).vol;
  return typeof vol === 'function' ? vol(song.id) : (vol ?? 1);
};

describe('the music is rich', () => {
  const tonalRobots = ROBOTS.filter((r) => ['bass', 'chord', 'melody'].includes(r.role) || r.id === 'bell');

  it('every tonal robot has a voice for every song, each a real synth timbre or world instrument', () => {
    for (const r of tonalRobots) {
      for (const song of SONGS) {
        const v = playerFor(r).voice!(song.id);
        expect(isInstrument(v) ? INSTRUMENT_IDS.includes(v) : TIMBRES.includes(v), `${r.id} in ${song.id}: ${v}`).toBe(true);
      }
    }
  });

  it('the same robot changes instrument from song to song (three or more voices for almost every one)', () => {
    let varied = 0;
    for (const r of tonalRobots) {
      const voices = new Set(SONGS.map((s) => playerFor(r).voice!(s.id)));
      expect(voices.size, r.id).toBeGreaterThanOrEqual(2);
      if (voices.size >= 3) varied++;
    }
    expect(varied).toBeGreaterThanOrEqual(6);
  });

  it('uses a wide palette of the world instruments', () => {
    const used = new Set<string>();
    for (const r of ROBOTS) {
      const p = playerFor(r);
      for (const song of SONGS) {
        if (r.role !== 'beat') used.add(p.voice!(song.id));
        for (const k of DRUMS) {
          const w = p.perc?.(song.id, k);
          if (w) used.add(w);
        }
      }
    }
    const world = [...used].filter((v) => INSTRUMENT_IDS.includes(v as never));
    expect(world.length).toBeGreaterThanOrEqual(14);
  });

  it('no two tonal robots play the same instrument in the same song', () => {
    for (const song of SONGS) {
      const seen = new Map<string, string>();
      for (const r of tonalRobots) {
        const v = playerFor(r).voice!(song.id);
        const other = seen.get(v);
        expect(other, `${song.id}: ${r.id} and ${other} both play ${v}`).toBeUndefined();
        seen.set(v, r.id);
      }
    }
  });

  it('drum stand-ins are real instruments for real drums', () => {
    for (const r of ROBOTS) {
      for (const song of SONGS) {
        for (const [kind, id] of Object.entries(r.perc?.[song.id] ?? {})) {
          expect(DRUMS).toContain(kind);
          expect(INSTRUMENT_IDS).toContain(id);
        }
      }
    }
  });

  it('the five songs have five different grooves: the same robot plays different parts in (almost) each', () => {
    for (const r of ROBOTS) {
      const fingerprints = new Set(DRUM_STYLES.map((st) => JSON.stringify(barsOf(r.id, st, 2))));
      expect(fingerprints.size, `${r.id} should not play the same part in every song`).toBeGreaterThanOrEqual(4);
    }
  });

  it('melodies have shape: the four bars are not one bar repeated, at the medium and busy levels', () => {
    const flat: string[] = [];
    for (const r of ROBOTS.filter((x) => x.role === 'melody')) {
      for (const style of DRUM_STYLES) {
        for (const level of [2, 3] as const) {
          const distinct = new Set(barsOf(r.id, style, level).map((b) => JSON.stringify(b)));
          if (distinct.size < 2) flat.push(`${r.id} ${style} L${level}`);
        }
      }
    }
    expect(flat).toEqual([]);
    // The lead tune is a real four-bar phrase in every song: call, answer, call again, new ending.
    for (const style of DRUM_STYLES) {
      for (const level of [2, 3] as const) {
        const distinct = new Set(barsOf('xylo', style, level).map((b) => JSON.stringify(b)));
        expect(distinct.size, `xylo ${style} L${level}`).toBe(4);
      }
    }
  });

  it('plays with dynamics: strong and weak beats differ, and there are soft ghost notes in the busy parts', () => {
    for (const r of ROBOTS) {
      for (const style of DRUM_STYLES) {
        const hits = barsOf(r.id, style, 3).flat();
        const vs = new Set(hits.map((h) => h.v ?? DEFAULT_VEL));
        if (hits.length >= 8) expect(vs.size, `${r.id} ${style} L3 has a single volume`).toBeGreaterThanOrEqual(2);
      }
    }
    const ghosts = ['snare', 'kick', 'guitar'].flatMap((id) => DRUM_STYLES.flatMap((st) => barsOf(id, st, 3).flat())).filter((h) => (h.v ?? 1) <= 0.34);
    expect(ghosts.length).toBeGreaterThan(10);
  });

  it('drums have a groove and a fill: the last bar of the busy kit differs from the first', () => {
    for (const id of ['kick', 'snare', 'tom']) {
      for (const style of DRUM_STYLES) {
        const bars = barsOf(id, style, 3);
        if (bars.length < 4) continue;
        expect(JSON.stringify(bars[3]), `${id} ${style} has no fill`).not.toBe(JSON.stringify(bars[0]));
      }
    }
    // The snare rolls into the next lap in every feel.
    for (const style of DRUM_STYLES) {
      const last = barsOf('snare', style, 3)[3]!;
      expect(last.filter((h) => h.s >= 12).length, `snare ${style}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('a crash marks the top of the loop, and the bass line moves to the next chord in the last bar', () => {
    for (const style of DRUM_STYLES) {
      const crash = barsOf('tom', style, 2)[0]!.filter((h) => h.drum === 'crash');
      expect(crash.length, `tom ${style}`).toBe(1);
      expect(crash[0]!.s).toBe(0);
    }
    for (const style of DRUM_STYLES) {
      const bars = barsOf('bass', style, 3);
      expect(JSON.stringify(bars[3]), `bass ${style}`).not.toBe(JSON.stringify(bars[0]));
    }
  });

  it('bass lines use more than the root: fifth, third, octave or seventh', () => {
    for (const style of DRUM_STYLES) {
      const used = new Set(barsOf('bass', style, 3).flat().map((h) => (h.p as { n: number }).n));
      expect(used.size, `bass ${style}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('no robot plays more than four notes at once, and none is a wall of sound', () => {
    for (const r of ROBOTS) {
      for (const style of DRUM_STYLES) {
        for (const level of LEVELS) {
          for (const bar of barsOf(r.id, style, level)) {
            const perStep = new Map<number, number>();
            for (const h of bar) perStep.set(h.s, (perStep.get(h.s) ?? 0) + 1);
            for (const [step, n] of perStep) expect(n, `${r.id} ${style} L${level} step ${step}`).toBeLessThanOrEqual(4);
            expect(bar.length, `${r.id} ${style} L${level}`).toBeLessThanOrEqual(36);
          }
        }
      }
    }
  });

  it('a full stage of eight busy robots stays under a note budget (CPU) and a loudness budget (no clipping)', () => {
    for (const song of SONGS) {
      // The eight busiest robots at the busiest level: the worst case a child can build.
      const loads = ROBOTS.map((r) => {
        const bars = barsOf(r.id, song.style, 3);
        let notes = 0;
        for (let bar = 0; bar < BARS; bar++) notes += (bars[bar % bars.length] ?? []).length;
        return { id: r.id, notes };
      }).sort((a, b) => b.notes - a.notes);
      const worst = loads.slice(0, 8);
      const total = worst.reduce((t, x) => t + x.notes, 0);
      const secs = (BARS * STEPS_PER_BAR * stepMs(song)) / 1000;
      expect(total / secs, `${song.id} notes per second`).toBeLessThanOrEqual(75);

      // Loudness: velocity × the robot's level, summed over what sounds in the same step.
      let peak = 0;
      for (let bar = 0; bar < BARS; bar++) {
        for (let step = 0; step < STEPS_PER_BAR; step++) {
          let e = 0;
          for (const { id } of worst) {
            const bars = barsOf(id, song.style, 3);
            for (const h of bars[bar % bars.length] ?? []) if (h.s === step) e += (h.v ?? DEFAULT_VEL) * volOf(id, song);
          }
          peak = Math.max(peak, e);
        }
      }
      expect(peak, `${song.id} peak step energy`).toBeLessThanOrEqual(8);
    }
  });

  it('each feel sounds like itself: the latin kick leaves the beat, the east kit is gentle', () => {
    const latin = barsOf('kick', SONG_OF('latin').style, 2)[0]!.map((h) => h.s);
    expect(latin.some((s) => s % 4 !== 0)).toBe(true);
    const east = barsOf('kick', SONG_OF('east').style, 3).flat();
    expect(east.every((h) => (h.v ?? 1) <= 0.9)).toBe(true);
  });
});

describe('playerFor', () => {
  it('hands the groove the robot voice and its patterns', () => {
    const p = playerFor(findRobot('guitar')!);
    expect(p.timbre).toBe('guitar');
    expect(p.voice!('fun')).toBe('ukulele');
    expect(p.voice!('calm')).toBe('harp');
    expect(p.bars('pop', 1)).toBe(barsOf('guitar', 'pop', 1));
  });
});
