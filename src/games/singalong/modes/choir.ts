/**
 * Planning the choir's answer. Pure: the mode turns the plan into sounds.
 */

/** Gap between one animal joining and the next, so they sing as a round (a canon). */
export const ENTRY_GAP_MS = 600;

export interface Entry {
  /** Which choir part (0 = first) and when it starts, ms from the start of the answer. */
  part: number;
  startMs: number;
}

/** The first `parts` animals come in one after another. */
export function planEntries(parts: number, gapMs = ENTRY_GAP_MS): Entry[] {
  return Array.from({ length: Math.max(0, parts) }, (_, part) => ({ part, startMs: part * gapMs }));
}

/**
 * Hit times relative to the first hit, ms. The child's own taps become the
 * rhythm the animals sing back, however late in the recording they began.
 */
export function relativeRhythm(hitsMs: readonly number[]): number[] {
  const first = hitsMs[0];
  if (first === undefined) return [];
  return hitsMs.map((t) => Math.max(0, Math.round(t - first)));
}

/** How long the whole answer lasts: the last animal's last hit, or its slowed-down playback. */
export function answerLength(entries: readonly Entry[], clipMs: number, rates: readonly number[]): number {
  let end = 0;
  for (const e of entries) end = Math.max(end, e.startMs + clipMs / Math.max(0.25, rates[e.part] ?? 1));
  return end;
}

export function rhythmLength(entries: readonly Entry[], rhythm: readonly number[], tailMs = 600): number {
  const last = rhythm[rhythm.length - 1] ?? 0;
  const lastEntry = entries[entries.length - 1]?.startMs ?? 0;
  return lastEntry + last + tailMs;
}
