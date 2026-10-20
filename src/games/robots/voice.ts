/**
 * What the robots say — very little. This game is for listening to the band, so a tap, a drop or a
 * goodbye is never talked over. The voice is kept for a few big moments, each a short line, and a
 * quiet-time rule keeps even those apart: the first time a child comes in, the stage getting full,
 * and a new robot being unlocked. Names, counts and colours are shown (words and pictures), not said.
 *
 * Lines are built here (pure, tested); the narrator speaks them; `createSparseVoice` decides whether
 * a moment may speak at all.
 */
import type { SpeechPart } from '../../core/speech';

export interface Line {
  text: string;
  /** Speech rate. */
  rate: number;
  /** Quiet time after this line (ms). */
  gap: number;
}

/** The very first time in the game: one sentence. */
export function welcomeLines(): Line[] {
  return [{ text: 'Kéo robot lên sân khấu nhé!', rate: 0.8, gap: 0 }];
}

/** The stage is full. */
export function fullLines(): Line[] {
  return [{ text: 'Đủ cả ban nhạc rồi!', rate: 0.8, gap: 0 }];
}

/** A goal is done and a new robot is on the shelf. */
export function newRobotLines(): Line[] {
  return [{ text: 'Có bạn robot mới!', rate: 0.8, gap: 0 }];
}

export type Moment = 'welcome' | 'full' | 'unlock';

/** At least this long between two spoken moments (ms). */
export const QUIET_MS = 30000;

export interface SparseVoice {
  /** May this moment speak now? Say yes at most once per quiet time, and `welcome` at most once. */
  allow(moment: Moment): boolean;
}

export function createSparseVoice(now: () => number, quietMs = QUIET_MS): SparseVoice {
  let last = -Infinity;
  const welcomed = new Set<Moment>();
  return {
    allow(moment) {
      const t = now();
      if (t - last < quietMs) return false;
      if (moment === 'welcome') {
        if (welcomed.has(moment)) return false;
        welcomed.add(moment);
      }
      last = t;
      return true;
    },
  };
}

export interface Narrator {
  /** Say these lines, one after another; cuts off whatever was being said. */
  say(lines: readonly Line[]): void;
  stop(): void;
}

export interface NarratorDeps {
  speakSeq(parts: SpeechPart[]): Promise<boolean>;
  stopSpeech(): void;
}

/** Each line is its own slow part; `gap` is the quiet time after it. The shared voice never overlaps two lines. */
export function createNarrator(deps: NarratorDeps): Narrator {
  return {
    say(lines) {
      const parts = lines.filter((l) => l.text.trim()).map((l): SpeechPart => ({ text: l.text, rate: l.rate, pauseAfterMs: l.gap }));
      if (parts.length) void deps.speakSeq(parts);
    },
    stop() {
      deps.stopSpeech();
    },
  };
}
