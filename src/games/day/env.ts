import type { Photo } from '../../core/photos';
import type { GameContext } from '../../core/types';
import type { Kid, KidSize } from './art';
import type { DayPlan, Visitor } from './day';
import type { Scope } from './scope';

/** What a job inside the day gets to work with. */
export interface Env {
  ctx: GameContext;
  /** Empty area under the HUD for this job to fill. Cleared when the job closes. */
  host: HTMLElement;
  plan: DayPlan;
  /** Days finished so far: decides what is unlocked. */
  days: number;
  kid: Kid;
  /** A view of the little friend that is dropped from `kid` when the job closes. */
  kidView(size: KidSize): HTMLElement;
  /** Everything started here stops when the job closes. */
  scope: Scope;
  /** Family photos right now (may be empty). */
  photos(): Photo[];
  /** Who comes to play today: a photo url (or null) and a drawn fallback. */
  visitor(): { url: string | null; visitor: Visitor };
  /** Say it slowly, one phrase at a time (phrases are separated by "…"). */
  say(text: string): void;
  /** The job is done. */
  finish(): void;
}

export type Activity = (env: Env) => void;
