import type { Photo } from '../../core/photos';
import type { GameContext } from '../../core/types';
import type { StationId } from './levels';

/** Counts the station keeps while a round runs; the island turns them into a rating. */
export interface Stats {
  /** Wrong tries. */
  slips: number;
  /** Times the idle hint had to nudge. */
  hints: number;
}

/** What a station is given for one round. */
export interface Env {
  ctx: GameContext;
  /** The station's own box: it fills the play area and nothing else. */
  area: HTMLElement;
  level: number;
  island: number;
  /** Seeded for this round. */
  rng: () => number;
  photos: readonly Photo[];
  stats: Stats;
  alive(): boolean;
  /** A timer that is cleared when the round is left. */
  later(fn: () => void, ms: number): void;
  /** Speak phrase by phrase, slowly, with a breath between. */
  say(phrases: string | readonly string[], then?: () => void): void;
  /** Idle hint: `fn` runs after a quiet spell and counts in `stats.hints`, unless it returns `false` (nothing to nudge). */
  arm(fn: () => void | boolean, ms?: number): void;
  /** Run on window resize; removed when the round is left. */
  onResize(fn: () => void): void;
  /** Device is struggling: skip the extras. */
  low(): boolean;
}

/** A station finished its round; `size` is how many decisions it asked for. */
export type Done = (size: number) => void;

export interface Station {
  id: StationId;
  title: string;
  icon: string;
  color: string;
  /** What is said when the child arrives, phrase by phrase. */
  intro: readonly string[];
  start(env: Env, done: Done): (() => void) | void;
}
