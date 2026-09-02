import { describe, it, expect } from 'vitest';
import {
  EASY_MAX_INGREDIENTS,
  EASY_ROUNDS,
  EATERS,
  makeCookRound,
  RECIPES,
  STIR_TURNS,
  TRAY_DECOYS,
  turnDelta,
} from './logic';
import { ANIMALS } from '../../core/content';
import { mulberry32 } from '../../core/dom';

/** Vietnamese names carry diacritics or the usual short function words. */
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]| /i;

describe('cooking recipes', () => {
  it('has at least 7 recipes with unique ids and Vietnamese names', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const r of RECIPES) {
      expect(r.name).toMatch(VIETNAMESE);
      expect(r.dish.length).toBeGreaterThan(0);
      expect(r.toolEmoji.length).toBeGreaterThan(0);
      expect(['pot', 'blender', 'pan', 'pizza']).toContain(r.tool);
    }
  });

  it('ingredients are unique within a recipe, named in Vietnamese, and never among the decoys', () => {
    for (const r of RECIPES) {
      expect(r.ingredients.length).toBeGreaterThanOrEqual(3);
      const emojis = r.ingredients.map((i) => i.emoji);
      expect(new Set(emojis).size).toBe(emojis.length);
      expect(r.decoys.length).toBeGreaterThanOrEqual(2);
      expect(r.decoys.length).toBeLessThanOrEqual(3);
      const decoyEmojis = r.decoys.map((d) => d.emoji);
      expect(new Set(decoyEmojis).size).toBe(decoyEmojis.length);
      for (const e of emojis) expect(decoyEmojis).not.toContain(e);
      for (const item of [...r.ingredients, ...r.decoys]) {
        expect(item.name).toMatch(VIETNAMESE);
        expect(item.emoji.length).toBeGreaterThan(0);
      }
    }
  });

  it('includes the picture recipes from the design', () => {
    const dishes = RECIPES.map((r) => r.dish);
    for (const d of ['🥤', '🍲', '🍳', '🍕', '🍜', '🥞', '🍛']) expect(dishes).toContain(d);
    expect(RECIPES.some((r) => r.ingredients.length <= EASY_MAX_INGREDIENTS)).toBe(true);
  });
});

describe('makeCookRound', () => {
  it('early rounds only use short recipes; later rounds may use any', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (let round = 0; round < EASY_ROUNDS; round++) {
        const r = makeCookRound(round, mulberry32(seed));
        expect(r.recipe.ingredients.length).toBeLessThanOrEqual(EASY_MAX_INGREDIENTS);
      }
    }
    const lengths = new Set<number>();
    for (let seed = 0; seed < 60; seed++) lengths.add(makeCookRound(5, mulberry32(seed)).recipe.ingredients.length);
    expect(Math.max(...lengths)).toBeGreaterThan(EASY_MAX_INGREDIENTS);
  });

  it('never repeats the excluded recipe', () => {
    for (let seed = 0; seed < 40; seed++) {
      const first = makeCookRound(0, mulberry32(seed)).recipe.id;
      expect(makeCookRound(0, mulberry32(seed + 1), first).recipe.id).not.toBe(first);
      const later = makeCookRound(7, mulberry32(seed)).recipe.id;
      expect(makeCookRound(7, mulberry32(seed + 1), later).recipe.id).not.toBe(later);
    }
  });

  it('tray holds every ingredient plus exactly 2 decoys, shuffled', () => {
    let reordered = false;
    for (let seed = 0; seed < 60; seed++) {
      const { recipe, tray } = makeCookRound(seed % 6, mulberry32(seed));
      expect(tray.length).toBe(recipe.ingredients.length + TRAY_DECOYS);
      for (const ing of recipe.ingredients) expect(tray.some((t) => t.emoji === ing.emoji)).toBe(true);
      const decoys = tray.filter((t) => !recipe.ingredients.some((ing) => ing.emoji === t.emoji));
      expect(decoys.length).toBe(TRAY_DECOYS);
      for (const d of decoys) expect(recipe.decoys.some((x) => x.emoji === d.emoji)).toBe(true);
      expect(new Set(tray.map((t) => t.emoji)).size).toBe(tray.length);
      const ingOrder = tray.filter((t) => recipe.ingredients.some((ing) => ing.emoji === t.emoji)).map((t) => t.emoji);
      if (ingOrder.join() !== recipe.ingredients.map((ing) => ing.emoji).join()) reordered = true;
    }
    expect(reordered).toBe(true);
  });
});

describe('turnDelta', () => {
  const c = { x: 100, y: 100 };

  it('quarter turn clockwise on screen is about +0.25', () => {
    // Right of the centre → below it (y grows downward on screen).
    expect(turnDelta({ x: 150, y: 100 }, { x: 100, y: 150 }, c)).toBeCloseTo(0.25, 5);
    expect(turnDelta({ x: 100, y: 150 }, { x: 50, y: 100 }, c)).toBeCloseTo(0.25, 5);
  });

  it('opposite direction is negative', () => {
    expect(turnDelta({ x: 100, y: 150 }, { x: 150, y: 100 }, c)).toBeCloseTo(-0.25, 5);
  });

  it('handles a small step across the ±π seam', () => {
    // Just below the left axis → just above it: a tiny clockwise nudge, not a full turn.
    const d = turnDelta({ x: 50, y: 101 }, { x: 50, y: 99 }, c);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.02);
    const back = turnDelta({ x: 50, y: 99 }, { x: 50, y: 101 }, c);
    expect(back).toBeLessThan(0);
    expect(back).toBeGreaterThan(-0.02);
  });

  it('no movement is zero and four quarter turns make one full turn', () => {
    expect(turnDelta({ x: 150, y: 100 }, { x: 150, y: 100 }, c)).toBe(0);
    const ring = [
      { x: 150, y: 100 },
      { x: 100, y: 150 },
      { x: 50, y: 100 },
      { x: 100, y: 50 },
      { x: 150, y: 100 },
    ];
    let total = 0;
    for (let k = 1; k < ring.length; k++) total += turnDelta(ring[k - 1]!, ring[k]!, c);
    expect(total).toBeCloseTo(1, 5);
    expect(STIR_TURNS).toBe(3);
  });
});

describe('EATERS', () => {
  it('are 4 distinct animals from ANIMALS', () => {
    expect(EATERS.length).toBe(4);
    expect(new Set(EATERS.map((e) => e.emoji)).size).toBe(4);
    for (const e of EATERS) expect(ANIMALS).toContainEqual(e);
  });
});
