import { ANIMALS, FRUITS, type Item } from '../../core/content';
import { pick, randInt, shuffle } from '../../core/dom';

export type PatternType = 'AB' | 'AAB' | 'ABB' | 'ABC';

/** Coloured dots and simple symbols: the easiest things to tell apart. */
export const SHAPES: readonly Item[] = [
  { emoji: '🔴', name: 'chấm đỏ' },
  { emoji: '🔵', name: 'chấm xanh' },
  { emoji: '🟢', name: 'chấm xanh lá' },
  { emoji: '🟡', name: 'chấm vàng' },
  { emoji: '⭐', name: 'ngôi sao' },
  { emoji: '❤️', name: 'trái tim' },
  { emoji: '🟣', name: 'chấm tím' },
  { emoji: '🟠', name: 'chấm cam' },
];

/** Item sets a pattern can be built from. */
export const SETS: readonly (readonly Item[])[] = [SHAPES, FRUITS, ANIMALS];

/** Correct answers between celebrations. */
export const STAR_EVERY = 3;

export const QUESTION = 'Tiếp theo là gì nhỉ?';

/** Which of the round's `items` each position of the repeating unit shows. */
const UNITS: Record<PatternType, readonly number[]> = {
  AB: [0, 1],
  AAB: [0, 0, 1],
  ABB: [0, 1, 1],
  ABC: [0, 1, 2],
};

export interface PatternRound {
  type: PatternType;
  /** Distinct items the pattern is built from: 2, or 3 for ABC. */
  items: Item[];
  /** The visible part of the pattern: 5 items for AB, 6 otherwise. */
  sequence: Item[];
  /** What comes right after `sequence`. */
  answer: Item;
  /** Three shuffled distinct items from the same set; exactly one equals `answer`. */
  choices: Item[];
}

/** Rounds 0–2 are plain AB; 3–5 add AAB and ABB; from round 6 ABC joins. */
export function typesFor(round: number): PatternType[] {
  if (round <= 2) return ['AB'];
  if (round <= 5) return ['AB', 'AAB', 'ABB'];
  return ['AB', 'AAB', 'ABB', 'ABC'];
}

/** How many distinct items `type` needs. */
export function itemsFor(type: PatternType): number {
  return type === 'ABC' ? 3 : 2;
}

/** Visible items before the missing slot: 5 for AB, 6 for the three-long units. */
export function visibleLength(type: PatternType): number {
  return type === 'AB' ? 5 : 6;
}

/** Repeat `type`'s unit over `items` until `length` elements. */
export function expand(type: PatternType, items: readonly Item[], length: number): Item[] {
  const unit = UNITS[type];
  const out: Item[] = [];
  for (let i = 0; i < length; i++) {
    const idx = unit[i % unit.length] ?? 0;
    const item = items[idx];
    if (!item) throw new Error(`pattern: ${type} needs ${idx + 1} items, got ${items.length}`);
    out.push(item);
  }
  return out;
}

/** A pattern for `round`, its answer and three choices to pick from. */
export function makePatternRound(round: number, rng: () => number = Math.random): PatternRound {
  const types = typesFor(round);
  const type = types[randInt(0, types.length - 1, rng)] ?? 'AB';
  const set = SETS[randInt(0, SETS.length - 1, rng)] ?? SHAPES;
  const items = pick(set, itemsFor(type), rng);
  const length = visibleLength(type);
  const full = expand(type, items, length + 1);
  const answer = full[length];
  if (!answer) throw new Error('pattern: expansion shorter than requested');
  const decoys = pick(
    set.filter((i) => i.emoji !== answer.emoji),
    2,
    rng,
  );
  return {
    type,
    items,
    sequence: full.slice(0, length),
    answer,
    choices: shuffle([answer, ...decoys], rng),
  };
}

function inSet(set: readonly Item[], item: Item): boolean {
  return set.some((i) => i.emoji === item.emoji);
}

/**
 * What to say when a round starts. Shape and fruit names are short, so the
 * visible sequence is read out first ("chấm đỏ, chấm xanh, …") to make the
 * rhythm audible; animal names are long, so only the question is asked.
 */
export function roundSpeech(r: PatternRound): string {
  const first = r.items[0];
  if (!first || !(inSet(SHAPES, first) || inSet(FRUITS, first))) return QUESTION;
  return `${r.sequence.map((i) => i.name).join(', ')}. ${QUESTION}`;
}
