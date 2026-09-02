import { ANIMALS, type Item } from '../../core/content';
import { pick, randInt } from '../../core/dom';

/** The evening, one job at a time. */
export type Phase = 'toys' | 'light' | 'blanket' | 'lullaby' | 'done';
export type PhaseEvent = 'tidy' | 'dark' | 'tucked' | 'sung' | 'again';

const TRANSITIONS: Record<Phase, Partial<Record<PhaseEvent, Phase>>> = {
  toys: { tidy: 'light' },
  light: { dark: 'blanket' },
  blanket: { tucked: 'lullaby' },
  lullaby: { sung: 'done' },
  done: { again: 'toys' },
};

/** toys+tidy→light, light+dark→blanket, blanket+tucked→lullaby, lullaby+sung→done; anything else stays. */
export function nextPhase(phase: Phase, event: PhaseEvent): Phase {
  return TRANSITIONS[phase][event] ?? phase;
}

/** What is spoken when each job comes up. */
export const PROMPTS: Readonly<Record<Phase, string>> = {
  toys: 'Cất đồ chơi vào hộp nào!',
  light: 'Tắt đèn thôi!',
  blanket: 'Đắp chăn cho ấm nhé!',
  lullaby: 'Chạm vào mặt trăng để hát ru nào!',
  done: 'Ngủ ngon nhé!',
};

export const TOYS: readonly string[] = ['🧸', '🚗', '🪀', '🧩', '⚽', '🦆', '🪁', '🎨', '🪘', '🚂'];

/** The song is only this many notes long: a toddler is asleep, not at a concert. */
export const LULLABY_NOTES = 14;
export const LULLABY_BPM = 92;
export const MIN_TOYS = 2;
export const MAX_TOYS = 4;

/** Two toys on the first night, then three, then four. */
export function toyCount(round: number): number {
  return Math.min(MAX_TOYS, MIN_TOYS + Math.max(0, Math.floor(round)));
}

export interface ToyOnFloor {
  emoji: string;
  /** Percentages across the floor, so the room can be any size. */
  x: number;
  y: number;
}

export interface Night {
  friend: Item;
  toys: ToyOnFloor[];
}

/** Toys sit on a two-by-two grid, this far apart across and down the floor, in per cent. */
export const TOY_ACROSS = 38;
export const TOY_DOWN = 36;
/** Toys keep left of this, because the basket they go into sits in the right-hand corner. */
export const TOY_MAX_X = 72;

/**
 * A night in: a friend to put to bed (never the same one twice running) and the
 * toys they left on the floor. The toys go on a jittered two-by-two grid, so no
 * two ever land on top of each other however the dice fall.
 */
export function makeNight(round: number, rng: () => number = Math.random, excludeEmoji?: string): Night {
  const pool = ANIMALS.filter((a) => a.emoji !== excludeEmoji);
  const friend = pool[randInt(0, pool.length - 1, rng)];
  if (!friend) throw new Error('bedtime: nobody to put to bed');
  const toys = pick(TOYS, toyCount(round), rng).map((emoji, i): ToyOnFloor => ({
    emoji,
    x: 16 + (i % 2) * TOY_ACROSS + (rng() - 0.5) * 10,
    y: 26 + Math.floor(i / 2) * TOY_DOWN + (rng() - 0.5) * 12,
  }));
  return { friend, toys };
}
