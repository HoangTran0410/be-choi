import { describe, it, expect } from 'vitest';
import { DRUMS, TIMBRES } from '../../core/audio';
import { DANCES } from './dance';
import { BARS, LEVELS, SONGS, STEPS_PER_BAR, chordPcs, pitchOf, safePcs, type Hit } from './groove';
import { ROBOTS, STARTERS, barsOf, findRobot, playerFor } from './robots';

const STYLE_OF = new Map(SONGS.map((s) => [s.style, s]));

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
      for (const style of ['pop', 'disco', 'soft'] as const) {
        for (const level of LEVELS) {
          const bars = barsOf(r.id, style, level);
          expect([1, 2, 4]).toContain(bars.length);
          expect(bars.flat().length, `${r.id} ${style} L${level} is silent`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('each level is at least as busy as the one before', () => {
    for (const r of ROBOTS) {
      for (const style of ['pop', 'disco', 'soft'] as const) {
        const busy = LEVELS.map((l) => {
          const bars = barsOf(r.id, style, l);
          let n = 0;
          for (let bar = 0; bar < BARS; bar++) n += (bars[bar % bars.length] ?? []).length;
          return n;
        });
        expect(busy[1], `${r.id} ${style}`).toBeGreaterThanOrEqual(busy[0]!);
        expect(busy[2], `${r.id} ${style}`).toBeGreaterThanOrEqual(busy[1]!);
        expect(busy[2], `${r.id} ${style} L3 vs L1`).toBeGreaterThan(busy[0]!);
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
    expect(tonal).toBeGreaterThan(500);
  });

  it('notes that are held (4+ steps) are chord tones, so nothing clashes while it rings', () => {
    for (const { id, song, bar, hit } of allHits()) {
      if (!hit.p || hit.d < 4) continue;
      const midi = pitchOf(song, bar, hit.p);
      const chord = new Set(chordPcs(song.chords[bar]!));
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
      const hits = LEVELS.flatMap((l) => barsOf(r.id, 'pop', l).flat());
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

describe('playerFor', () => {
  it('hands the groove the robot voice and its patterns', () => {
    const p = playerFor(findRobot('guitar')!);
    expect(p.timbre).toBe('guitar');
    expect(p.bars('pop', 1)).toBe(barsOf('guitar', 'pop', 1));
  });
});
