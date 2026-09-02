import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeContext } from '../../core/testing';
import { EATERS, RECIPES, STIR_TURNS, type Recipe } from './logic';
import game from './index';

if (!('PointerEvent' in globalThis)) {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(t: string, i: PointerEventInit = {}) {
      super(t, i);
      this.pointerId = i.pointerId ?? 1;
      this.isPrimary = i.isPrimary ?? true;
    }
  };
}

function ptr(type: string, x = 0, y = 0, id = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, button: 0, isPrimary: true, bubbles: true });
}

/** Every box is the same square, so its centre is the drop point and the stir centre. */
const BOX = { left: 100, top: 100, size: 200 };
const CX = BOX.left + BOX.size / 2;
const CY = BOX.top + BOX.size / 2;

function stubRects(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: BOX.left,
    y: BOX.top,
    left: BOX.left,
    top: BOX.top,
    width: BOX.size,
    height: BOX.size,
    right: BOX.left + BOX.size,
    bottom: BOX.top + BOX.size,
    toJSON: () => ({}),
  });
}

function drop(el: Element, x = CX, y = CY): void {
  el.dispatchEvent(ptr('pointerdown', x - 30, y - 30));
  el.dispatchEvent(ptr('pointermove', x, y));
  el.dispatchEvent(ptr('pointerup', x, y));
}

function currentRecipe(stage: HTMLElement): Recipe {
  const dish = stage.querySelector('.cooking-card-dish')!.textContent;
  const r = RECIPES.find((x) => x.dish === dish);
  if (!r) throw new Error(`unknown dish ${dish}`);
  return r;
}

function trayItems(stage: HTMLElement): HTMLElement[] {
  return [...stage.querySelectorAll<HTMLElement>('.cooking-tray .cooking-item')];
}

/** Press on the scene and circle the tool centre `quarters` quarter-turns clockwise. */
function stir(stage: HTMLElement, quarters: number, radius = 80): void {
  const scene = stage.querySelector<HTMLElement>('.cooking-scene')!;
  const ring = [
    [CX, CY + radius],
    [CX - radius, CY],
    [CX, CY - radius],
    [CX + radius, CY],
  ] as const;
  scene.dispatchEvent(ptr('pointerdown', CX + radius, CY));
  for (let k = 0; k < quarters; k++) {
    const [x, y] = ring[k % 4]!;
    scene.dispatchEvent(ptr('pointermove', x, y));
  }
  window.dispatchEvent(ptr('pointerup', CX + radius, CY));
}

describe('cooking game', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts the recipe card, the tool with its bowl and a tray of ingredients + 2 decoys, then cleans up', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const r = currentRecipe(ctx.stage);
    expect(ctx.stage.querySelector('.cooking')).not.toBeNull();
    expect(ctx.stage.querySelectorAll('.cooking-card').length).toBe(1);
    expect(ctx.stage.querySelectorAll('.cooking-need').length).toBe(r.ingredients.length);
    expect(ctx.stage.querySelector('.cooking-tool')!.textContent).toBe(r.toolEmoji);
    expect(ctx.stage.querySelectorAll('.g-target.cooking-bowl').length).toBe(1);
    expect(ctx.stage.querySelector<HTMLElement>('.cooking-stove')!.hidden).toBe(true);
    expect(ctx.stage.querySelector<HTMLElement>('.cooking-dish')!.hidden).toBe(true);
    expect(ctx.stage.querySelector<HTMLElement>('.cooking-eater')!.hidden).toBe(true);

    const items = trayItems(ctx.stage);
    expect(items.length).toBe(r.ingredients.length + 2);
    for (const ing of r.ingredients) expect(items.some((el) => el.dataset.emoji === ing.emoji)).toBe(true);
    const decoys = items.filter((el) => !r.ingredients.some((ing) => ing.emoji === el.dataset.emoji));
    expect(decoys.length).toBe(2);
    for (const d of decoys) expect(r.decoys.some((x) => x.emoji === d.dataset.emoji)).toBe(true);
    // First rounds are short recipes.
    expect(r.ingredients.length).toBeLessThanOrEqual(3);
    expect(ctx.spoken[0]).toBe(`Mình nấu ${r.name} nhé!`);

    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('idle hint wiggles the next needed ingredient', () => {
    const ctx = fakeContext();
    game.start(ctx);
    const r = currentRecipe(ctx.stage);
    vi.advanceTimersByTime(6000);
    const first = trayItems(ctx.stage).find((el) => el.dataset.emoji === r.ingredients[0]!.emoji)!;
    expect(first.classList.contains('anim-wiggle')).toBe(true);
    expect(ctx.stage.querySelector('.cooking-bowl')!.classList.contains('anim-pulse')).toBe(true);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('plays a whole round: add, stir, cook, serve, then starts the next recipe', async () => {
    stubRects();
    const ctx = fakeContext();
    const chomp = vi.spyOn(ctx.audio, 'chomp');
    const boing = vi.spyOn(ctx.audio, 'boing');
    const tick = vi.spyOn(ctx.audio, 'tick');
    game.start(ctx);
    const stage = ctx.stage;
    const r = currentRecipe(stage);
    const tool = stage.querySelector<HTMLElement>('.cooking-tool')!;

    // ---- add: a decoy is refused, ingredients go in one by one ----
    const decoy = trayItems(stage).find((el) => !r.ingredients.some((ing) => ing.emoji === el.dataset.emoji))!;
    drop(decoy);
    expect(boing).toHaveBeenCalledTimes(1);
    expect(ctx.spoken).toContain('Không phải cái này');
    expect(tool.classList.contains('anim-shake')).toBe(true);
    expect(decoy.classList.contains('spring-back')).toBe(true);
    expect(trayItems(stage).length).toBe(r.ingredients.length + 2);

    // Letting go away from the bowl does nothing.
    const firstIng = trayItems(stage).find((el) => el.dataset.emoji === r.ingredients[0]!.emoji)!;
    drop(firstIng, 900, 900);
    expect(chomp).not.toHaveBeenCalled();
    expect(firstIng.classList.contains('placed')).toBe(false);

    r.ingredients.forEach((ing, k) => {
      const el = trayItems(stage).find((x) => x.dataset.emoji === ing.emoji)!;
      drop(el);
      expect(chomp).toHaveBeenCalledTimes(k + 1);
      expect(el.classList.contains('placed')).toBe(true);
      expect(el.parentElement).toBe(stage.querySelector('.cooking-bowl'));
      expect(ctx.spoken).toContain(ing.name);
      const need = stage.querySelector(`.cooking-need[data-emoji="${ing.emoji}"]`)!;
      expect(need.classList.contains('done')).toBe(true);
    });
    expect(stage.querySelectorAll('.cooking-need.done').length).toBe(r.ingredients.length);
    expect(ctx.spoken).not.toContain('Khuấy đều nào!');
    vi.advanceTimersByTime(1000);
    expect(ctx.spoken).toContain('Khuấy đều nào!');
    expect(stage.querySelectorAll('.cooking-tray .cooking-item.placed').length).toBe(0);

    // ---- stir: circle the tool centre three times ----
    const spoon = stage.querySelector<HTMLElement>('.cooking-spoon')!;
    stir(stage, 4);
    expect(spoon.hidden).toBe(true);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(stage.querySelectorAll('.cooking-dot.on').length).toBe(1);
    const particle = r.tool === 'blender' ? '.cooking-spark' : '.cooking-bubble';
    expect(stage.querySelectorAll(particle).length).toBe(1);
    expect(ctx.spoken).not.toContain('Nấu thôi!');
    const scene = stage.querySelector<HTMLElement>('.cooking-scene')!;
    scene.dispatchEvent(ptr('pointerdown', CX + 80, CY));
    expect(spoon.hidden).toBe(false);
    scene.dispatchEvent(ptr('pointermove', CX, CY + 80));
    expect(spoon.style.left).toBe(`${CX - BOX.left}px`);
    window.dispatchEvent(ptr('pointercancel', CX, CY + 80));
    expect(spoon.hidden).toBe(true);
    // Counter-clockwise counts too: stirring is stirring.
    scene.dispatchEvent(ptr('pointerdown', CX, CY + 80));
    scene.dispatchEvent(ptr('pointermove', CX + 80, CY));
    window.dispatchEvent(ptr('pointerup', CX + 80, CY));
    // 1 turn + two quarter nudges = 1.5 turns so far; one more turn is still short of 3.
    stir(stage, 4);
    expect(ctx.spoken).not.toContain('Nấu thôi!');
    expect(stage.querySelectorAll('.cooking-dot.on').length).toBe(2);
    stir(stage, 2);
    expect(ctx.spoken).toContain('Nấu thôi!');
    expect(stage.querySelectorAll('.cooking-dot.on').length).toBe(STIR_TURNS);
    expect(tick).toHaveBeenCalledTimes(STIR_TURNS);
    const stove = stage.querySelector<HTMLElement>('.cooking-stove')!;
    expect(stove.hidden).toBe(false);
    // Stirring after the pot is done changes nothing.
    stir(stage, 4);
    expect(tick).toHaveBeenCalledTimes(STIR_TURNS);

    // ---- cook: tap the stove, steam rises, the dish pops out ----
    const dish = stage.querySelector<HTMLElement>('.cooking-dish')!;
    stove.dispatchEvent(ptr('pointerdown', CX, CY));
    expect(stove.classList.contains('on')).toBe(true);
    expect(tool.classList.contains('anim-pulse')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(stage.querySelectorAll('.cooking-steam').length).toBeGreaterThan(0);
    expect(dish.hidden).toBe(true);
    // A second tap while cooking is ignored.
    stove.dispatchEvent(ptr('pointerdown', CX, CY));
    vi.advanceTimersByTime(1500);
    expect(dish.hidden).toBe(false);
    expect(dish.textContent).toBe(r.dish);
    expect(dish.classList.contains('anim-bounce')).toBe(true);
    expect(tool.classList.contains('anim-pulse')).toBe(false);
    expect(stove.hidden).toBe(true);
    expect(ctx.spoken).toContain(`Xong rồi! ${r.name}`);
    vi.advanceTimersByTime(1000);
    expect(stage.querySelectorAll('.cooking-steam').length).toBe(0);

    // ---- serve: a hungry friend slides in, drag the dish to its mouth ----
    const eater = stage.querySelector<HTMLElement>('.cooking-eater')!;
    expect(eater.hidden).toBe(false);
    expect(EATERS.map((e) => e.emoji)).toContain(stage.querySelector('.cooking-eater-face')!.textContent);
    expect(stage.querySelector('.cooking-eater-body')!.classList.contains('cooking-slide')).toBe(true);
    const chompsBefore = chomp.mock.calls.length;
    drop(dish, 900, 900);
    expect(dish.classList.contains('placed')).toBe(false);
    drop(dish);
    expect(dish.classList.contains('placed')).toBe(true);
    expect(dish.parentElement).toBe(stage.querySelector('.cooking-mouth'));
    expect(chomp).toHaveBeenCalledTimes(chompsBefore + 1);
    expect(ctx.spoken).toContain('Ngon quá! Cảm ơn bé!');
    expect(stage.querySelector('.cooking-eater-face')!.classList.contains('anim-bounce')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(chomp).toHaveBeenCalledTimes(chompsBefore + 3);
    expect(ctx.celebrations).toBe(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(ctx.celebrations).toBe(1);
    expect(ctx.stars).toBe(1);

    // ---- next round: a different recipe, fresh tray ----
    const next = currentRecipe(stage);
    expect(next.id).not.toBe(r.id);
    expect(trayItems(stage).length).toBe(next.ingredients.length + 2);
    expect(stage.querySelectorAll('.cooking-need.done').length).toBe(0);
    expect(dish.hidden).toBe(true);
    expect(dish.parentElement).toBe(scene);
    expect(eater.hidden).toBe(true);
    expect(stove.hidden).toBe(true);
    expect(ctx.spoken.filter((s) => s.startsWith('Mình nấu')).length).toBe(2);

    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaving mid-cook clears the steam interval and never finishes the dish', () => {
    stubRects();
    const ctx = fakeContext();
    game.start(ctx);
    const stage = ctx.stage;
    const r = currentRecipe(stage);
    for (const ing of r.ingredients) drop(trayItems(stage).find((x) => x.dataset.emoji === ing.emoji)!);
    vi.advanceTimersByTime(1000);
    stir(stage, 4 * STIR_TURNS);
    expect(ctx.spoken).toContain('Nấu thôi!');
    stage.querySelector<HTMLElement>('.cooking-stove')!.dispatchEvent(ptr('pointerdown', CX, CY));
    vi.advanceTimersByTime(700);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    ctx.cleanup();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(ctx.spoken.some((s) => s.startsWith('Xong rồi'))).toBe(false);
    expect(ctx.celebrations).toBe(0);
  });
});
