import type { GameContext } from '../../core/types';
import type { LearnState } from './progress';
import type { Sayer } from './say';
import type { Teacher } from './teacher';
import type { Env, TopicId } from './types';

/** What every screen of the game shares. Screens never reach for anything else. */
export interface App {
  ctx: GameContext;
  state: LearnState;
  /** Family photos, grouped into people. Replaced when the parent adds or renames photos. */
  env: Env;
  sayer: Sayer;
  teacher: Teacher;
  /** True until the map has greeted the child once (the game's own intro is still being spoken). */
  firstVisit: boolean;
  /** The device is struggling: fewer animations. */
  low(): boolean;
  save(): void;
  goMap(): void;
  goQuiz(topic: TopicId): void;
  goExplore(): void;
}
