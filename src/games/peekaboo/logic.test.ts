import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VOICE,
  FIND_AFTER,
  HIDERS,
  REVEAL_MS,
  STAR_EVERY,
  SURPRISES,
  makeSpots,
  nextAnimal,
  pickAnimals,
  pickTarget,
  rollSurprise,
  voiceOf,
} from './logic';
import { ANIMALS } from '../../core/content';
import { FX } from '../../core/audio';
import { mulberry32 } from '../../core/dom';

describe('peekaboo logic', () => {
  it('makes 4 spots with distinct hiders and distinct animals', () => {
    const spots = makeSpots(4, mulberry32(5));
    expect(spots.length).toBe(4);
    expect(new Set(spots.map((s) => s.hider.emoji)).size).toBe(4);
    expect(new Set(spots.map((s) => s.item.emoji)).size).toBe(4);
    for (const s of spots) {
      expect(HIDERS).toContain(s.hider);
      expect(ANIMALS).toContain(s.item);
    }
  });
  it('gives every hider a way of opening', () => {
    expect(HIDERS.length).toBe(8);
    for (const hider of HIDERS) {
      expect(['lift', 'pop', 'swing', 'slide', 'lean', 'tip']).toContain(hider.open);
    }
  });
  it('throws when asking for more spots than hiders', () => {
    expect(() => makeSpots(HIDERS.length + 1)).toThrow();
  });
  it('nextAnimal never returns the current animal', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = mulberry32(seed);
      const current = ANIMALS[seed % ANIMALS.length]!;
      const next = nextAnimal(current, rng);
      expect(next.emoji).not.toBe(current.emoji);
      expect(ANIMALS).toContain(next);
    }
  });
  it('gives every animal a voice the synth can actually play', () => {
    for (const animal of ANIMALS) expect(FX).toContain(voiceOf(animal));
    expect(voiceOf({ emoji: '🐱', name: 'con mèo' })).toBe('meow');
    expect(voiceOf({ emoji: '🦒', name: 'hươu cao cổ' })).toBe(DEFAULT_VOICE);
  });
  it('picks a target that is really one of the hidden animals', () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = mulberry32(seed);
      const items = pickAnimals(4, rng);
      expect(items).toContain(pickTarget(items, rng));
    }
  });
  it('rolls a surprise only now and then, and always a known one', () => {
    expect(rollSurprise(() => 0.9)).toBeNull();
    const sure = rollSurprise(() => 0.01);
    expect(sure).not.toBeNull();
    expect(SURPRISES).toContain(sure);
    let hits = 0;
    const rng = mulberry32(3);
    for (let i = 0; i < 400; i++) if (rollSurprise(rng)) hits++;
    expect(hits).toBeGreaterThan(20);
    expect(hits).toBeLessThan(160);
  });
  it('exposes tuning constants', () => {
    expect(STAR_EVERY).toBe(6);
    expect(REVEAL_MS).toBe(1600);
    expect(FIND_AFTER).toBeLessThan(STAR_EVERY);
  });
});
