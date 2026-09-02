import type { AudioEngine } from './audio';
import type { PhotoStore } from './photos';

export type Skill =
  | 'cause-effect'
  | 'sorting'
  | 'matching'
  | 'creative'
  | 'music'
  | 'memory'
  /** Telling things apart by ear. */
  | 'listening'
  | 'counting'
  | 'care'
  /** Little worlds that run on their own and are nice to just watch. */
  | 'nature'
  | 'puzzle'
  | 'logic';

export interface GameMeta {
  /** URL slug, e.g. `shapes`. */
  id: string;
  /** Vietnamese title shown to parents. */
  title: string;
  /** Emoji used on the home tile and top bar. */
  icon: string;
  /** Pastel background for the tile and stage. */
  color: string;
  skill: Skill;
  /** Short Vietnamese sentence spoken when the game opens. */
  intro: string;
}

export interface HintScheduler {
  /** Call `fn` after `ms` (default 6000) of inactivity, then again every `ms` until cleared. */
  arm(fn: () => void, ms?: number): void;
  /** The child interacted: restart the countdown. */
  touch(): void;
  clear(): void;
}

export interface GameContext {
  /** Play area. `position: relative`, `touch-action: none`, fills the screen under the top bar. */
  stage: HTMLElement;
  audio: AudioEngine;
  /** Vietnamese text-to-speech. No-op when voice is off or unavailable. */
  speak(text: string): void;
  /** Confetti + jingle + praise. Resolves after ~1.6 s. */
  celebrate(): Promise<void>;
  hint: HintScheduler;
  /** Award one star to this game. */
  addStar(): void;
  /** Register work to run when the child leaves the game. */
  onCleanup(fn: () => void): void;
  /** Family photos picked by a parent (may be empty). */
  photos: PhotoStore;
  /** Emoji stickers the child has unlocked so far (may be empty). */
  stickers(): string[];
}

export interface GameModule extends GameMeta {
  start(ctx: GameContext): void;
}
