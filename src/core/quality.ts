/**
 * What "draw less" means when `perf.low` is on (see ./frame). Pure decisions only,
 * so every game asks the same questions and gets the same answers.
 *
 * Quality only ever touches looks: how sharp the canvas is and how many purely
 * decorative things (bubbles, drifting specks) are alive. Never what the child
 * can do, what they placed, or what is saved.
 */

/** Pixels per CSS pixel on a struggling device: still readable, far fewer to fill. */
export const LOW_DPR = 1;

/** Share of decorative particles kept while struggling. */
export const LOW_DECOR_SHARE = 0.5;

/** The canvas resolution to use: the screen's, up to `max`, and no more than LOW_DPR when struggling. */
export function pickDpr(device: number, max: number, low: boolean): number {
  const d = Number.isFinite(device) && device > 0 ? device : 1;
  const capped = Math.min(d, max);
  return low ? Math.min(capped, LOW_DPR) : capped;
}

/** How many of `n` decorative things to keep: all of them normally, half (at least `min`) when struggling. */
export function decorCount(n: number, low: boolean, min = 1): number {
  if (!low) return n;
  return Math.min(n, Math.max(min, Math.ceil(n * LOW_DECOR_SHARE)));
}

/** A spawn rate for decorative particles. */
export function decorRate(rate: number, low: boolean): number {
  return low ? rate * LOW_DECOR_SHARE : rate;
}
