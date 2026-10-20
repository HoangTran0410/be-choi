import type { GameContext } from '../../core/types';

/**
 * The game's spoken voice, kept slow. The shell's voice has one fixed speed, so
 * slowness comes from the text: one short sentence at a time, with a real pause
 * between them, instead of one breathless run-on line.
 */

/** Split into short sentences. Keeps the punctuation; drops empty pieces. */
export function sentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]*/g) ?? [];
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** How long a sentence takes to say slowly, plus the breath after it (ms). */
export function pacing(sentence: string): number {
  return 900 + sentence.length * 85;
}

export interface Narrator {
  /** Say it (and show it). Replaces whatever was still waiting to be said. */
  say(text: string, opts?: { quiet?: boolean }): void;
  /** Forget what is still queued. */
  stop(): void;
}

export function createNarrator(ctx: Pick<GameContext, 'speak' | 'onCleanup'>, show: (text: string) => void): Narrator {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  ctx.onCleanup(stop);
  return {
    say(text, opts = {}) {
      stop();
      show(text);
      if (opts.quiet) return;
      const queue = sentences(text);
      const next = (): void => {
        timer = null;
        const line = queue.shift();
        if (line === undefined) return;
        ctx.speak(line);
        if (queue.length > 0) timer = setTimeout(next, pacing(line));
      };
      next();
    },
    stop,
  };
}
