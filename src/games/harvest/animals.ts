/**
 * The barn, with no DOM in sight.
 *
 * Each animal goes round one loop and cannot get stuck in it:
 *   hungry -> (fed) -> chewing -> ready -> (collected) -> hungry ...
 * Anything from the basket that grew in the garden is food; what the animal likes
 * fills it up at once, anything else takes two helpings. Nobody goes hungry for
 * good and nothing is ever refused.
 */
import type { FxKind } from '../../core/audio';
import { cropById, cropsAt } from './crops';

export interface Species {
  id: string;
  emoji: string;
  name: string;
  voice: FxKind;
  /** The noise it makes, said aloud when it is tapped. */
  says: string;
  /** Crop ids it loves best. */
  likes: readonly string[];
  /** What it gives: an item id, or null for a hug (it gives love, which counts for a star's worth of progress). */
  product: string | null;
  /** Farm level at which it moves in. */
  level: number;
}

export const SPECIES: readonly Species[] = [
  {
    id: 'chicken',
    emoji: '🐔',
    name: 'con gà',
    voice: 'cluck',
    says: 'cục tác cục tác',
    likes: ['corn', 'tomato'],
    product: 'egg',
    level: 1,
  },
  { id: 'cow', emoji: '🐄', name: 'con bò', voice: 'moo', says: 'ùm bò', likes: ['carrot', 'corn'], product: 'milk', level: 1 },
  { id: 'pig', emoji: '🐖', name: 'con heo', voice: 'pig', says: 'ủn ỉn', likes: ['tomato', 'strawberry'], product: null, level: 2 },
  { id: 'duck', emoji: '🦆', name: 'con vịt', voice: 'quack', says: 'cạp cạp', likes: ['broccoli', 'corn'], product: 'egg', level: 3 },
  { id: 'sheep', emoji: '🐑', name: 'con cừu', voice: 'sheep', says: 'bê bê', likes: ['carrot', 'pumpkin'], product: 'wool', level: 4 },
  {
    id: 'goat',
    emoji: '🐐',
    name: 'con dê',
    voice: 'goat',
    says: 'be he he',
    likes: ['eggplant', 'broccoli'],
    product: 'cheese',
    level: 5,
  },
  { id: 'horse', emoji: '🐴', name: 'con ngựa', voice: 'horse', says: 'hí hí', likes: ['watermelon', 'carrot'], product: null, level: 6 },
  {
    id: 'rabbit',
    emoji: '🐰',
    name: 'con thỏ',
    voice: 'squeak',
    says: 'chít chít',
    likes: ['carrot', 'broccoli'],
    product: null,
    level: 7,
  },
];

export function speciesById(id: string): Species | undefined {
  return SPECIES.find((s) => s.id === id);
}

export function speciesAt(level: number): Species[] {
  return SPECIES.filter((s) => s.level <= level);
}

export type Phase = 'hungry' | 'chewing' | 'ready';

export interface Pen {
  id: string;
  phase: Phase;
  /** Helpings eaten towards the next product. */
  fed: number;
  /** Seconds of chewing left. */
  t: number;
}

/** Helpings that fill an animal. */
export const FEED_NEED = 2;
/** Seconds an animal spends making its product. */
export const CHEW_SEC = 6;

export function makePen(id: string): Pen {
  return { id, phase: 'hungry', fed: 0, t: 0 };
}

/** Pens for everybody who has moved in by `level`, keeping the ones already there. */
export function syncPens(pens: readonly Pen[], level: number): Pen[] {
  return speciesAt(level).map((s) => pens.find((p) => p.id === s.id) ?? makePen(s.id));
}

export type FeedResult = 'liked' | 'ate' | 'full' | 'no';

/**
 * Give one helping of crop `cropId`. `liked` = loved it (filled up at once),
 * `ate` = fine, a bit more please, `full` = it is already chewing or has something to give.
 */
export function feed(pen: Pen, species: Species, cropId: string): FeedResult {
  if (!cropById(cropId)) return 'no';
  if (pen.phase !== 'hungry') return 'full';
  const liked = species.likes.includes(cropId);
  pen.fed += liked ? FEED_NEED : 1;
  if (pen.fed >= FEED_NEED) {
    pen.phase = 'chewing';
    pen.t = CHEW_SEC;
    pen.fed = 0;
  }
  return liked ? 'liked' : 'ate';
}

/** Chewing runs down. Returns true on the tick the product becomes ready. */
export function tickPen(pen: Pen, dt: number): boolean {
  if (pen.phase !== 'chewing') return false;
  pen.t -= Math.max(0, dt);
  if (pen.t > 0) return false;
  pen.t = 0;
  pen.phase = 'ready';
  return true;
}

/** Take what is ready. `null` means nothing was ready; otherwise the item id, or 'love' for animals that only give hugs. */
export function collect(pen: Pen, species: Species): string | null {
  if (pen.phase !== 'ready') return null;
  pen.phase = 'hungry';
  pen.fed = 0;
  pen.t = 0;
  return species.product ?? 'love';
}

/** The crop to show in this animal's thought bubble: something it likes that the child already has seeds for. */
export function wantedCrop(species: Species, level: number): string {
  const have = new Set(cropsAt(level).map((c) => c.id));
  return species.likes.find((id) => have.has(id)) ?? species.likes[0] ?? 'carrot';
}

/**
 * What to feed an animal that was just tapped with nothing chosen: something it likes
 * if the basket has it, else whatever there is the most of. `null` when the basket has no crops.
 */
export function pickFood(species: Species, stock: Readonly<Record<string, number>>): string | null {
  const have = (id: string): number => stock[id] ?? 0;
  const loved = species.likes.find((id) => have(id) > 0);
  if (loved) return loved;
  let best: string | null = null;
  for (const [id, n] of Object.entries(stock)) {
    if (n > 0 && cropById(id) && (best === null || n > have(best))) best = id;
  }
  return best;
}
