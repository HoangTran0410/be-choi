import { describe, it, expect } from 'vitest';
import { ANIMALS, FRUITS, type Item } from '../../core/content';
import { mulberry32 } from '../../core/dom';
import {
  expand,
  itemsFor,
  makePatternRound,
  QUESTION,
  roundSpeech,
  SETS,
  SHAPES,
  STAR_EVERY,
  typesFor,
  visibleLength,
  type PatternRound,
} from './logic';

const emojis = (items: readonly Item[]) => items.map((i) => i.emoji);
const [A, B, C] = SHAPES as [Item, Item, Item, ...Item[]];

describe('pattern logic', () => {
  it('a star every 3 answers', () => {
    expect(STAR_EVERY).toBe(3);
  });

  it('types unlock per round', () => {
    for (const r of [0, 1, 2]) expect(typesFor(r)).toEqual(['AB']);
    for (const r of [3, 4, 5]) expect(typesFor(r)).toEqual(['AB', 'AAB', 'ABB']);
    for (const r of [6, 7, 30]) expect(typesFor(r)).toEqual(['AB', 'AAB', 'ABB', 'ABC']);
  });

  it('expands each unit until the requested length', () => {
    expect(emojis(expand('AB', [A, B], 5))).toEqual(emojis([A, B, A, B, A]));
    expect(emojis(expand('AAB', [A, B], 7))).toEqual(emojis([A, A, B, A, A, B, A]));
    expect(emojis(expand('ABB', [A, B], 7))).toEqual(emojis([A, B, B, A, B, B, A]));
    expect(emojis(expand('ABC', [A, B, C], 7))).toEqual(emojis([A, B, C, A, B, C, A]));
    expect(expand('AB', [A, B], 0)).toEqual([]);
    expect(() => expand('ABC', [A, B], 3)).toThrow();
  });

  it('rounds follow the schedule, the answer continues the sequence, choices are 3 distinct incl. the answer', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const round = seed % 9;
      const r = makePatternRound(round, mulberry32(seed));
      seen.add(r.type);
      expect(typesFor(round)).toContain(r.type);

      expect(r.items.length).toBe(itemsFor(r.type));
      expect(new Set(emojis(r.items)).size).toBe(r.items.length);

      const length = visibleLength(r.type);
      expect(r.sequence.length).toBe(length);
      expect(emojis(r.sequence)).toEqual(emojis(expand(r.type, r.items, length)));
      expect(r.answer.emoji).toBe(expand(r.type, r.items, length + 1)[length]?.emoji);

      expect(r.choices.length).toBe(3);
      expect(new Set(emojis(r.choices)).size).toBe(3);
      expect(r.choices.filter((c) => c.emoji === r.answer.emoji).length).toBe(1);

      // Everything comes from one set.
      const set = SETS.find((s) => s.some((i) => i.emoji === r.answer.emoji));
      expect(set).toBeDefined();
      for (const i of [...r.items, ...r.choices]) expect(emojis(set!)).toContain(i.emoji);
    }
    expect([...seen].sort()).toEqual(['AAB', 'AB', 'ABB', 'ABC']);
  });

  it('reads short names aloud before the question, only the question for animals', () => {
    const shapes = makeRound([A, B]);
    expect(roundSpeech(shapes)).toBe(`${[A, B, A, B, A].map((i) => i.name).join(', ')}. ${QUESTION}`);
    const fruits = makeRound([FRUITS[0]!, FRUITS[1]!]);
    expect(roundSpeech(fruits).endsWith(QUESTION)).toBe(true);
    expect(roundSpeech(fruits)).toContain(FRUITS[0]!.name);
    const animals = makeRound([ANIMALS[0]!, ANIMALS[1]!]);
    expect(roundSpeech(animals)).toBe(QUESTION);
  });
});

function makeRound(items: [Item, Item]): PatternRound {
  const full = expand('AB', items, 6);
  return { type: 'AB', items, sequence: full.slice(0, 5), answer: full[5]!, choices: [] };
}
