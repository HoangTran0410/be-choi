import { ANIMALS, type Item } from '../../core/content';
import type { FxKind } from '../../core/audio';
import { pick, randInt } from '../../core/dom';

/** A hiding place. `open` names the CSS animation that gets it out of the way. */
export interface Hider {
  emoji: string;
  open: 'lift' | 'pop' | 'swing' | 'slide' | 'lean' | 'tip';
}

/** Things an animal can hide behind, each with its own way of opening. */
export const HIDERS: readonly Hider[] = [
  { emoji: '📦', open: 'lift' },
  { emoji: '🎁', open: 'pop' },
  { emoji: '🚪', open: 'swing' },
  { emoji: '☁️', open: 'slide' },
  { emoji: '🌳', open: 'lean' },
  { emoji: '🪣', open: 'tip' },
  { emoji: '⛺', open: 'lean' },
  { emoji: '🛖', open: 'lift' },
];

// The voice table lives in core/content: ú oà, ai kêu đấy and the farm all share it.
export { DEFAULT_VOICE, voiceOf } from '../../core/content';

/** Something other than an animal, so the boxes never feel predictable. */
export interface Surprise {
  emoji: string;
  /** How many fly out. */
  count: number;
  say: string;
  fx: FxKind;
}

export const SURPRISES: readonly Surprise[] = [
  { emoji: '🦋', count: 5, say: 'Ú oà! Đàn bướm bay ra!', fx: 'sparkle' },
  { emoji: '🫧', count: 6, say: 'Ú oà! Bong bóng!', fx: 'whistle' },
  { emoji: '🎈', count: 4, say: 'Ú oà! Bóng bay!', fx: 'honk' },
  { emoji: '🌈', count: 3, say: 'Ú oà! Cầu vồng!', fx: 'kazoo' },
  { emoji: '⭐', count: 6, say: 'Ú oà! Mưa sao!', fx: 'sparkle' },
  { emoji: '🍬', count: 5, say: 'Ú oà! Kẹo ngọt!', fx: 'slide' },
];

/** How often a box holds a surprise instead of an animal (free play only). */
export const SURPRISE_CHANCE = 0.18;

/** Free taps before the game asks the child to find one particular animal. */
export const FIND_AFTER = 4;
export const STAR_EVERY = 6;
/** How long the animal stays out before hiding again. */
export const REVEAL_MS = 1600;
/** Delay between the box opening and the animal's voice. */
export const VOICE_MS = 200;
/** The animal swaps this long after the box has closed. */
export const HIDE_SWAP_MS = 300;
/** A closed box lets its animal peek by itself this often… */
export const PEEK_MS = 2600;
/** …and holds the peek this long. */
export const PEEK_HOLD_MS = 1000;
/** Boxes slide to new places over this long at the start of a find round. */
export const SHUFFLE_MS = 500;
/** Pause after a correct find before the confetti, so the animal is seen first. */
export const WIN_MS = 700;

export interface Spot {
  hider: Hider;
  item: Item;
}

/** `n` spots with distinct hiders and distinct animals. Throws if `n > HIDERS.length`. */
export function makeSpots(n: number, rng: () => number = Math.random): Spot[] {
  const hiders = pick(HIDERS, n, rng);
  const items = pickAnimals(n, rng);
  return hiders.map((hider, i) => {
    const item = items[i];
    if (!item) throw new Error('peekaboo: not enough animals');
    return { hider, item };
  });
}

/** `n` distinct animals. */
export function pickAnimals(n: number, rng: () => number = Math.random): Item[] {
  return pick(ANIMALS, n, rng);
}

/** A random animal that is not `current`. */
export function nextAnimal(current: Item, rng: () => number = Math.random): Item {
  const others = ANIMALS.filter((a) => a.emoji !== current.emoji);
  const next = others[randInt(0, others.length - 1, rng)];
  if (!next) throw new Error('peekaboo: no other animal');
  return next;
}

/** The animal the child is asked to find: always one that is really out there. */
export function pickTarget(items: readonly Item[], rng: () => number = Math.random): Item {
  const target = items[randInt(0, items.length - 1, rng)];
  if (!target) throw new Error('peekaboo: no target');
  return target;
}

/** A surprise, or `null` for a plain animal. */
export function rollSurprise(rng: () => number = Math.random): Surprise | null {
  if (rng() >= SURPRISE_CHANCE) return null;
  return SURPRISES[randInt(0, SURPRISES.length - 1, rng)] ?? null;
}
