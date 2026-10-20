import type { GameContext } from '../../core/types';
import type { DecorId } from './decor';
import type { WorldId } from './worlds';

/**
 * A world the child is standing in. The older games' engines run inside one, on
 * a stage of its own; this is the little they need from the outside.
 */
export interface Scene {
  readonly world: WorldId;
  /** Can the child put furniture here? */
  readonly canDecor: boolean;
  /** Can the child feed, switch the light and add friends here? (The pond has its own rod.) */
  readonly hasTank: boolean;
  /** Take the world down and give back everything it held. */
  destroy(): void;
  feed(): void;
  /** Flip day and night. Returns whether it is night now. */
  toggleNight(): boolean;
  isNight(): boolean;
  /** The world's own special thing: casting a line, misting the glass. */
  special(): void;
  /** Let an animal in. `fresh` ones swim in from the wall. */
  addFriend(key: string): void;
  /** Put a plant or ornament in. False when it could not be placed. */
  addDecor(id: DecorId): boolean;
  /** Take away what was added (the original furniture stays). */
  clearExtras(): void;
  /** Write what only this scene knows (where the furniture was left) into the book. */
  flush(): void;
  /** The animals living here now (book keys). */
  living(): string[];
  /** The stage the scene sits in, for placing photo stickers over it. */
  readonly stage: HTMLElement;
}

/**
 * The context an embedded game sees: the real one, except that it has a stage of
 * its own, its cleanups are collected here, and speech and stars pass through
 * a listener so the book can notice them.
 */
export interface ChildContext extends GameContext {
  /** Run the embedded game's cleanups (newest first). Safe to call twice. */
  dispose(): void;
}

export function childContext(
  base: GameContext,
  stage: HTMLElement,
  listen: { speak?: (text: string) => void; star?: () => void; rate?: (text: string) => number } = {},
): ChildContext {
  const cleanups: Array<() => void> = [];
  let done = false;
  return {
    ...base,
    stage,
    speak(text, opts) {
      listen.speak?.(text);
      // Whatever the embedded game says is said at this game's pace, unless it asked for its own.
      base.speak(text, { rate: opts?.rate ?? listen.rate?.(text) });
    },
    addStar() {
      listen.star?.();
      base.addStar();
    },
    onCleanup(fn) {
      if (done) fn();
      else cleanups.push(fn);
    },
    dispose() {
      if (done) return;
      done = true;
      for (const fn of cleanups.reverse()) {
        try {
          fn();
        } catch (err) {
          console.error(err);
        }
      }
      cleanups.length = 0;
    },
  };
}
