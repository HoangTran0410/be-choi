import { ANIMALS, FRUITS, type Item } from '../../core/content';
import { pick, shuffle } from '../../core/dom';

export interface Card {
  /** Position in the dealt deck, 0 … 2*pairs-1. Unique per card. */
  id: number;
  item: Item;
}

/** How long two mismatched cards stay open before flipping back. */
export const FLIP_BACK_MS = 800;

/** Cards are drawn from animals and fruits. */
const POOL: readonly Item[] = [...ANIMALS, ...FRUITS];

/** Rounds 0 and 1 use 2 pairs, rounds 2 and 3 use 3, later rounds use 4. */
export function pairCount(roundIndex: number): number {
  if (roundIndex < 2) return 2;
  if (roundIndex < 4) return 3;
  return 4;
}

/** `2 * pairs` shuffled cards; every item appears exactly twice. */
export function makeDeck(pairs: number, rng: () => number = Math.random): Card[] {
  const items = pick(POOL, pairs, rng);
  return shuffle([...items, ...items], rng).map((item, id) => ({ id, item }));
}

/** Two different cards showing the same emoji. */
export function isMatch(a: Card, b: Card): boolean {
  return a.id !== b.id && a.item.emoji === b.item.emoji;
}
