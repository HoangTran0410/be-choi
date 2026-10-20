import { describe, expect, it } from 'vitest';
import { ANIMALS, COLORS, VOICED_ANIMALS } from '../../core/content';
import { LETTERS } from '../letters/logic';
import { SHAPES } from '../shapes/logic';
import {
  COLOR_THINGS,
  LETTER_IDS,
  LETTER_WORDS,
  ONOMATOPOEIA,
  QUESTIONS_PER_STATION,
  SHAPE_IDS,
  SHAPE_THINGS,
  SORT_KINDS,
  TOPICS,
  conceptsOf,
  countAloud,
  familyReady,
  keyOf,
  peopleFrom,
} from './curriculum';

describe('curriculum data', () => {
  it('has ten stations with distinct ids', () => {
    expect(TOPICS.length).toBe(10);
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(10);
    expect(QUESTIONS_PER_STATION).toBe(5);
  });

  it('gives every letter of the alphabet three picture words that start with it, once', () => {
    expect(LETTER_IDS.length).toBe(LETTERS.length);
    expect(new Set(LETTER_IDS).size).toBe(LETTERS.length);
    for (const l of LETTERS) {
      const words = LETTER_WORDS[l.label];
      expect(words, l.label).toBeDefined();
      expect(words!.length).toBe(3);
      expect(new Set(words!.map((w) => w.name)).size).toBe(3);
      for (const w of words!) {
        expect(w.emoji.length).toBeGreaterThan(0);
        expect(w.name.length).toBeGreaterThan(0);
      }
      expect(LETTER_IDS).toContain(`L:${l.label}`);
    }
  });

  it('gives every colour and every shape three things to point at', () => {
    for (const c of COLORS) expect(COLOR_THINGS[c.id]?.length, c.id).toBe(3);
    for (const s of SHAPES) expect(SHAPE_THINGS[s.id]?.length, s.id).toBe(3);
    expect(SHAPE_IDS.length).toBe(SHAPES.length);
  });

  it('writes down the voice of every animal that has one', () => {
    for (const a of VOICED_ANIMALS) expect(ONOMATOPOEIA[a.emoji], a.name).toBeTruthy();
  });

  it('has enough in every kind of thing to sort', () => {
    expect(SORT_KINDS.length).toBeGreaterThanOrEqual(5);
    for (const k of SORT_KINDS) expect(k.things.length).toBeGreaterThanOrEqual(4);
  });

  it('lists the concepts of every topic with the right prefix and no duplicates', () => {
    const env = { people: peopleFrom([{ id: 'a', url: 'u1' }, { id: 'b', url: 'u2', name: 'Mẹ' }]) };
    for (const t of TOPICS) {
      const ids = conceptsOf(t.id, env);
      expect(ids.length, t.id).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id[1]).toBe(':');
    }
    expect(conceptsOf('shadows', env).length).toBe(ANIMALS.length);
    expect(keyOf('L:B')).toBe('B');
    expect(keyOf('A:🐱')).toBe('🐱');
  });

  it('counts aloud with commas so the voice pauses', () => {
    expect(countAloud(3)).toBe('một, hai, ba');
    expect(countAloud(1)).toBe('một');
  });
});

describe('peopleFrom', () => {
  it('groups photos of the same name (any case) into one person', () => {
    const people = peopleFrom([
      { id: '1', url: 'a', name: 'Mẹ' },
      { id: '2', url: 'b', name: ' mẹ ' },
      { id: '3', url: 'c', name: 'Ba' },
    ]);
    expect(people.length).toBe(2);
    expect(people[0]!.urls).toEqual(['a', 'b']);
    expect(people[0]!.name).toBe('Mẹ');
  });
  it('keeps every unnamed photo on its own, so old photos still work', () => {
    const people = peopleFrom([
      { id: '1', url: 'a' },
      { id: '2', url: 'b' },
    ]);
    expect(people.length).toBe(2);
    expect(people.every((q) => q.name === undefined)).toBe(true);
    expect(new Set(people.map((q) => q.key)).size).toBe(2);
  });
  it('needs two different people for the family station', () => {
    expect(familyReady({ people: [] })).toBe(false);
    expect(familyReady({ people: peopleFrom([{ id: '1', url: 'a', name: 'Mẹ' }, { id: '2', url: 'b', name: 'mẹ' }]) })).toBe(false);
    expect(familyReady({ people: peopleFrom([{ id: '1', url: 'a' }, { id: '2', url: 'b' }]) })).toBe(true);
  });
});
