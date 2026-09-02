import { describe, it, expect } from 'vitest';
import { FX } from '../../core/audio';
import { VOICED_ANIMALS, voiceOf } from '../../core/content';
import { mulberry32 } from '../../core/dom';
import { CORRECT_FOR_STAR, MAX_CHOICES, MIN_CHOICES, choiceCount, makeRound, voiceFor } from './logic';

describe('the animals that can be guessed by ear', () => {
  it('all have a voice the synth knows, and there are enough of them to choose from', () => {
    expect(VOICED_ANIMALS.length).toBeGreaterThanOrEqual(MAX_CHOICES + 2);
    for (const animal of VOICED_ANIMALS) expect(FX).toContain(voiceFor(animal));
  });

  it('offers more than one animal per voice, which is why the round has to be careful', () => {
    const voices = VOICED_ANIMALS.map(voiceOf);
    expect(new Set(voices).size).toBeLessThan(voices.length);
  });
});

describe('a round', () => {
  it('grows from two cards to four and stops there', () => {
    expect(choiceCount(0)).toBe(MIN_CHOICES);
    expect(choiceCount(2)).toBe(3);
    expect(choiceCount(4)).toBe(MAX_CHOICES);
    expect(choiceCount(50)).toBe(MAX_CHOICES);
    expect(CORRECT_FOR_STAR).toBeGreaterThan(0);
  });

  it('always puts the answer on the board', () => {
    for (let round = 0; round < 8; round++) {
      const r = makeRound(round, mulberry32(round + 1));
      expect(r.choices.length).toBe(choiceCount(round));
      expect(r.choices.map((c) => c.emoji)).toContain(r.answer.emoji);
      expect(new Set(r.choices.map((c) => c.emoji)).size).toBe(r.choices.length);
    }
  });

  it('never offers two animals that sound the same', () => {
    for (let seed = 1; seed < 60; seed++) {
      const r = makeRound(9, mulberry32(seed));
      const voices = r.choices.map(voiceOf);
      expect(new Set(voices).size).toBe(voices.length);
    }
  });

  it('asks for somebody new after each answer', () => {
    for (let seed = 1; seed < 40; seed++) {
      expect(makeRound(3, mulberry32(seed), '🐶').answer.emoji).not.toBe('🐶');
    }
  });

  it('shuffles where the answer sits', () => {
    const places = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      const r = makeRound(6, mulberry32(seed));
      places.add(r.choices.findIndex((c) => c.emoji === r.answer.emoji));
    }
    expect(places.size).toBeGreaterThan(1);
  });
});
