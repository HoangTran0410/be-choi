import type { Photo } from '../../core/photos';
import type { GameContext } from '../../core/types';
import type { ModeId, Progress } from './levels';
import type { Work } from './store';

/** One of the three activities, living inside the workshop. */
export interface ModeCtl {
  readonly el: HTMLElement;
  /** Shown now: announce, start or resume a round, arm the idle hint. */
  enter(): void;
  /** Hidden now: stop hints. State is kept, so coming back is where the child left off. */
  leave(): void;
  /** The window or orientation changed: fit everything again. */
  relayout(): void;
  destroy(): void;
}

/** Which pictures the child wants: the workshop's pick, one family photo, or only the ready-made ones. */
export type PhotoChoice = { kind: 'auto' } | { kind: 'photo'; id: string } | { kind: 'art' };

/** What a mode may ask of the workshop around it. */
export interface Workshop {
  readonly ctx: GameContext;
  progress(): Progress;
  /** Stars earned in this mode so far. */
  stars(mode: ModeId): number;
  /**
   * One finished activity: a star in the mode (and for the app), saved, shown in the HUD.
   * Returns the names of anything it just unlocked (usually none).
   */
  award(mode: ModeId): string[];
  /** Idle hint that stays quiet while an overlay (cabinet, picker) covers the game. */
  arm(fn: () => void): void;
  /** Family photos a parent added (may be empty). */
  photos(): Photo[];
  /** The family photo for round `round`, or `undefined` when this round is a ready-made picture. */
  photoFor(round: number): Photo | undefined;
  /** Opens the picture chooser (only useful when there are photos). */
  choosePhoto(): void;
  /** Called whenever the photo choice or the photo list changes. Returns an unsubscribe function. */
  onPhotosChange(fn: () => void): () => void;
  works(): Work[];
  addWork(work: Work): void;
  /** Run `fn` after `ms`; cancelled when the child leaves the game. */
  later(fn: () => void, ms: number): void;
  /** Perf: draw less. */
  lite(): boolean;
  /** Is any overlay open? */
  covered(): boolean;
}
