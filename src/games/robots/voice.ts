/**
 * What the robots say, and how: slowly, a word or two at a time, with a breath between, so a
 * three-year-old can catch each one. Lines are built here (pure, tested); the narrator spaces them out.
 */
import type { SpeechPart } from '../../core/speech';
import { COUNT_WORDS, type RobotDef } from './robots';

export interface Line {
  text: string;
  /** Speech rate: 0.65 for a name, 0.8 for the sentence after it. */
  rate: number;
  /** Quiet time after this line (ms). */
  gap: number;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "một", "hai" … up to eight. */
export function countWord(n: number): string {
  return COUNT_WORDS[Math.min(Math.max(0, Math.floor(n)), COUNT_WORDS.length - 1)] ?? '';
}

/** The line that follows the name rotates through these so it stays fresh. */
export type Fact = 'count' | 'color' | 'group';
export const FACTS: readonly Fact[] = ['count', 'color', 'group'];

const GROUP_WORDS: Record<RobotDef['group'], string> = {
  gõ: 'gõ',
  gảy: 'gảy',
  thổi: 'thổi',
  kéo: 'kéo',
  phím: 'bấm phím',
};

/**
 * A robot has just joined: say its name on its own, slowly, then one more thing.
 * `n` is how many robots are on stage now; `nth` picks which fact to give.
 */
export function placedLines(robot: RobotDef, n: number, nth: number): Line[] {
  const name: Line = { text: cap(robot.name) + '.', rate: 0.65, gap: 800 };
  const fact = FACTS[((nth % FACTS.length) + FACTS.length) % FACTS.length] as Fact;
  switch (fact) {
    case 'count':
      return [name, { text: n === 1 ? 'Bé có một bạn robot rồi.' : `${cap(countWord(n))} bạn robot rồi.`, rate: 0.8, gap: 0 }];
    case 'color':
      return [name, { text: `Bạn ${robot.name} màu ${robot.colorName}.`, rate: 0.8, gap: 0 }];
    default:
      return [name, { text: `${cap(robot.name)} là nhạc cụ ${GROUP_WORDS[robot.group]}.`, rate: 0.8, gap: 0 }];
  }
}

/** The stage is full. */
export function fullLines(): Line[] {
  return [{ text: 'Đủ cả ban nhạc rồi!', rate: 0.8, gap: 0 }];
}

export type Missing = 'empty' | 'beat' | 'bass' | 'chord' | 'melody' | 'more';

/** A nudge about what the band lacks; the shelf robot that fits wobbles at the same moment. */
export function hintLines(what: Missing): Line[] {
  const text: Record<Missing, string> = {
    empty: 'Kéo một bạn robot lên sân khấu nhé!',
    beat: 'Thiếu nhịp trống nè!',
    bass: 'Thiếu tiếng bass nè!',
    chord: 'Thiếu đàn đệm nè!',
    melody: 'Thiếu giai điệu nè!',
    more: 'Thêm một bạn nữa nhé!',
  };
  return [{ text: text[what], rate: 0.8, gap: 0 }];
}

const SONG_NAMES = { fun: 'Bài vui.', disco: 'Disco robot.', calm: 'Nhạc êm.', latin: 'Nhạc nhảy Latin.', east: 'Nhạc phương Đông.' } as const;

/** The name of the song just chosen. */
export function songLines(id: keyof typeof SONG_NAMES): Line[] {
  return [{ text: SONG_NAMES[id], rate: 0.8, gap: 0 }];
}

export function byeLines(): Line[] {
  return [{ text: 'Tạm biệt!', rate: 0.8, gap: 0 }];
}

export function newRobotLines(): Line[] {
  return [{ text: 'Có bạn robot mới!', rate: 0.8, gap: 0 }];
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
