import { sayText } from '../../core/say';
import type { GameContext } from '../../core/types';

/**
 * The game's spoken voice, kept slow. Everything goes through the shared `speakSeq`: a
 * sentence at a time at a slow rate, a clear gap after names, and a new line cuts the old one
 * off, so two lines are never spoken over each other.
 */
export interface Narrator {
  /** Say it (and show it). Replaces whatever was still being said. */
  say(text: string, opts?: { quiet?: boolean }): void;
  /** Silence the voice. */
  stop(): void;
}

export function createNarrator(ctx: Pick<GameContext, 'speakSeq' | 'stopSpeech' | 'onCleanup'>, show: (text: string) => void): Narrator {
  const stop = (): void => ctx.stopSpeech();
  ctx.onCleanup(stop);
  return {
    say(text, opts = {}) {
      show(text);
      if (opts.quiet) return;
      void sayText(ctx, text);
    },
    stop,
  };
}
