import { describe, it, expect } from 'vitest';
import { DRUMS, TIMBRES } from '../../core/audio';
import { noteFreq } from '../../core/music';
import {
  GROOVES,
  PARTS,
  SILENT_BARS,
  STAR_AFTER_MS,
  STAR_MIN_ACTIVE,
  STEPS,
  isDrumKind,
  noteSeconds,
  patternFor,
  stepEvents,
  stepMs,
  transpose,
  type Part,
} from './logic';

function part(id: string): Part {
  const found = PARTS.find((p) => p.id === id);
  if (!found) throw new Error(`missing part ${id}`);
  return found;
}

/** Every bar a part can play (its default pattern plus any per-bar variants). */
function allBars(p: Part): readonly (readonly (string | null)[])[] {
  return [p.pattern, ...(p.bars ?? [])];
}

describe('orchestra logic', () => {
  it('has 6 parts with 16-step patterns and distinct ids, emojis, names and colours', () => {
    expect(STEPS).toBe(16);
    expect(PARTS.length).toBe(6);
    expect(new Set(PARTS.map((p) => p.id)).size).toBe(6);
    expect(new Set(PARTS.map((p) => p.emoji)).size).toBe(6);
    expect(new Set(PARTS.map((p) => p.name)).size).toBe(6);
    expect(new Set(PARTS.map((p) => p.color)).size).toBe(6);
    for (const p of PARTS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      for (const b of allBars(p)) expect(b.length).toBe(STEPS);
      // Nobody loops pure silence.
      expect(p.pattern.some((v) => v !== null)).toBe(true);
    }
  });

  it('drum steps are DrumKinds; note steps parse with noteFreq after splitting on +', () => {
    for (const p of PARTS) {
      for (const b of allBars(p)) {
        for (const v of b) {
          if (v === null) continue;
          if (p.kind === 'drum') {
            expect(DRUMS).toContain(v);
            expect(isDrumKind(v)).toBe(true);
          } else {
            for (const n of v.split('+')) expect(noteFreq(n)).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(isDrumKind('C4')).toBe(false);
  });

  it('note parts have a synth timbre and a hold; drum parts have neither', () => {
    for (const p of PARTS) {
      if (p.kind === 'note') {
        expect(TIMBRES).toContain(p.timbre);
        expect(p.hold).toBeGreaterThan(0);
      } else {
        expect(p.timbre).toBeUndefined();
        expect(p.hold).toBeUndefined();
      }
    }
    expect(part('frog').timbre).toBe('guitar');
    expect(part('cat').timbre).toBe('piano');
    expect(part('rabbit').timbre).toBe('xylo');
    expect(part('bird').timbre).toBe('bell');
  });

  it('the bear keeps a kick / snare / hat beat; the monkey shakes off-beats and claps on 6 and 14', () => {
    const bear = part('bear').pattern;
    expect(bear[0]).toBe('kick');
    expect(bear[8]).toBe('kick');
    expect(bear[4]).toBe('snare');
    expect(bear[12]).toBe('snare');
    expect(bear.filter((v) => v === 'hat').length).toBeGreaterThanOrEqual(4);
    const monkey = part('monkey').pattern;
    for (let s = 1; s < STEPS; s += 2) expect(monkey[s]).toBe('hat');
    expect(monkey[6]).toBe('clap');
    expect(monkey[14]).toBe('clap');
  });

  it('the cat cycles four chords, one per bar, on steps 0 and 8', () => {
    const cat = part('cat');
    expect(cat.bars?.length).toBe(4);
    const seen = new Set<string>();
    for (let bar = 0; bar < 8; bar++) {
      const pat = patternFor(cat, bar);
      const chord = pat[0];
      expect(chord).toBeTruthy();
      expect(pat[8]).toBe(chord);
      expect(chord!.split('+').length).toBe(3);
      seen.add(chord!);
      for (let s = 0; s < STEPS; s++) if (s !== 0 && s !== 8) expect(pat[s]).toBeNull();
    }
    expect(seen.size).toBe(4);
    expect(patternFor(cat, 4)).toBe(patternFor(cat, 0));
    expect(patternFor(cat, -1)).toBe(patternFor(cat, 3));
    // Parts without variants always play their pattern.
    expect(patternFor(part('bear'), 7)).toBe(part('bear').pattern);
  });

  it('the rabbit plays a pentatonic melody in eighth notes; the bird rings a sparse C-E-G arpeggio', () => {
    const rabbit = part('rabbit');
    for (const b of allBars(rabbit)) {
      for (let s = 0; s < STEPS; s++) {
        const v = b[s];
        if (s % 2 === 1) expect(v).toBeNull();
        if (v) expect(['C', 'D', 'E', 'G', 'A']).toContain(v[0]);
      }
    }
    const bird = part('bird').pattern;
    const hits = bird.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(hits).toEqual([0, 3, 6, 9, 12, 15]);
    for (const v of bird) if (v) expect(['C5', 'E5', 'G5']).toContain(v);
  });

  it('transpose shifts note names and always writes sharps', () => {
    expect(transpose('C4', 2)).toBe('D4');
    expect(transpose('B4', 1)).toBe('C5');
    expect(transpose('C4', -1)).toBe('B3');
    expect(transpose('C4', 0)).toBe('C4');
    expect(transpose('E4', 1)).toBe('F4');
    expect(transpose('C4', 1)).toBe('C#4');
    expect(transpose('Bb3', 1)).toBe('B3');
    expect(transpose('Bb3', 0)).toBe('A#3');
    expect(transpose('F#4', -1)).toBe('F4');
    expect(transpose('G2', -3)).toBe('E2');
    expect(transpose('A4', 12)).toBe('A5');
    expect(transpose('C4+E4+G4', 2)).toBe('D4+F#4+A4');
    expect(transpose('R', 3)).toBe('R');
    expect(transpose('', 3)).toBe('');
    expect(transpose('kick', 3)).toBe('kick');
    expect(transpose('H4', 3)).toBe('H4');
    // Out of range stays put rather than producing a bad name.
    expect(transpose('C0', -1)).toBe('C0');
    expect(transpose('B9', 1)).toBe('B9');
    // Every transposed groove note is still a valid note.
    for (const g of GROOVES) {
      for (const p of PARTS) {
        if (p.kind !== 'note') continue;
        for (const b of allBars(p)) {
          for (const v of b) {
            if (!v) continue;
            for (const n of transpose(v, g.semitones).split('+')) expect(noteFreq(n)).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('stepEvents only returns the active parts, wraps the step and follows the bar', () => {
    expect(stepEvents(new Set(), 0, 0)).toEqual([]);
    const bear = stepEvents(new Set(['bear']), 0, 0);
    expect(bear.map((e) => e.value)).toEqual(['kick']);
    expect(bear[0]?.part.id).toBe('bear');
    expect(stepEvents(new Set(['bear']), 4, 0).map((e) => e.value)).toEqual(['snare']);
    expect(stepEvents(new Set(['bear']), 1, 0)).toEqual([]);
    expect(stepEvents(new Set(['bear']), 16, 0).map((e) => e.value)).toEqual(['kick']);
    expect(stepEvents(new Set(['bear']), -4, 0).map((e) => e.value)).toEqual(['snare']);

    const all = new Set(PARTS.map((p) => p.id));
    const step0 = stepEvents(all, 0, 0);
    expect(step0.map((e) => e.part.id)).toEqual(['bear', 'frog', 'cat', 'rabbit', 'bird']);
    expect(step0.find((e) => e.part.id === 'cat')?.value).toBe('C4+E4+G4');
    expect(stepEvents(all, 0, 1).find((e) => e.part.id === 'cat')?.value).toBe('A3+C4+E4');
    expect(stepEvents(new Set(['monkey']), 0, 0)).toEqual([]);
    expect(stepEvents(new Set(['monkey']), 6, 0).map((e) => e.value)).toEqual(['clap']);

    // Unknown ids are ignored; a custom part list is honoured.
    expect(stepEvents(new Set(['dragon']), 0, 0)).toEqual([]);
    const custom: Part[] = [{ id: 'x', emoji: '🦊', name: 'x', kind: 'drum', color: '#000000', pattern: ['tom', ...Array(15).fill(null)] }];
    expect(stepEvents(new Set(['x']), 0, 0, custom).map((e) => e.value)).toEqual(['tom']);
    expect(stepEvents(new Set(['bear']), 0, 0, custom)).toEqual([]);
  });

  it('stepMs is a sixteenth note; noteSeconds follows the part hold', () => {
    expect(stepMs(120)).toBe(125);
    expect(stepMs(60)).toBe(250);
    expect(noteSeconds(part('rabbit'), 120)).toBeCloseTo(0.25, 6);
    expect(noteSeconds(part('bird'), 120)).toBeCloseTo(0.25, 6);
    expect(noteSeconds(part('frog'), 120)).toBeCloseTo(0.375, 6);
    expect(noteSeconds(part('cat'), 120)).toBeCloseTo(0.5, 6);
  });

  it('has three grooves and the star rule constants', () => {
    expect(GROOVES.length).toBe(3);
    expect(new Set(GROOVES.map((g) => g.id)).size).toBe(3);
    expect(new Set(GROOVES.map((g) => g.emoji)).size).toBe(3);
    for (const g of GROOVES) {
      expect(g.bpm).toBeGreaterThan(0);
      expect(Number.isInteger(g.semitones)).toBe(true);
    }
    expect(GROOVES.map((g) => g.bpm)).toEqual([112, 132, 88]);
    expect(GROOVES.map((g) => g.semitones)).toEqual([0, 2, -3]);
    expect(STAR_AFTER_MS).toBe(60000);
    expect(STAR_MIN_ACTIVE).toBe(3);
    expect(SILENT_BARS).toBe(8);
  });
});
