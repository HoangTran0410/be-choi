/**
 * Which recording to play for a note, and how fast to play it. Pure arithmetic, no Web Audio, so it
 * is tested in Node (samples.test.ts); the fetching and playing live in samplesBank.ts.
 *
 * A pitched instrument is a few recorded root notes. A note asked for is played from the nearest
 * root, repitched by `playbackRate` (a semitone is a factor of 2^(1/12)); the farther the root,
 * the less like the instrument it sounds, so a root further than `maxShift` semitones away is not
 * used and the engine falls back to the synth. A struck drum or shaker is a handful of takes of
 * the same hit: one is picked at random each time, never the same take twice in a row.
 */

/** One encoded file of an instrument. */
export interface SampleFile {
  /** File name under public/instruments/. */
  f: string;
  /** Length in seconds. */
  dur: number;
  /** MIDI pitch of the recording (69 = A4 = 440 Hz); absent for the unpitched takes of a `hits` set. */
  midi?: number;
  /** Seamless loop [start, end) in seconds, for a held note. */
  loop?: [number, number];
}

export interface SampleSet {
  kind: 'pitched' | 'hits';
  /** A sustained sound: loops while the note is held and is released when it ends. */
  held?: boolean;
  /** Pitched: how many semitones a root may be repitched before the synth is preferred. Default 7. */
  maxShift?: number;
  /**
   * Pitched: how far (semitones) a note BEYOND the lowest / highest root may be repitched. Default
   * `maxShift`. A set with roots close together keeps `maxShift` small for the notes between them
   * and uses this to stay as wide at its ends as it was before the roots were added.
   */
  edgeShift?: number;
  /** Hits: the fraction of the asked-for pitch (relative to the instrument's reference) a hit takes on. Default 0. */
  follow?: number;
  files: readonly SampleFile[];
}

/** What to play: which file, and at what `playbackRate`. */
export interface Pick {
  index: number;
  rate: number;
}

export const DEFAULT_MAX_SHIFT = 7;
/** Playback rate stays inside what a buffer source does without sounding broken. */
export const MIN_RATE = 0.4;
export const MAX_RATE = 2.5;

export const freqToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);

/** Rate that plays a recording of pitch `rootMidi` at pitch `targetMidi`. */
export const playbackRate = (rootMidi: number, targetMidi: number): number => 2 ** ((targetMidi - rootMidi) / 12);

/**
 * Index of the root closest in pitch to `midi`. A tie goes to the lower root: repitching a
 * recording up keeps it livelier than slowing it down. -1 when there are no roots.
 */
export function nearestRoot(roots: readonly number[], midi: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i]!;
    const dist = Math.abs(root - midi);
    if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) <= 1e-9 && root < roots[best]!)) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * A picker of one of `n` takes that never gives the same one twice in a row (with one take it has
 * no choice). `rng` is Math.random by default; tests pass their own.
 */
export function roundRobin(n: number, rng: () => number = Math.random): () => number {
  let last = -1;
  return () => {
    if (n <= 1) return 0;
    let i = Math.min(n - 1, Math.floor(rng() * n));
    if (i === last) i = (i + 1 + Math.min(n - 2, Math.floor(rng() * (n - 1)))) % n;
    last = i;
    return i;
  };
}

/**
 * Pick the file and rate for a pitched set: the nearest root, or null when even that cannot be
 * bent that far (outside MIN_RATE..MAX_RATE). `freq` <= 0 or not finite plays the nearest root as recorded.
 */
export function pickPitched(set: SampleSet, freq: number): Pick | null {
  const roots = set.files.map((f) => f.midi ?? NaN);
  if (!roots.length || roots.some((r) => !Number.isFinite(r))) return null;
  if (!(freq > 0) || !Number.isFinite(freq)) return { index: 0, rate: 1 };
  const midi = freqToMidi(freq);
  const index = nearestRoot(roots, midi);
  const rate = playbackRate(roots[index]!, midi);
  // Once an instrument has recordings, every note it can reach comes from them, even a far
  // repitch: one note from the synth among recorded ones sounds like another instrument (a dull,
  // short Đô on a ringing xylophone). Only notes past what a buffer can be bent to fall back.
  if (rate < MIN_RATE || rate > MAX_RATE) return null;
  return { index, rate };
}

/**
 * Pick the take and rate for a `hits` set. `pick` is a round-robin over the takes (see
 * `roundRobin`); `freq` and `refFreq` set how far the hit follows the asked-for pitch.
 */
export function pickHit(set: SampleSet, pick: () => number, freq?: number, refFreq?: number): Pick | null {
  if (!set.files.length) return null;
  const follow = set.follow ?? 0;
  let rate = 1;
  if (follow > 0 && freq && refFreq && freq > 0 && refFreq > 0) {
    rate = 2 ** ((follow * 12 * Math.log2(freq / refFreq)) / 12);
    rate = Math.min(1.35, Math.max(0.75, rate));
  }
  return { index: pick(), rate };
}

/** Level for a strike of hardness `vel` 0…1: a soft touch is quiet but never silent. */
export const velocityGain = (vel: number): number => {
  const v = Number.isFinite(vel) ? Math.min(1, Math.max(0, vel)) : 1;
  return 0.25 + 0.75 * v * v;
};
