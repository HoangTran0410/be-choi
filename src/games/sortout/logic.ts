import { pick, shuffle } from '../../core/dom';

export type CategoryId = 'toys' | 'clothes' | 'fruit';

export interface Thing {
  emoji: string;
  /** Vietnamese name, spoken when put away. */
  name: string;
}

export interface Category {
  id: CategoryId;
  /** Emoji of the box / wardrobe / basket. */
  bin: string;
  /** Vietnamese name of the bin. */
  binName: string;
  things: readonly Thing[];
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'toys',
    bin: '📦',
    binName: 'hộp đồ chơi',
    things: [
      { emoji: '🧸', name: 'gấu bông' },
      { emoji: '🚗', name: 'ô tô' },
      { emoji: '⚽', name: 'quả bóng' },
      { emoji: '🪁', name: 'cái diều' },
      { emoji: '🎲', name: 'xúc xắc' },
    ],
  },
  {
    id: 'clothes',
    bin: '🚪',
    binName: 'tủ quần áo',
    things: [
      { emoji: '👕', name: 'cái áo' },
      { emoji: '👖', name: 'cái quần' },
      { emoji: '🧦', name: 'đôi tất' },
      { emoji: '🧢', name: 'cái mũ' },
      { emoji: '👗', name: 'cái váy' },
    ],
  },
  {
    id: 'fruit',
    bin: '🧺',
    binName: 'rổ trái cây',
    things: [
      { emoji: '🍎', name: 'quả táo' },
      { emoji: '🍌', name: 'quả chuối' },
      { emoji: '🍇', name: 'chùm nho' },
      { emoji: '🍊', name: 'quả cam' },
      { emoji: '🍓', name: 'quả dâu' },
    ],
  },
];

export interface SortItem extends Thing {
  /** Unique within a round. */
  id: string;
  category: CategoryId;
}

export interface SortRound {
  /** Bins on the board, in display order. */
  bins: Category[];
  /** Everything to put away, shuffled. */
  items: SortItem[];
}

/** Round 0 has 2 bins, later rounds 3. */
export function binCount(roundIndex: number): number {
  return roundIndex < 1 ? 2 : 3;
}

export const ITEMS_PER_BIN = 2;

export function makeSortRound(roundIndex: number, rng: () => number = Math.random): SortRound {
  const bins = pick(CATEGORIES, binCount(roundIndex), rng);
  const items = bins.flatMap((c) =>
    pick(c.things, ITEMS_PER_BIN, rng).map((t) => ({ ...t, id: `${c.id}-${t.emoji}`, category: c.id })),
  );
  return { bins, items: shuffle(items, rng) };
}

export function categoryOf(id: CategoryId): Category {
  const c = CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`unknown category ${id}`);
  return c;
}
