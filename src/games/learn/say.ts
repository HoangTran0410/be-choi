import type { Scope } from './scope';

/**
 * The teacher's voice: short phrases, one after another, with a pause between them, so a
 * 3-year-old can hear where one word ends and the next begins.
 *
 * It sits on the plain `ctx.speak(text)` and paces the phrases with timers. Each phrase is
 * given a generous time to finish before the next starts (the next `speak` cuts the last off),
 * and a new `say` or `stop` drops everything still waiting, so a child who taps again is
 * never talked over by the old sentence.
 *
 * Rate: the voice engine's speed is set in core/speech.ts, which this game does not touch
 * (the shared `speakSeq` will carry a ~0.7 rate). Until then the slowness here comes from
 * the pauses and from keeping every phrase short.
 */
export type Part = string | { text: string; /** Pause after this phrase, ms. */ gap?: number };

export interface SayOptions {
  /** Called as each phrase starts (index into the parts). */
  onPart?: (index: number) => void;
  /** Called after the last phrase has finished. */
  onDone?: () => void;
  /** Wait this long before the first phrase. */
  delay?: number;
}

export interface Sayer {
  say(parts: readonly Part[], opts?: SayOptions): void;
  /** Drop whatever is still waiting to be said. */
  stop(): void;
  busy(): boolean;
}

/** Pause between phrases. */
export const GAP_MS = 380;
const PER_WORD_MS = 430;
const BASE_MS = 350;

/** How long a phrase takes at a slow, clear pace. Deliberately on the long side. */
export function estimateMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // A comma is a short breath in the voice.
  const commas = (text.match(/,/g) ?? []).length;
  return BASE_MS + words * PER_WORD_MS + commas * 120;
}

export function createSayer(speak: (text: string) => void, scope: Scope): Sayer {
  let turn = 0;
  let cancel: (() => void) | null = null;
  let busy = false;

  function stop(): void {
    turn++;
    cancel?.();
    cancel = null;
    busy = false;
  }

  scope.onDispose(stop);

  return {
    stop,
    busy: () => busy,
    say(parts, opts = {}) {
      stop();
      const mine = turn;
      const list = parts.map((p) => (typeof p === 'string' ? { text: p, gap: GAP_MS } : { text: p.text, gap: p.gap ?? GAP_MS }));
      busy = list.length > 0;
      const step = (i: number): void => {
        if (mine !== turn) return;
        const part = list[i];
        if (!part) {
          busy = false;
          opts.onDone?.();
          return;
        }
        opts.onPart?.(i);
        if (part.text.trim()) speak(part.text);
        cancel = scope.later(() => step(i + 1), estimateMs(part.text) + part.gap!);
      };
      if (opts.delay && opts.delay > 0) cancel = scope.later(() => step(0), opts.delay);
      else step(0);
    },
  };
}
