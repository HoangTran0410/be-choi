import { FEED_PAIRS, FOODS, FRUITS, type Item } from '../../core/content';
import { pick, randInt, shuffle } from '../../core/dom';

export interface FeedRound {
  /** The hungry animal shown on the board. */
  animal: Item;
  /** Three shuffled foods in the tray; exactly one equals `correct`. */
  foods: Item[];
  /** What this animal eats, per `FEED_PAIRS`. */
  correct: Item;
}

/** Animals fed before the celebration and star. */
export const ANIMALS_PER_ROUND = 5;

/** Every candidate food, deduplicated by emoji (🍌 is in both FOODS and FRUITS). */
function foodPool(): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const f of [...FOODS, ...FRUITS]) {
    if (seen.has(f.emoji)) continue;
    seen.add(f.emoji);
    out.push(f);
  }
  return out;
}

/**
 * One animal with its food and two decoys. Animals listed in `excludeAnimals`
 * (by emoji) are skipped; when every animal is excluded the list is ignored.
 */
export function makeFeedRound(rng: () => number = Math.random, excludeAnimals: readonly string[] = []): FeedRound {
  const fresh = FEED_PAIRS.filter((p) => !excludeAnimals.includes(p.animal.emoji));
  const pool = fresh.length > 0 ? fresh : FEED_PAIRS;
  const pair = pool[randInt(0, pool.length - 1, rng)];
  if (!pair) throw new Error('feed: FEED_PAIRS is empty');
  const decoys = pick(
    foodPool().filter((f) => f.emoji !== pair.food.emoji),
    2,
    rng,
  );
  return {
    animal: pair.animal,
    correct: pair.food,
    foods: shuffle([pair.food, ...decoys], rng),
  };
}
