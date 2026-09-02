import { ANIMALS, type Item } from '../../core/content';
import { pick, randInt, shuffle } from '../../core/dom';

export type Tool = 'pot' | 'blender' | 'pan' | 'pizza';

export interface Recipe {
  id: string;
  /** Vietnamese dish name, spoken when the dish is done. */
  name: string;
  /** Emoji of the finished dish. */
  dish: string;
  tool: Tool;
  /** Emoji drawn for the tool the ingredients go into. */
  toolEmoji: string;
  /** Everything that must be added, in picture-recipe order. */
  ingredients: Item[];
  /** 2–3 silly things that never belong in this dish. */
  decoys: Item[];
}

/** Full turns of the spoon needed before the dish can be cooked. */
export const STIR_TURNS = 3;

/** How many decoys share the tray with the ingredients. */
export const TRAY_DECOYS = 2;

/** Recipes with at most this many ingredients are used in the first rounds. */
export const EASY_MAX_INGREDIENTS = 3;
export const EASY_ROUNDS = 2;

const TOOL_EMOJI: Record<Tool, string> = {
  pot: '🫕',
  blender: '🫙',
  pan: '🥘',
  pizza: '🫓',
};

const i = (emoji: string, name: string): Item => ({ emoji, name });

const STRAWBERRY = i('🍓', 'quả dâu');
const BANANA = i('🍌', 'quả chuối');
const MILK = i('🥛', 'ly sữa');
const CARROT = i('🥕', 'củ cà rốt');
const CORN = i('🌽', 'bắp ngô');
const POTATO = i('🥔', 'củ khoai tây');
const WATER = i('💧', 'nước');
const EGG = i('🥚', 'quả trứng');
const BUTTER = i('🧈', 'miếng bơ');
const SALT = i('🧂', 'lọ muối');
const BREAD = i('🍞', 'ổ bánh mì');
const TOMATO = i('🍅', 'quả cà chua');
const CHEESE = i('🧀', 'miếng phô mai');
const MUSHROOM = i('🍄', 'cây nấm');
const NOODLES = i('🍜', 'vắt mì');
const GREENS = i('🥬', 'rau cải');
const FLOUR = i('🌾', 'bột mì');
const HONEY = i('🍯', 'hũ mật ong');
const RICE = i('🍚', 'bát cơm');
const ONION = i('🧅', 'củ hành');

const SOCK = i('🧦', 'chiếc tất');
const TEDDY = i('🧸', 'gấu bông');
const ROCK = i('🪨', 'hòn đá');
const FISH = i('🐟', 'con cá');
const SHOE = i('👟', 'chiếc giày');
const BRUSH = i('🪥', 'bàn chải');
const BALLOON = i('🎈', 'quả bóng bay');
const CAR = i('🚗', 'ô tô');
const PENCIL = i('✏️', 'cây bút chì');
const HAT = i('🎩', 'cái mũ');
const SPONGE = i('🧽', 'miếng bọt biển');
const BRICK = i('🧱', 'viên gạch');

function recipe(id: string, name: string, dish: string, tool: Tool, ingredients: Item[], decoys: Item[]): Recipe {
  return { id, name, dish, tool, toolEmoji: TOOL_EMOJI[tool], ingredients, decoys };
}

export const RECIPES: readonly Recipe[] = [
  recipe('strawberry-smoothie', 'sinh tố dâu', '🥤', 'blender', [STRAWBERRY, BANANA, MILK], [SOCK, ROCK, CAR]),
  recipe('veggie-soup', 'súp rau', '🍲', 'pot', [CARROT, CORN, POTATO, WATER], [TEDDY, SHOE, BALLOON]),
  recipe('fried-egg', 'trứng chiên', '🍳', 'pan', [EGG, BUTTER, SALT], [SOCK, BRUSH, TEDDY]),
  recipe('pizza', 'bánh pizza', '🍕', 'pizza', [BREAD, TOMATO, CHEESE, MUSHROOM], [ROCK, PENCIL, HAT]),
  recipe('hot-noodles', 'mì nóng', '🍜', 'pot', [WATER, NOODLES, GREENS, EGG], [SHOE, SPONGE, TEDDY]),
  recipe('pancake', 'bánh kếp', '🥞', 'pan', [EGG, MILK, FLOUR, HONEY], [FISH, SOCK, BRICK]),
  recipe('fried-rice', 'cơm chiên', '🍛', 'pan', [RICE, EGG, CARROT, ONION], [BALLOON, HAT, ROCK]),
  recipe('banana-smoothie', 'sinh tố chuối', '🍹', 'blender', [BANANA, MILK, HONEY], [FISH, BRICK, CAR]),
];

export interface CookRound {
  recipe: Recipe;
  /** Every ingredient plus `TRAY_DECOYS` decoys, shuffled. */
  tray: Item[];
}

/**
 * Pick a recipe for `round` (0-based). The first `EASY_ROUNDS` rounds only use
 * short recipes. `excludeId` skips the previous recipe unless it is the only choice.
 */
export function makeCookRound(round: number, rng: () => number = Math.random, excludeId?: string): CookRound {
  let pool: readonly Recipe[] = RECIPES;
  if (round < EASY_ROUNDS) {
    const easy = pool.filter((r) => r.ingredients.length <= EASY_MAX_INGREDIENTS);
    if (easy.length > 0) pool = easy;
  }
  const fresh = pool.filter((r) => r.id !== excludeId);
  if (fresh.length > 0) pool = fresh;
  const chosen = pool[randInt(0, pool.length - 1, rng)];
  if (!chosen) throw new Error('cooking: no recipes');
  const decoys = pick(chosen.decoys, Math.min(TRAY_DECOYS, chosen.decoys.length), rng);
  return { recipe: chosen, tray: shuffle([...chosen.ingredients, ...decoys], rng) };
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Signed rotation, in turns (fraction of a full circle, -0.5 … 0.5), that the
 * pointer made around `center` when moving from `prev` to `cur`. Screen
 * coordinates have y pointing down, so clockwise on screen is positive.
 */
export function turnDelta(prev: Pt, cur: Pt, center: Pt): number {
  const a0 = Math.atan2(prev.y - center.y, prev.x - center.x);
  const a1 = Math.atan2(cur.y - center.y, cur.x - center.x);
  let d = a1 - a0;
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d / (Math.PI * 2);
}

function animal(emoji: string): Item {
  const found = ANIMALS.find((a) => a.emoji === emoji);
  if (!found) throw new Error(`cooking: missing animal ${emoji}`);
  return found;
}

/** The hungry friends the finished dish is served to. */
export const EATERS: readonly Item[] = [animal('🐶'), animal('🐱'), animal('🐻'), animal('🐷')];
