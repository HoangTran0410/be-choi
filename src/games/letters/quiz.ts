import { shuffle } from '../../core/dom';
import { COUNTABLES, DIGITS, LETTERS, initialOf, type Countable, type Glyph, type Word } from './logic';

/** How well one letter is known: times asked, and times found on the very first touch. */
export interface Stat {
  asked: number;
  right: number;
}
export type Mastery = Record<string, Stat>;

/** Found on the first touch this many times → "thuộc". */
export const KNOWN_AT = 3;
/** Right answers (first touch) per star. */
export const ROUNDS_PER_STAR = 5;

export function isKnown(stat: Stat | undefined): boolean {
  return !!stat && stat.right >= KNOWN_AT;
}

/** A new mastery map with one more answer on `key`. `firstTry`: no wrong touch before the right one. */
export function record(m: Mastery, key: string, firstTry: boolean): Mastery {
  const old = m[key] ?? { asked: 0, right: 0 };
  return { ...m, [key]: { asked: old.asked + 1, right: old.right + (firstTry ? 1 : 0) } };
}

/** How much we want to ask about this one: new and shaky ones often, known ones now and then. */
export function weightOf(stat: Stat | undefined): number {
  if (!stat) return 5;
  if (isKnown(stat)) return 0.4;
  return 2 + Math.max(0, 3 - stat.asked);
}

export function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: () => number = Math.random): T {
  if (items.length === 0) throw new Error('pickWeighted: nothing to pick from');
  const weights = items.map((it) => Math.max(0, weight(it)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(rng() * items.length)]!;
  let at = rng() * total;
  for (let i = 0; i < items.length; i++) {
    at -= weights[i]!;
    if (at < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** The next letter (or digit) to ask for; `avoid` (the one just asked) is skipped when anything else exists. */
export function chooseTarget(pool: readonly Glyph[], mastery: Mastery, rng: () => number = Math.random, avoid?: string): Glyph {
  const rest = pool.length > 1 ? pool.filter((g) => g.label !== avoid) : pool;
  return pickWeighted(rest, (g) => weightOf(mastery[g.label]), rng);
}

export interface Level {
  /** How many things to choose from. */
  options: 2 | 3 | 4;
  /** Letters that look or sound alike may appear together; letters with marks (Ă, Ơ …) join the questions. */
  confusable: boolean;
  /** Biggest number asked for when counting. */
  maxCount: number;
}

/** Gets a little harder with every right answer in a row: 2 → 3 → 4 choices, then the look-alikes. */
export function levelFor(streak: number): Level {
  if (streak < 2) return { options: 2, confusable: false, maxCount: 3 };
  if (streak < 4) return { options: 3, confusable: false, maxCount: 5 };
  if (streak < 6) return { options: 3, confusable: true, maxCount: 7 };
  return { options: 4, confusable: true, maxCount: 9 };
}

/** After a wrong touch: back off a little, never to zero. */
export function easeStreak(streak: number): number {
  return Math.floor(streak / 2);
}

/** Letters easy to mix up (by look or by sound). */
export const CONFUSABLE: readonly (readonly string[])[] = [
  ['B', 'D', 'Đ'],
  ['M', 'N'],
  ['A', 'Ă', 'Â'],
  ['O', 'Ô', 'Ơ'],
  ['E', 'Ê'],
  ['U', 'Ư'],
  ['P', 'Q'],
  ['C', 'G'],
  ['H', 'K'],
  ['I', 'Y'],
  ['S', 'X'],
];

export function lookAlikes(label: string): string[] {
  return CONFUSABLE.filter((g) => g.includes(label)).flatMap((g) => g.filter((x) => x !== label));
}

const isPlain = (g: Glyph): boolean => /^[A-Z]$/.test(g.label);

/** Letters used for questions: the plain ones first; marked ones (Ă Â Ê Ô Ơ Ư Đ) once the child is doing well. */
export function letterPool(level: Level): Glyph[] {
  return level.confusable ? [...LETTERS] : LETTERS.filter(isPlain);
}

export interface LetterRound {
  kind: 'letter';
  target: Glyph;
  options: Glyph[];
}
export interface PictureOption {
  word: Word;
  /** The letter that word starts with. */
  letter: string;
  correct: boolean;
}
export interface PictureRound {
  kind: 'picture';
  target: Glyph;
  options: PictureOption[];
}
export interface CountRound {
  kind: 'count';
  item: Countable;
  count: number;
  /** Digit glyphs to choose from; exactly one has the label `String(count)`. */
  options: Glyph[];
}
export type Round = LetterRound | PictureRound | CountRound;

function distractorLetters(target: Glyph, level: Level, pool: readonly Glyph[], rng: () => number): Glyph[] {
  const need = level.options - 1;
  const twins = level.confusable ? shuffle(lookAlikes(target.label), rng) : [];
  const out: Glyph[] = [];
  for (const label of twins) {
    const g = LETTERS.find((l) => l.label === label);
    if (g && out.length < Math.min(need, 2)) out.push(g);
  }
  const avoidTwins = new Set(lookAlikes(target.label));
  const others = shuffle(
    pool.filter((g) => g.label !== target.label && !out.includes(g) && (level.confusable || !avoidTwins.has(g.label))),
    rng,
  );
  for (const g of others) {
    if (out.length >= need) break;
    out.push(g);
  }
  return out;
}

export function buildLetterRound(target: Glyph, level: Level, rng: () => number = Math.random): LetterRound {
  const options = shuffle([target, ...distractorLetters(target, level, letterPool(level), rng)], rng);
  return { kind: 'letter', target, options };
}

export function buildPictureRound(target: Glyph, level: Level, rng: () => number = Math.random): PictureRound {
  const own = target.words[Math.floor(rng() * target.words.length)]!;
  const need = level.options - 1;
  const twinLabels = new Set(level.confusable ? lookAlikes(target.label) : []);
  const wrongWords: PictureOption[] = [];
  const allWords = LETTERS.filter((l) => l.label !== target.label).flatMap((l) => l.words.map((word) => ({ word, letter: l.label })));
  const candidates = shuffle(
    allWords.filter((x) => initialOf(x.word.word) !== target.label && (level.confusable || !lookAlikes(target.label).includes(x.letter))),
    rng,
  );
  // look-alike letters first, but at most one of each letter, so the choices stay different pictures
  const used = new Set<string>();
  const ordered = [...candidates.filter((c) => twinLabels.has(c.letter)), ...candidates.filter((c) => !twinLabels.has(c.letter))];
  for (const c of ordered) {
    if (wrongWords.length >= need) break;
    if (used.has(c.letter) || used.has(c.word.emoji)) continue;
    used.add(c.letter);
    used.add(c.word.emoji);
    wrongWords.push({ word: c.word, letter: c.letter, correct: false });
  }
  const options = shuffle<PictureOption>([{ word: own, letter: target.label, correct: true }, ...wrongWords], rng);
  return { kind: 'picture', target, options };
}

export function buildCountRound(level: Level, mastery: Mastery, rng: () => number = Math.random, avoidCount?: number): CountRound {
  const item = COUNTABLES[Math.floor(rng() * COUNTABLES.length)]!;
  const pool = DIGITS.filter((d) => {
    const n = Number(d.label);
    if (n === 0) return level.maxCount >= 5;
    return n <= level.maxCount;
  });
  const target = chooseTarget(pool, mastery, rng, avoidCount === undefined ? undefined : String(avoidCount));
  const count = Number(target.label);
  // Wrong choices are near the right one (off by 1, 2 …), then anything.
  const near = DIGITS.filter((d) => d.label !== target.label && Math.abs(Number(d.label) - count) <= 2 && (Number(d.label) <= level.maxCount + 1));
  const far = DIGITS.filter((d) => d.label !== target.label && !near.includes(d) && Number(d.label) <= Math.max(3, level.maxCount));
  const wrong = [...shuffle(near, rng), ...shuffle(far, rng)].slice(0, level.options - 1);
  return { kind: 'count', item, count, options: shuffle([target, ...wrong], rng) };
}

export type FindState = { streak: number; mastery: Mastery };

/** The next question for "Tìm chữ": letters by name, and (once under way) pictures that start with a letter. */
export function buildFindRound(state: FindState, rng: () => number = Math.random, avoid?: string): LetterRound | PictureRound {
  const level = levelFor(state.streak);
  const target = chooseTarget(letterPool(level), state.mastery, rng, avoid);
  const picture = state.streak >= 1 && rng() < 0.4;
  return picture ? buildPictureRound(target, level, rng) : buildLetterRound(target, level, rng);
}
