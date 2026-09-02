import { ANIMALS, type Item } from '../../core/content';
import { pick, shuffle } from '../../core/dom';

export interface ShadowRound {
  /** Silhouettes on the board, in display order. Distinct animals. */
  animals: Item[];
  /** Coloured pieces in the tray: a shuffled copy of `animals`. */
  tray: Item[];
}

/** Rounds 0 and 1 use 3 animals, later rounds use 4. */
export function roundSize(roundIndex: number): number {
  return roundIndex < 2 ? 3 : 4;
}

export function makeShadowRound(roundIndex: number, rng: () => number = Math.random): ShadowRound {
  const animals = pick(ANIMALS, roundSize(roundIndex), rng);
  return { animals, tray: shuffle(animals, rng) };
}
