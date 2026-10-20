/**
 * How hard a touch was, worked out from the pace of playing (a web page cannot feel
 * how hard a finger presses): a quick run of taps is played loudly and brightly, a
 * slow single tap gently. The first tap of all is a comfortable middle.
 */
export const VEL_FIRST = 0.65;
export const VEL_SOFT = 0.4;
export const VEL_LOUD = 1;
/** At or above this gap (ms) a touch is as soft as it gets. */
export const GAP_SOFT = 1100;
/** At or below this gap (ms) a touch is as loud as it gets. */
export const GAP_LOUD = 160;

export function velocityFromGap(gapMs: number | null): number {
  if (gapMs === null || !Number.isFinite(gapMs)) return VEL_FIRST;
  if (gapMs >= GAP_SOFT) return VEL_SOFT;
  if (gapMs <= GAP_LOUD) return VEL_LOUD;
  // log scale: halving the gap is the same step everywhere
  const t = Math.log(GAP_SOFT / gapMs) / Math.log(GAP_SOFT / GAP_LOUD);
  return Math.round((VEL_SOFT + (VEL_LOUD - VEL_SOFT) * t) * 100) / 100;
}

/** Index of the line nearest to `p`. */
export function nearestLine(lines: readonly number[], p: number): number {
  let best = 0;
  let bd = Infinity;
  lines.forEach((l, i) => {
    const d = Math.abs(l - p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Strings crossed when a finger goes from string `from` to string `to`, in order, not counting `from`. */
export function crossed(from: number, to: number): number[] {
  const out: number[] = [];
  if (to === from) return out;
  const step = to > from ? 1 : -1;
  for (let i = from + step; i !== to + step; i += step) out.push(i);
  return out;
}
