import { describe, it, expect } from 'vitest';
import { noteFreq } from '../../core/music';
import {
  BLOW_THRESHOLD,
  FLAVORS,
  HAPPY_BIRTHDAY,
  HAPPY_BIRTHDAY_BPM,
  MAX_CANDLES,
  TOPPINGS,
  blowStrength,
  candleWord,
  nextPhase,
  type Phase,
  type PhaseEvent,
} from './logic';

describe('birthday content', () => {
  it('has 5 distinct flavours with colours and 8 distinct toppings', () => {
    expect(FLAVORS.length).toBe(5);
    expect(new Set(FLAVORS.map((f) => f.id)).size).toBe(5);
    expect(new Set(FLAVORS.map((f) => f.name)).size).toBe(5);
    for (const f of FLAVORS) {
      expect(f.cake).toMatch(/^#[0-9a-f]{6}$/i);
      expect(f.icing).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(TOPPINGS.length).toBe(8);
    expect(new Set(TOPPINGS.map((t) => t.emoji)).size).toBe(8);
    expect(new Set(TOPPINGS.map((t) => t.name)).size).toBe(8);
    expect(MAX_CANDLES).toBe(6);
  });

  it('melody notes all have a frequency, positive durations, and end on F4', () => {
    expect(HAPPY_BIRTHDAY.length).toBe(25);
    expect(HAPPY_BIRTHDAY_BPM).toBe(120);
    for (const n of HAPPY_BIRTHDAY) {
      expect(noteFreq(n.n)).toBeGreaterThan(0);
      expect(n.d).toBeGreaterThan(0);
    }
    expect(HAPPY_BIRTHDAY[0]).toEqual({ n: 'C4', d: 0.75 });
    expect(HAPPY_BIRTHDAY[HAPPY_BIRTHDAY.length - 1]).toEqual({ n: 'F4', d: 2 });
    // 3/4 with a one-beat pickup: three phrases of six beats, the "dear …" phrase has seven.
    expect(HAPPY_BIRTHDAY.reduce((s, n) => s + n.d, 0)).toBe(25);
  });
});

describe('birthday nextPhase', () => {
  it('walks decorate → light → blow → done → decorate', () => {
    expect(nextPhase('decorate', 'lightAll')).toBe('light');
    expect(nextPhase('light', 'allLit')).toBe('blow');
    expect(nextPhase('blow', 'allOut')).toBe('done');
    expect(nextPhase('done', 'again')).toBe('decorate');
  });
  it('ignores events that do not apply to the phase', () => {
    const phases: Phase[] = ['decorate', 'light', 'blow', 'done'];
    const events: PhaseEvent[] = ['lightAll', 'allLit', 'allOut', 'again'];
    const ok: Record<Phase, PhaseEvent> = { decorate: 'lightAll', light: 'allLit', blow: 'allOut', done: 'again' };
    for (const p of phases) {
      for (const e of events) {
        if (e === ok[p]) continue;
        expect(nextPhase(p, e)).toBe(p);
      }
    }
  });
});

describe('birthday blowStrength', () => {
  it('is 0 for silence and for an empty buffer', () => {
    expect(blowStrength(new Uint8Array(512).fill(128))).toBe(0);
    expect(blowStrength(new Uint8Array(0))).toBe(0);
  });
  it('is about 1 for a full-scale square wave', () => {
    const loud = new Uint8Array(512);
    for (let i = 0; i < loud.length; i++) loud[i] = i % 2 ? 255 : 0;
    const s = blowStrength(loud);
    expect(s).toBeGreaterThan(0.9);
    expect(s).toBeLessThanOrEqual(1);
  });
  it('stays under the threshold for a soft wave', () => {
    const soft = new Uint8Array(512);
    for (let i = 0; i < soft.length; i++) soft[i] = 128 + Math.round(6 * Math.sin((i / soft.length) * Math.PI * 8));
    expect(blowStrength(soft)).toBeLessThan(BLOW_THRESHOLD);
    expect(blowStrength(soft)).toBeGreaterThan(0);
    expect(BLOW_THRESHOLD).toBe(0.12);
  });
});

describe('birthday candleWord', () => {
  it('counts in Vietnamese and falls back to digits', () => {
    expect(candleWord(1)).toBe('một');
    expect(candleWord(3)).toBe('ba');
    expect(candleWord(6)).toBe('sáu');
    expect(candleWord(42)).toBe('42');
  });
});
