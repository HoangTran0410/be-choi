import type { FxKind } from '../../core/audio';
import { VOICED_ANIMALS, voiceOf, type Item } from '../../core/content';
import { shuffle } from '../../core/dom';

/** One question: the animal that made the sound, and everything on screen to choose from. */
export interface Round {
  answer: Item;
  choices: Item[];
}

/** Two animals to start with, then three, then four. */
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 4;
export const CORRECT_FOR_STAR = 3;

export function choiceCount(round: number): number {
  return Math.min(MAX_CHOICES, MIN_CHOICES + Math.floor(Math.max(0, round) / 2));
}

export function voiceFor(item: Item): FxKind {
  return voiceOf(item);
}

/**
 * A question the child can actually win: every animal on screen sounds different,
 * so the lion and the tiger (who share a roar) are never offered together, and the
 * answer is never the one from last time.
 */
export function makeRound(round: number, rng: () => number = Math.random, excludeEmoji?: string): Round {
  const pool = shuffle(VOICED_ANIMALS, rng);
  const answer = pool.find((a) => a.emoji !== excludeEmoji) ?? pool[0]!;
  const heard = new Set<FxKind>([voiceOf(answer)]);
  const choices = [answer];
  for (const item of pool) {
    if (choices.length >= choiceCount(round)) break;
    const voice = voiceOf(item);
    if (item.emoji === answer.emoji || heard.has(voice)) continue;
    heard.add(voice);
    choices.push(item);
  }
  return { answer, choices: shuffle(choices, rng) };
}
