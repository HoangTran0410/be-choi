/**
 * How games talk to a 2–4 year old: slowly, one idea at a time, with a quiet gap so a name
 * never runs into the words after it. Everything sits on `ctx.speakSeq`, so a new line cuts
 * the old one off and nothing is ever said on top of something else.
 */
import type { SpeechPart } from './speech';
import type { GameContext } from './types';

/** A name the child should learn (object, letter, number, colour, animal, instrument). */
export const WORD_RATE = 0.68;
/** Instructions and praise. */
export const TALK_RATE = 0.82;
/** Quiet time after a name, before whatever follows it. */
export const WORD_PAUSE_MS = 750;
/** Quiet time between sentences. */
export const SENTENCE_PAUSE_MS = 550;
/** Quiet time at a comma. */
export const CLAUSE_PAUSE_MS = 400;
/** Time between counted numbers. */
export const COUNT_PAUSE_MS = 700;
/** Sentences longer than this many words are split at their commas. */
export const MAX_WORDS = 8;

export type SayContext = Pick<GameContext, 'speakSeq'>;

const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const hasLetters = (s: string): boolean => /[\p{L}\p{N}]/u.test(s);

export function wordPart(text: string, pauseAfterMs = WORD_PAUSE_MS, onStart?: () => void): SpeechPart {
  return { text, rate: WORD_RATE, pauseAfterMs, onStart };
}

export function talkPart(text: string, pauseAfterMs = SENTENCE_PAUSE_MS, onStart?: () => void): SpeechPart {
  return { text, rate: TALK_RATE, pauseAfterMs, onStart };
}

/**
 * Break a line into the parts to speak: at sentence ends (. ! ? …), and at commas when the
 * sentence is long or opens with a one-or-two-word name ("Cà rốt, đã lớn"). A part of one or
 * two words is a name and gets the slow rate. The last part has no gap after it.
 */
export function phraseParts(text: string): SpeechPart[] {
  const parts: SpeechPart[] = [];
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(hasLetters);
  for (const sentence of sentences) {
    const clauses = sentence.split(/(?<=,)\s+/).map((c) => c.trim());
    const split = clauses.length > 1 && (words(sentence) > MAX_WORDS || words(clauses[0]!) <= 2);
    const groups = split ? clauses : [sentence];
    groups.forEach((g, i) => {
      const last = i === groups.length - 1;
      const clean = g.replace(/[,…]+$/u, '');
      if (!hasLetters(clean)) return;
      const name = words(clean) <= 2;
      parts.push({
        text: clean,
        rate: name ? WORD_RATE : TALK_RATE,
        pauseAfterMs: name ? WORD_PAUSE_MS : last ? SENTENCE_PAUSE_MS : CLAUSE_PAUSE_MS,
      });
    });
  }
  if (parts.length) parts[parts.length - 1]!.pauseAfterMs = 0;
  return parts;
}

/** Say a sentence or two, split into slow, short parts. Cuts off whatever was being said. */
export function sayText(ctx: SayContext, text: string): Promise<boolean> {
  const parts = phraseParts(text);
  if (!parts.length) return Promise.resolve(false);
  return ctx.speakSeq(parts);
}

/** {@link sayText} for places that need a plain `void` call (inside `&&`, arrow bodies, callbacks). */
export function speakText(ctx: SayContext, text: string): void {
  void sayText(ctx, text);
}

/** Say several separate phrases in order (each split like {@link sayText}). */
export function sayLines(ctx: SayContext, lines: readonly string[]): Promise<boolean> {
  const parts: SpeechPart[] = [];
  for (const line of lines) {
    const p = phraseParts(line);
    if (p.length) p[p.length - 1]!.pauseAfterMs = SENTENCE_PAUSE_MS;
    parts.push(...p);
  }
  if (!parts.length) return Promise.resolve(false);
  parts[parts.length - 1]!.pauseAfterMs = 0;
  return ctx.speakSeq(parts);
}

/**
 * Say a name on its own, slowly, then (after a clear gap) what comes after it.
 * `then` may be one phrase or several.
 */
export function sayWord(ctx: SayContext, word: string, then?: string | readonly string[], onStart?: () => void): Promise<boolean> {
  const rest = typeof then === 'string' ? [then] : [...(then ?? [])];
  const text = word.replace(/[.!?…,\s]+$/u, '');
  if (!hasLetters(text) && !rest.length) return Promise.resolve(false);
  const parts: SpeechPart[] = [];
  if (hasLetters(text)) parts.push({ ...wordPart(text, WORD_PAUSE_MS), onStart });
  for (const r of rest) {
    const p = phraseParts(r);
    if (p.length) p[p.length - 1]!.pauseAfterMs = SENTENCE_PAUSE_MS;
    parts.push(...p);
  }
  parts[parts.length - 1]!.pauseAfterMs = 0;
  return ctx.speakSeq(parts);
}

/**
 * Count out loud: each number slowly, ~700 ms apart, and `onEach(i)` (0-based) fires exactly
 * when number i+1 starts, so the thing shown appears with its number. `numberWords[i]` is the
 * spoken form of i+1. `after` is said once the last number is done.
 */
export function sayCount(
  ctx: SayContext,
  numberWords: readonly string[],
  n: number,
  onEach?: (index: number) => void,
  after?: string,
): Promise<boolean> {
  const parts: SpeechPart[] = [];
  const total = Math.max(0, Math.min(n, numberWords.length));
  for (let i = 0; i < total; i++) {
    parts.push(wordPart(numberWords[i]!, COUNT_PAUSE_MS, onEach ? () => onEach(i) : undefined));
  }
  if (after) parts.push(...phraseParts(after));
  if (!parts.length) return Promise.resolve(false);
  parts[parts.length - 1]!.pauseAfterMs = 0;
  return ctx.speakSeq(parts);
}
