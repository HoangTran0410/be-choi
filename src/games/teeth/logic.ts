import { ANIMALS, type Item } from '../../core/content';
import { pick, randInt } from '../../core/dom';

export interface Tooth {
  /** 0 … 7; the top row is 0 … 3, the bottom row 4 … 7. */
  id: number;
  row: 'top' | 'bottom';
  col: number;
  dirty: boolean;
  /** Brush strokes received. Stops counting once the tooth is clean. */
  scrubs: number;
}

export interface Mouth {
  character: Item;
  /** All teeth in id order. */
  teeth: Tooth[];
  /** Stain emoji per tooth id (only shown on dirty teeth). */
  stains: string[];
}

export const TEETH_PER_ROW = 4;
export const SCRUBS_TO_CLEAN = 6;
/** What is stuck on a dirty tooth. */
export const STAINS: readonly string[] = ['🍫', '🍬', '🍭', '🍪'];
export const MIN_DIRTY = 3;
export const MAX_DIRTY = 6;

/** Dirty teeth in `round` (0-based): 3, 4, 5, then 6 from round 3 on. */
export function dirtyCount(round: number): number {
  return Math.min(MIN_DIRTY + Math.max(0, Math.floor(round)), MAX_DIRTY);
}

/**
 * A fresh mouth: an animal (never `excludeEmoji`, so two rounds in a row differ),
 * eight teeth with `dirtyCount(round)` of them stained at random.
 */
export function makeMouth(round: number, rng: () => number = Math.random, excludeEmoji?: string): Mouth {
  const pool = ANIMALS.filter((a) => a.emoji !== excludeEmoji);
  const character = pool[randInt(0, pool.length - 1, rng)];
  if (!character) throw new Error('teeth: no animal to brush');
  const ids = Array.from({ length: TEETH_PER_ROW * 2 }, (_, i) => i);
  const dirty = new Set(pick(ids, dirtyCount(round), rng));
  const teeth = ids.map(
    (id): Tooth => ({
      id,
      row: id < TEETH_PER_ROW ? 'top' : 'bottom',
      col: id % TEETH_PER_ROW,
      dirty: dirty.has(id),
      scrubs: 0,
    }),
  );
  const stains = ids.map(() => STAINS[randInt(0, STAINS.length - 1, rng)] ?? '🍫');
  return { character, teeth, stains };
}

/**
 * One brush stroke on tooth `id`. Pure: returns a new array when something
 * changed, the same array (and `cleaned: false`) for a clean or unknown tooth.
 * `cleaned` is true only on the stroke that reaches `SCRUBS_TO_CLEAN`.
 */
export function scrub(teeth: Tooth[], id: number): { teeth: Tooth[]; cleaned: boolean } {
  const i = teeth.findIndex((t) => t.id === id);
  const tooth = teeth[i];
  if (!tooth || !tooth.dirty) return { teeth, cleaned: false };
  const scrubs = tooth.scrubs + 1;
  const cleaned = scrubs >= SCRUBS_TO_CLEAN;
  const next = teeth.slice();
  next[i] = { ...tooth, scrubs, dirty: !cleaned };
  return { teeth: next, cleaned };
}

export function allClean(teeth: Tooth[]): boolean {
  return teeth.every((t) => !t.dirty);
}

export type Phase = 'paste' | 'brush' | 'rinse' | 'done';
export type PhaseEvent = 'paste' | 'clean' | 'rinse' | 'again';

const TRANSITIONS: Record<Phase, Partial<Record<PhaseEvent, Phase>>> = {
  paste: { paste: 'brush' },
  brush: { clean: 'rinse' },
  rinse: { rinse: 'done' },
  done: { again: 'paste' },
};

/** paste+paste→brush, brush+clean→rinse, rinse+rinse→done, done+again→paste; anything else stays. */
export function nextPhase(phase: Phase, event: PhaseEvent): Phase {
  return TRANSITIONS[phase][event] ?? phase;
}
