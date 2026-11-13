/**
 * Which of several recorded variants to play next: random, but never the one
 * that just played, so a child tapping the same animal gets a different cat
 * every time and not the same one twice in a row. With one variant there is
 * no choice and it repeats.
 *
 * @param count how many variants there are
 * @param last  the index played last time, if any
 * @param rand  a [0, 1) source, injectable for tests
 */
export function nextVariant(count: number, last: number | undefined, rand: () => number = Math.random): number {
  if (!(count > 1)) return 0;
  const skip = last !== undefined && last >= 0 && last < count ? last : -1;
  const pool = skip < 0 ? count : count - 1;
  const pick = Math.min(pool - 1, Math.floor(rand() * pool));
  return skip >= 0 && pick >= skip ? pick + 1 : pick;
}
