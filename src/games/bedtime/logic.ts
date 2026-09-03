import { ANIMALS, type Item } from '../../core/content';
import { pick, randInt } from '../../core/dom';

/**
 * The four things that make a bedtime. They are deliberately independent: a
 * two-year-old presses whatever catches their eye, so each one works at any
 * moment and the night ends when all four are done, in whatever order they came.
 */
export type Job = 'toys' | 'light' | 'blanket' | 'lullaby';

export const JOBS: readonly Job[] = ['toys', 'light', 'blanket', 'lullaby'];

/** The picture on each job's tick in the little row of things still to do. */
export const JOB_ICON: Readonly<Record<Job, string>> = {
  toys: '🧺',
  light: '💡',
  blanket: '🛏️',
  lullaby: '🌙',
};

/** Said when a job is still waiting and the child has gone quiet. */
export const NUDGES: Readonly<Record<Job, string>> = {
  toys: 'Cất đồ chơi vào hộp nào!',
  light: 'Tắt đèn thôi!',
  blanket: 'Đắp chăn cho ấm nhé!',
  lullaby: 'Chạm vào mặt trăng để hát ru nào!',
};

/** Said the moment a job is finished, whichever one it happens to be. */
export const CHEERS: Readonly<Record<Job, string>> = {
  toys: 'Gọn gàng rồi!',
  light: 'Tắt đèn rồi!',
  blanket: 'Ấm quá!',
  lullaby: 'Hát hay quá!',
};

/** Said when a job is undone again. Nothing is ever wrong here, it just goes back. */
export const UNDOS: Readonly<Partial<Record<Job, string>>> = {
  light: 'Sáng rồi!',
  blanket: 'Mở chăn ra!',
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
