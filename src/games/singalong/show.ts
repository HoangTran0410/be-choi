import type { Band } from './catalog';

/**
 * What happened during one show, and what it earns. There is no wrong way to sing:
 * a show that was finished always earns a star and a ticket, and singing more earns
 * more. A show where the child only listened is still a show.
 */
export interface ShowStats {
  /** How long the show ran with the child on stage, ms. */
  durationMs: number;
  /** Time the voice (or the taps) was making sound, ms. */
  activeMs: number;
  /** Separate hits, claps or sung syllables. */
  onsets: number;
  /** Low, middle and high voices heard (as many as were detectable). */
  bands: readonly Band[];
  /** Extra things the mode noticed (a ring held, effects tried …). */
  bonus: number;
}

export interface ShowFrame {
  active: boolean;
  onset: boolean;
  band: Band | null;
}

export interface ShowTracker {
  feed(frame: ShowFrame, dtMs: number): void;
  addBonus(n?: number): void;
  stats(): ShowStats;
}

export function createTracker(): ShowTracker {
  let durationMs = 0;
  let activeMs = 0;
  let onsets = 0;
  let bonus = 0;
  const bands = new Set<Band>();
  return {
    feed(frame, dtMs) {
      const dt = Math.max(0, Math.min(500, dtMs));
      durationMs += dt;
      if (frame.active) activeMs += dt;
      if (frame.onset) onsets++;
      if (frame.active && frame.band !== null) bands.add(frame.band);
    },
    addBonus(n = 1) {
      bonus += n;
    },
    stats: () => ({ durationMs, activeMs, onsets, bands: [...bands].sort(), bonus }),
  };
}

export interface ShowResult {
  stars: 1 | 2 | 3;
  tickets: number;
}

/** Share of the show spent making sound that earns 2 and 3 stars. */
export const TWO_STARS = 0.18;
export const THREE_STARS = 0.45;
/** Most extra tickets a mode's own bonus can add. */
export const MAX_BONUS_TICKETS = 2;

export function rateShow(stats: ShowStats): ShowResult {
  const ratio = stats.durationMs > 0 ? stats.activeMs / stats.durationMs : 0;
  const stars = ratio >= THREE_STARS ? 3 : ratio >= TWO_STARS ? 2 : 1;
  const variety = stats.bands.length >= 2 ? 1 : 0;
  const bonus = Math.max(0, Math.min(MAX_BONUS_TICKETS, Math.floor(stats.bonus)));
  return { stars, tickets: stars + variety + bonus };
}
