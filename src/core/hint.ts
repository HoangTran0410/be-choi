import type { SpeechPart } from './speech';
import type { GameContext, HintScheduler } from './types';

/**
 * Every number that decides how often the game may talk to a child who is just sitting there.
 * Change them here and nowhere else.
 */
export const QUIET_POLICY = {
  /** Wait before idle hint #1, #2, #3 of one quiet spell (ms). A game's own `ms` can only make it longer. */
  hintSchedule: [12_000, 24_000, 45_000],
  /** Wait before every idle hint after those (ms). */
  hintSteadyMs: 90_000,
  /** Idle hints that may SPEAK in a row without the child doing anything. Later ones are picture / wiggle only. */
  maxSpokenHints: 2,
  /** Least time between two spoken idle hints (ms). */
  spokenHintGapMs: 20_000,
  /** Speech that is not an answer to the child: at most one per this long (ms). */
  autoSpeechGapMs: 15_000,
  /** A press on the stage this recently means speech is the child's own doing, always allowed (ms). */
  touchWindowMs: 1_500,
  /**
   * After a press, follow-ups for this long (ms) are still treated as part of the conversation
   * ("Đúng rồi!" ... then the next question): not rate limited, and free to cut. Past it, speech
   * is automatic and must be rare and polite.
   */
  engagedMs: 6_000,
};

export type QuietPolicy = typeof QUIET_POLICY;

const DEFAULT_MS = 6000;

export interface HintOptions {
  /** Timing table; default {@link QUIET_POLICY}. */
  policy?: QuietPolicy;
  /** `false` keeps the old flat "every `ms`" cadence (the tests of single games rely on it). Default true. */
  stretch?: boolean;
}

/**
 * Idle-hint timer: nudges the child when nothing has happened for a while. The longer the child
 * stays idle the longer it waits (12 s, 24 s, 45 s, then every 90 s); a touch starts over.
 */
export function createHint(opts: HintOptions = {}): HintScheduler {
  const policy = opts.policy ?? QUIET_POLICY;
  const stretch = opts.stretch ?? true;
  let fn: (() => void) | null = null;
  let ms = DEFAULT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Hints fired since the child last did something. */
  let fires = 0;
  let epoch = 0;
  let fireId = 0;
  let active = false;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const delay = (): number => (stretch ? Math.max(ms, policy.hintSchedule[fires] ?? policy.hintSteadyMs) : ms);

  const schedule = () => {
    stop();
    if (!fn) return;
    timer = setTimeout(() => {
      timer = null;
      fires++;
      fireId++;
      active = true;
      // Speech started from the callback (even a moment later in the same tick) counts as hint speech.
      void Promise.resolve().then(() => {
        active = false;
      });
      try {
        fn?.();
      } finally {
        active = false;
      }
      schedule();
    }, delay());
  };

  return {
    arm(next, nextMs = DEFAULT_MS) {
      fn = next;
      ms = nextMs;
      if (!active) fires = 0;
      schedule();
    },
    touch() {
      if (!active) {
        fires = 0;
        epoch++;
      }
      if (fn) schedule();
    },
    clear() {
      fn = null;
      stop();
    },
    get active() {
      return active;
    },
    get epoch() {
      return epoch;
    },
    get fireId() {
      return fireId;
    },
  };
}

export interface SpeechGateDeps {
  hint: HintScheduler;
  speak: GameContext['speak'];
  speakSeq: GameContext['speakSeq'];
  stopSpeech: GameContext['stopSpeech'];
  /** Is a voice line being said right now? */
  busy?: () => boolean;
  now?: () => number;
  policy?: QuietPolicy;
}

export interface SpeechGate {
  speak: GameContext['speak'];
  speakSeq: GameContext['speakSeq'];
  stopSpeech: GameContext['stopSpeech'];
  /** The child pressed the stage (call on pointerdown / pointerup). */
  touched(): void;
  /** Drop silent playbacks of muted sequences. */
  dispose(): void;
}

/** How long a muted part "plays" for, so what a game shows in step with it keeps moving. */
const mutedMs = (p: SpeechPart): number => (p.text ? 500 + p.text.length * 70 : 0) + (p.pauseAfterMs ?? 450);

/**
 * The quiet-voice rules, wrapped around a game's `speak` / `speakSeq`:
 *  - Words said while an idle hint runs: at most `maxSpokenHints` in a row, `spokenHintGapMs` apart,
 *    until the child touches something. Later hints still run (their picture / wiggle) but are mute.
 *  - Words within `touchWindowMs` of a press: always said at once.
 *  - Words within `engagedMs` of a press: said (they follow the child's move), not rate limited.
 *  - Any other words: at most one per `autoSpeechGapMs`, and never over a line being said.
 * Muted `speakSeq` calls still step through their parts silently (`onStart` fires) and resolve `true`.
 * The game's greeting and `celebrate` do not go through here, so they are never limited.
 */
export function gateSpeech(deps: SpeechGateDeps): SpeechGate {
  const { hint } = deps;
  const policy = deps.policy ?? QUIET_POLICY;
  const now = deps.now ?? Date.now;
  const busy = deps.busy ?? (() => false);

  let lastTouchAt = -Infinity;
  let lastAutoAt = -Infinity;
  let lastHintAt = -Infinity;
  let spokenHints = 0;
  let seenEpoch = hint.epoch ?? 0;
  let spokenFire = -1;

  let silentToken = 0;
  let silentTimer: ReturnType<typeof setTimeout> | null = null;
  let silentDrop: (() => void) | null = null;
  const abortSilent = (): void => {
    silentToken++;
    if (silentTimer) clearTimeout(silentTimer);
    silentTimer = null;
    const d = silentDrop;
    silentDrop = null;
    d?.();
  };

  const mayTalk = (interrupt: boolean): boolean => {
    const t = now();
    if ((hint.epoch ?? 0) !== seenEpoch) {
      seenEpoch = hint.epoch ?? 0;
      spokenHints = 0;
    }
    if (hint.active === true) {
      if ((hint.fireId ?? 0) === spokenFire) return true;
      if (spokenHints >= policy.maxSpokenHints) return false;
      if (t - lastHintAt < policy.spokenHintGapMs) return false;
      if (t - lastAutoAt < policy.autoSpeechGapMs) return false;
      if (interrupt && busy()) return false;
      spokenHints++;
      spokenFire = hint.fireId ?? 0;
      lastHintAt = t;
      lastAutoAt = t;
      return true;
    }
    const since = t - lastTouchAt;
    if (since <= policy.touchWindowMs) return true;
    if (since <= policy.engagedMs) {
      lastAutoAt = t;
      return true;
    }
    if (interrupt && busy()) return false;
    if (t - lastAutoAt < policy.autoSpeechGapMs) return false;
    lastAutoAt = t;
    return true;
  };

  const silent = (parts: SpeechPart[]): Promise<boolean> => {
    abortSilent();
    const mine = silentToken;
    return new Promise<boolean>((resolve) => {
      silentDrop = () => resolve(false);
      const step = (i: number): void => {
        if (mine !== silentToken) return;
        const p = parts[i];
        if (!p) {
          silentDrop = null;
          resolve(true);
          return;
        }
        try {
          p.onStart?.();
        } catch {
          /* a game's callback must not break the gate */
        }
        silentTimer = setTimeout(() => step(i + 1), mutedMs(p));
      };
      step(0);
    });
  };

  return {
    speak(text, opts) {
      const interrupt = opts?.interrupt ?? true;
      if (!mayTalk(interrupt)) return;
      if (interrupt) abortSilent();
      deps.speak(text, opts);
    },
    speakSeq(parts) {
      if (!mayTalk(true)) return silent(parts);
      abortSilent();
      return deps.speakSeq(parts);
    },
    stopSpeech() {
      abortSilent();
      deps.stopSpeech();
    },
    touched() {
      lastTouchAt = now();
    },
    dispose: abortSilent,
  };
}
