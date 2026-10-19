import { randInt } from '../../core/dom';

/** Moods the little friend gets into. `happy` is where every mood ends up. */
export type Mood = 'happy' | 'sad' | 'angry' | 'surprised' | 'sleepy';
/** The four ways to cheer the friend up. All of them always work. */
export type Comfort = 'hug' | 'candy' | 'lullaby' | 'tickle';

export const COMFORTS: readonly Comfort[] = ['hug', 'candy', 'lullaby', 'tickle'];
/** Moods that need cheering up (everything but `happy`). */
export const UPSET: readonly Mood[] = ['sad', 'angry', 'surprised', 'sleepy'];

/** Comforts that turn a mood around before the celebration and star. */
export const SOOTHES_PER_ROUND = 5;

export const FACE: Record<Mood, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😠',
  surprised: '😮',
  sleepy: '🥱',
};

/** Said when the mood arrives. */
export const MOOD_LINE: Record<Mood, string> = {
  happy: 'Bé vui quá',
  sad: 'Bé buồn quá',
  angry: 'Bé giận quá',
  surprised: 'Bé ngạc nhiên quá',
  sleepy: 'Bé buồn ngủ quá',
};

export interface Reaction {
  /** The happy face the friend makes back. */
  face: string;
  /** Little things that float up from the friend. */
  floaters: readonly string[];
  /** What was done, as it is said in the sentence. */
  done: string;
  icon: string;
  label: string;
}

export const REACTIONS: Record<Comfort, Reaction> = {
  hug: { face: '🥰', floaters: ['💗', '💕', '💖'], done: 'được ôm rồi', icon: '🤗', label: 'Ôm' },
  candy: { face: '😋', floaters: ['🍬', '✨', '🍭'], done: 'có kẹo rồi', icon: '🍬', label: 'Cho kẹo' },
  lullaby: { face: '😌', floaters: ['🎵', '🎶', '⭐'], done: 'nghe hát ru rồi', icon: '🎵', label: 'Hát ru' },
  tickle: { face: '😆', floaters: ['😂', '✨', '💛'], done: 'được cù lét rồi', icon: '🪶', label: 'Cù lét' },
};

/** The sentence spoken once the friend has been cheered up. */
export function soothedLine(mood: Mood, comfort: Comfort): string {
  return `${MOOD_LINE[mood]}… ${REACTIONS[comfort].done}, bé vui!`;
}

/** Said when a comfort arrives while the friend is already happy. */
export function giggleLine(comfort: Comfort): string {
  return `Hihi, ${REACTIONS[comfort].done}!`;
}

/** A mood to be upset about, never the same as `prev`. */
export function nextMood(prev: Mood | null, rng: () => number = Math.random): Mood {
  const pool = UPSET.filter((m) => m !== prev);
  return pool[randInt(0, pool.length - 1, rng)] ?? 'sad';
}
