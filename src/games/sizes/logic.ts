import { ANIMALS, FRUITS, VEHICLES, type Item } from '../../core/content';
import { randInt, shuffle } from '../../core/dom';

export interface SizePiece {
  big: boolean;
  id: number;
}

export interface SizeRound {
  /** The emoji every piece and both box labels show this round. */
  item: Item;
  /** 4 pieces: 2 big + 2 small, shuffled. */
  pieces: SizePiece[];
}

/** Glyph scale of a big piece relative to the base `.g-item` emoji size. */
export const BIG_SCALE = 1.25;
/** Glyph scale of a small piece relative to the base `.g-item` emoji size. */
export const SMALL_SCALE = 0.6;

/** Pool a round's item is drawn from. */
export const SIZE_ITEMS: readonly Item[] = [...ANIMALS, ...VEHICLES, ...FRUITS];

/**
 * One round: a random item (never `excludeEmoji`, so two rounds in a row differ)
 * and four shuffled pieces, two big and two small, with unique ids.
 */
export function makeSizeRound(rng: () => number = Math.random, excludeEmoji?: string): SizeRound {
  const pool = SIZE_ITEMS.filter((i) => i.emoji !== excludeEmoji);
  const item = pool[randInt(0, pool.length - 1, rng)];
  if (!item) throw new Error('sizes: no items to pick from');
  const pieces = shuffle(
    [
      { big: true, id: 0 },
      { big: true, id: 1 },
      { big: false, id: 2 },
      { big: false, id: 3 },
    ],
    rng,
  );
  return { item, pieces };
}

export function sizeScale(big: boolean): number {
  return big ? BIG_SCALE : SMALL_SCALE;
}

/** Vietnamese word spoken when a piece lands in its box. */
export function sizeWord(big: boolean): string {
  return big ? 'to' : 'nhỏ';
}
