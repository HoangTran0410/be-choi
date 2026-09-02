import { describe, it, expect } from 'vitest';
import { ANIMALS } from '../../core/content';
import { mulberry32 } from '../../core/dom';
import {
  allClean,
  dirtyCount,
  makeMouth,
  MAX_DIRTY,
  MIN_DIRTY,
  nextPhase,
  SCRUBS_TO_CLEAN,
  scrub,
  STAINS,
  TEETH_PER_ROW,
  type Phase,
  type PhaseEvent,
  type Tooth,
} from './logic';

describe('teeth makeMouth', () => {
  it('builds two rows of four teeth in id order with a stain per tooth', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const m = makeMouth(0, mulberry32(seed));
      expect(m.teeth.length).toBe(TEETH_PER_ROW * 2);
      expect(m.stains.length).toBe(TEETH_PER_ROW * 2);
      m.teeth.forEach((t, i) => {
        expect(t.id).toBe(i);
        expect(t.row).toBe(i < TEETH_PER_ROW ? 'top' : 'bottom');
        expect(t.col).toBe(i % TEETH_PER_ROW);
        expect(t.scrubs).toBe(0);
      });
      for (const s of m.stains) expect(STAINS).toContain(s);
      expect(ANIMALS.some((a) => a.emoji === m.character.emoji)).toBe(true);
    }
  });

  it('stains min(3 + round, 6) teeth', () => {
    expect(MIN_DIRTY).toBe(3);
    expect(MAX_DIRTY).toBe(6);
    expect([0, 1, 2, 3, 4, 9].map(dirtyCount)).toEqual([3, 4, 5, 6, 6, 6]);
    expect(dirtyCount(-2)).toBe(3);
    for (let round = 0; round <= 6; round++) {
      for (let seed = 1; seed <= 20; seed++) {
        const m = makeMouth(round, mulberry32(seed));
        expect(m.teeth.filter((t) => t.dirty).length).toBe(dirtyCount(round));
      }
    }
  });

  it('spreads the dirt around rather than always the same teeth', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      for (const t of makeMouth(0, mulberry32(seed)).teeth) if (t.dirty) seen.add(t.id);
    }
    expect(seen.size).toBe(TEETH_PER_ROW * 2);
  });

  it('never picks the excluded character and is deterministic for a seed', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(makeMouth(0, mulberry32(seed), '🐶').character.emoji).not.toBe('🐶');
      expect(makeMouth(2, mulberry32(seed), '🐱').character.emoji).not.toBe('🐱');
    }
    expect(makeMouth(1, mulberry32(7))).toEqual(makeMouth(1, mulberry32(7)));
  });
});

describe('teeth scrub', () => {
  const dirtyTooth = (): Tooth[] => [
    { id: 0, row: 'top', col: 0, dirty: true, scrubs: 0 },
    { id: 1, row: 'top', col: 1, dirty: false, scrubs: 0 },
  ];

  it('counts strokes and cleans exactly at SCRUBS_TO_CLEAN', () => {
    let teeth = dirtyTooth();
    const original = teeth;
    for (let n = 1; n < SCRUBS_TO_CLEAN; n++) {
      const r = scrub(teeth, 0);
      teeth = r.teeth;
      expect(r.cleaned).toBe(false);
      expect(teeth[0]?.scrubs).toBe(n);
      expect(teeth[0]?.dirty).toBe(true);
    }
    const last = scrub(teeth, 0);
    expect(last.cleaned).toBe(true);
    expect(last.teeth[0]?.scrubs).toBe(SCRUBS_TO_CLEAN);
    expect(last.teeth[0]?.dirty).toBe(false);
    // The input was never mutated.
    expect(original[0]?.scrubs).toBe(0);
    expect(original[0]?.dirty).toBe(true);
    // Another stroke on the now-clean tooth is a no-op and never "cleans" again.
    const again = scrub(last.teeth, 0);
    expect(again.cleaned).toBe(false);
    expect(again.teeth).toBe(last.teeth);
  });

  it('ignores clean and unknown teeth', () => {
    const teeth = dirtyTooth();
    expect(scrub(teeth, 1)).toEqual({ teeth, cleaned: false });
    expect(scrub(teeth, 1).teeth).toBe(teeth);
    expect(scrub(teeth, 42).teeth).toBe(teeth);
    expect(scrub([], 0)).toEqual({ teeth: [], cleaned: false });
  });
});

describe('teeth allClean', () => {
  it('is true only when no tooth is dirty', () => {
    expect(allClean([])).toBe(true);
    expect(allClean([{ id: 0, row: 'top', col: 0, dirty: false, scrubs: 6 }])).toBe(true);
    expect(
      allClean([
        { id: 0, row: 'top', col: 0, dirty: false, scrubs: 6 },
        { id: 4, row: 'bottom', col: 0, dirty: true, scrubs: 2 },
      ]),
    ).toBe(false);
    const m = makeMouth(3, mulberry32(3));
    expect(allClean(m.teeth)).toBe(false);
    let teeth = m.teeth;
    for (const t of m.teeth) {
      if (!t.dirty) continue;
      for (let n = 0; n < SCRUBS_TO_CLEAN; n++) teeth = scrub(teeth, t.id).teeth;
    }
    expect(allClean(teeth)).toBe(true);
  });
});

describe('teeth nextPhase', () => {
  it('follows the paste → brush → rinse → done → paste table and stays put otherwise', () => {
    const phases: Phase[] = ['paste', 'brush', 'rinse', 'done'];
    const events: PhaseEvent[] = ['paste', 'clean', 'rinse', 'again'];
    const expected: Record<Phase, Partial<Record<PhaseEvent, Phase>>> = {
      paste: { paste: 'brush' },
      brush: { clean: 'rinse' },
      rinse: { rinse: 'done' },
      done: { again: 'paste' },
    };
    for (const p of phases) {
      for (const e of events) expect(nextPhase(p, e)).toBe(expected[p][e] ?? p);
    }
  });
});
