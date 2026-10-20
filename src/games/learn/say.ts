import type { SpeechPart } from '../../core/speech';
import { SENTENCE_PAUSE_MS, TALK_RATE, WORD_PAUSE_MS, WORD_RATE } from '../../core/say';
import type { Scope } from './scope';

/**
 * The teacher's voice: short phrases, one after another, with a quiet gap between them, so a
 * 3-year-old can hear where one word ends and the next begins.
 *
 * It sits on the shared `ctx.speakSeq` (slow rate, gaps, a new line cuts the old one off). A
 * phrase of one or two words is a name to learn and is read slower and followed by a longer
 * gap than a sentence. The teacher never talks over herself: a new `say` or `stop` drops
 * everything still waiting and silences the voice.
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
  /** Drop whatever is still waiting to be said, and stop the voice. */
  stop(): void;
  busy(): boolean;
}

export interface Voice {
  speakSeq(parts: SpeechPart[]): Promise<boolean>;
  stopSpeech(): void;
}

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** How a phrase is spoken: names slowly with a long gap after, sentences a little faster. */
export function partFor(p: Part, onStart?: () => void): SpeechPart {
  const text = typeof p === 'string' ? p : p.text;
  const name = wordCount(text) <= 2;
  const gap = typeof p === 'string' ? undefined : p.gap;
  return { text, rate: name ? WORD_RATE : TALK_RATE, pauseAfterMs: gap ?? (name ? WORD_PAUSE_MS : SENTENCE_PAUSE_MS), onStart };
}

export function createSayer(voice: Voice, scope: Scope): Sayer {
  let turn = 0;
  let cancel: (() => void) | null = null;
  let busy = false;

  function drop(): void {
    turn++;
    cancel?.();
    cancel = null;
    busy = false;
  }

  function stop(): void {
    drop();
    voice.stopSpeech();
  }

  scope.onDispose(stop);

  return {
    stop,
    busy: () => busy,
    say(parts, opts = {}) {
      drop();
      const mine = turn;
      busy = parts.length > 0;
      const run = (): void => {
        cancel = null;
        if (mine !== turn) return;
        const list = parts.map((p, i) =>
          partFor(p, () => {
            if (mine === turn) opts.onPart?.(i);
          }),
        );
        if (!list.length) return;
        void voice.speakSeq(list).then((finished) => {
          if (mine !== turn || !finished) return;
          busy = false;
          opts.onDone?.();
        });
      };
      if (opts.delay && opts.delay > 0) {
        voice.stopSpeech();
        cancel = scope.later(run, opts.delay);
      } else run();
    },
  };
}
