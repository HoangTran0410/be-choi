/**
 * What the robots say, and how: slowly, a word or two at a time, with a breath between, so a
 * three-year-old can catch each one. Lines are built here (pure, tested); the narrator spaces them out.
 */
import { COUNT_WORDS, type RobotDef } from './robots';

export interface Line {
  text: string;
  /** Speech rate: 0.6 is slow and clear. */
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
  const name: Line = { text: cap(robot.name) + '.', rate: 0.6, gap: 900 };
  const fact = FACTS[((nth % FACTS.length) + FACTS.length) % FACTS.length] as Fact;
  switch (fact) {
    case 'count':
      return [name, { text: n === 1 ? 'Bé có một bạn robot rồi.' : `${cap(countWord(n))} bạn robot rồi.`, rate: 0.7, gap: 0 }];
    case 'color':
      return [name, { text: `Bạn ${robot.name} màu ${robot.colorName}.`, rate: 0.7, gap: 0 }];
    default:
      return [name, { text: `${cap(robot.name)} là nhạc cụ ${GROUP_WORDS[robot.group]}.`, rate: 0.7, gap: 0 }];
  }
}

/** The stage is full. */
export function fullLines(): Line[] {
  return [{ text: 'Đủ cả ban nhạc rồi!', rate: 0.75, gap: 0 }];
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
  return [{ text: text[what], rate: 0.75, gap: 0 }];
}

const SONG_NAMES = { fun: 'Bài vui.', disco: 'Disco robot.', calm: 'Nhạc êm.' } as const;

/** The name of the song just chosen. */
export function songLines(id: keyof typeof SONG_NAMES): Line[] {
  return [{ text: SONG_NAMES[id], rate: 0.7, gap: 0 }];
}

export function byeLines(): Line[] {
  return [{ text: 'Tạm biệt!', rate: 0.75, gap: 0 }];
}

export function newRobotLines(): Line[] {
  return [{ text: 'Có bạn robot mới!', rate: 0.75, gap: 0 }];
}

export interface Narrator {
  /** Say these lines, dropping whatever was still waiting to be said. */
  say(lines: readonly Line[]): void;
  stop(): void;
}

export interface NarratorDeps {
  speak(text: string, opts?: { interrupt?: boolean; rate?: number }): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

/** Roughly how long a line takes at its rate, so the next one is queued after it, not on top of it. */
export function lineMs(l: Line): number {
  const words = l.text.split(/\s+/).filter(Boolean).length;
  return (words * 520) / l.rate;
}

export function createNarrator(deps: NarratorDeps): Narrator {
  let timer: unknown = null;
  const stop = (): void => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };
  return {
    say(lines) {
      stop();
      const run = (i: number): void => {
        const l = lines[i];
        if (!l) return;
        deps.speak(l.text, { interrupt: i === 0, rate: l.rate });
        if (i + 1 < lines.length) {
          timer = deps.setTimer(() => run(i + 1), lineMs(l) + l.gap);
        }
      };
      run(0);
    },
    stop,
  };
}
