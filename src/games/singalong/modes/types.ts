import type { GameContext } from '../../../core/types';
import type { Audience } from '../audience';
import type { ProgressStore } from '../progress';
import type { ShowStats } from '../show';
import type { Stage } from '../stage';
import type { Timers } from '../timers';
import type { Voice, VoiceFrame } from '../voice';

/** What every mode gets to work with. */
export interface Env {
  ctx: GameContext;
  voice: Voice;
  stage: Stage;
  audience: Audience;
  progress: ProgressStore;
  /** Say it slowly, and show it in the speech bubble. */
  say(text: string, opts?: { quiet?: boolean }): void;
  /** A fresh set of timers, dropped when the game ends. The mode clears it in `leave`. */
  timers(): Timers;
  /**
   * The curtain call: celebrate, rate the show, hand out tickets and gifts, show the
   * results. Resolves when the child taps "go on".
   */
  finish(stats: ShowStats): Promise<void>;
  /** Something happened that proves the child is there: put off the idle nudge. */
  touch(): void;
  /** Is the game still open? */
  alive(): boolean;
}

export interface Mode {
  /** The mode just came to the front. */
  enter(): void;
  /** Another mode is coming (or the game is closing): stop sounds, timers and loops. */
  leave(): void;
  /** Every voice frame while this mode is in front. */
  frame?(frame: VoiceFrame): void;
  /** A finger came down on the singer (a clap). */
  hit?(): void;
  /** The idle hint: wiggle whatever would help. */
  nudge?(): void;
}

export type ModeFactory = (env: Env, panel: HTMLElement) => Mode;
