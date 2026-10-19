import { pick, randInt, shuffle } from '../../core/dom';

/** Three places on the body. Each is filled whenever, in whatever order. */
export type Slot = 'hat' | 'top' | 'shoes';
export const SLOTS: readonly Slot[] = ['hat', 'top', 'shoes'];

export type ScenarioId = 'sunny' | 'rainy' | 'cold' | 'bedtime';

export interface Scenario {
  id: ScenarioId;
  /** Emoji shown in the corner so the child can see the weather. */
  icon: string;
  /** Spoken when the round starts. */
  say: string;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'sunny', icon: '☀️', say: 'Trời nắng rồi, mặc đồ mát nhé!' },
  { id: 'rainy', icon: '🌧️', say: 'Trời mưa rồi, mặc đồ đi mưa nhé!' },
  { id: 'cold', icon: '❄️', say: 'Trời lạnh rồi, mặc đồ ấm nhé!' },
  { id: 'bedtime', icon: '🌙', say: 'Tới giờ đi ngủ rồi, mặc đồ ngủ nhé!' },
];

export interface Garment {
  emoji: string;
  name: string;
  slot: Slot;
  /** The weather or time this one is really made for. Wearing it anywhere else is allowed, and funny. */
  suits: readonly ScenarioId[];
}

export const GARMENTS: readonly Garment[] = [
  { emoji: '👒', name: 'mũ rộng vành', slot: 'hat', suits: ['sunny'] },
  { emoji: '🧢', name: 'mũ lưỡi trai', slot: 'hat', suits: ['sunny', 'cold'] },
  { emoji: '⛑️', name: 'mũ đi mưa', slot: 'hat', suits: ['rainy', 'cold'] },
  { emoji: '🎀', name: 'cái nơ', slot: 'hat', suits: ['bedtime'] },
  { emoji: '👑', name: 'vương miện', slot: 'hat', suits: [] },
  { emoji: '🎩', name: 'mũ tròn', slot: 'hat', suits: [] },
  { emoji: '👕', name: 'áo phông', slot: 'top', suits: ['sunny'] },
  { emoji: '👚', name: 'áo mát', slot: 'top', suits: ['sunny'] },
  { emoji: '🦺', name: 'áo mưa', slot: 'top', suits: ['rainy'] },
  { emoji: '🧥', name: 'áo khoác', slot: 'top', suits: ['rainy', 'cold'] },
  { emoji: '🧣', name: 'khăn len', slot: 'top', suits: ['cold'] },
  { emoji: '👘', name: 'đồ ngủ', slot: 'top', suits: ['bedtime'] },
  { emoji: '🩴', name: 'dép', slot: 'shoes', suits: ['sunny'] },
  { emoji: '👟', name: 'giày thể thao', slot: 'shoes', suits: ['sunny'] },
  { emoji: '🥾', name: 'ủng', slot: 'shoes', suits: ['rainy', 'cold'] },
  { emoji: '🧦', name: 'tất ấm', slot: 'shoes', suits: ['cold', 'bedtime'] },
  { emoji: '👞', name: 'giày da', slot: 'shoes', suits: [] },
  { emoji: '👠', name: 'giày cao gót', slot: 'shoes', suits: [] },
];

/** Garments laid out for a child to choose from, per slot. */
export const OFFER_COUNT = 3;

export interface DressRound {
  scenario: Scenario;
  offers: Record<Slot, Garment[]>;
}

export function fits(g: Garment, scenario: Scenario): boolean {
  return g.suits.includes(scenario.id);
}

/** Every slot offers one garment that suits the day and the rest that do not, shuffled. */
export function makeDressRound(rng: () => number = Math.random, excludeId?: ScenarioId): DressRound {
  const pool = SCENARIOS.filter((s) => s.id !== excludeId);
  const scenario = pool[randInt(0, pool.length - 1, rng)] ?? SCENARIOS[0]!;
  const offers = {} as Record<Slot, Garment[]>;
  for (const slot of SLOTS) {
    const all = GARMENTS.filter((g) => g.slot === slot);
    const good = pick(
      all.filter((g) => fits(g, scenario)),
      1,
      rng,
    );
    const odd = pick(
      all.filter((g) => !fits(g, scenario)),
      OFFER_COUNT - 1,
      rng,
    );
    offers[slot] = shuffle([...good, ...odd], rng);
  }
  return { scenario, offers };
}

/** Said when something is put on. Never a "wrong": an odd choice is simply funny. */
export const CHEER_FIT = ['Đẹp quá!', 'Vừa xinh!', 'Hợp quá!'];
export const CHEER_ODD = ['Hihi, vui quá!', 'Ôi, ngộ nghĩnh quá!', 'Hì hì, buồn cười quá!'];

export const DRESSED_SAY = 'Xong rồi! Giờ dọn đồ chơi nào!';
export const TIDY_SAY = 'Cất đồ chơi vào hộp nhé!';
export const DONE_SAY = 'Gọn gàng quá!';

export const TOYS: readonly string[] = ['🧸', '🚗', '🪀', '🧩', '⚽', '🦆', '🪁', '🎨', '🚂'];
export const MIN_TOYS = 3;
export const MAX_TOYS = 4;

export function makeToys(rng: () => number = Math.random): string[] {
  return pick(TOYS, randInt(MIN_TOYS, MAX_TOYS, rng), rng);
}

/** Dressed once every slot has something on it, in whatever order it got there. */
export function dressed(worn: Readonly<Partial<Record<Slot, Garment>>>): boolean {
  return SLOTS.every((s) => worn[s] !== undefined);
}
