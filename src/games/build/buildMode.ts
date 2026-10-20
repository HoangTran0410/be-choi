import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable } from '../../core/drag';
import { onHold } from '../../core/hold';
import { readRaw, writeRaw } from '../../core/save';
import { makeTappable } from '../../core/tap';
import {
  BRICK_COLORS,
  BRICK_SIZES,
  brickAt,
  canPlace,
  centerOffset,
  colorName,
  deserialize,
  dropY,
  emptyBoard,
  modelProgress,
  nextBrick,
  place,
  refitBoard,
  removeBrick,
  serialize,
  shiftModel,
  type Board,
  type Brick,
  type BrickSize,
  type Model,
  type Suggestion,
} from '../bricks/logic';
import { describeStep, pickBlueprint } from './levels';
import { workFromBoard } from './store';
import type { ModeCtl, Workshop } from './types';
import { sayLines, speakText } from '../../core/say';

/** localStorage key of the free build, so a half-built castle is still there tomorrow. */
export const FREE_KEY = 'be-choi:build:bricks';
/** A capture of the free build needs this many bricks to be worth a star. */
const STAR_BRICKS = 6;

type Sub = 'blueprint' | 'free';

function isPortrait(): boolean {
  if (typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(orientation: portrait)').matches;
    } catch {
      /* fall through */
    }
  }
  return window.innerHeight > window.innerWidth;
}

/** 10×8 in landscape, 8×10 in portrait (mirrors the `@media (orientation)` rules in style.css). */
function plateDims(portrait: boolean): { cols: number; rows: number } {
  return portrait ? { cols: 8, rows: 10 } : { cols: 10, rows: 8 };
}

function brickNode(size: BrickSize, color: string, x = 0, y = 0): HTMLElement {
  return h('div', { class: 'bw-brick', style: `--w:${size.w};--h:${size.h};--x:${x};--y:${y};--bw-color:${color}` });
}

function signature(board: Board): string {
  return board.bricks
    .map((b) => `${b.x},${b.y},${b.w},${b.h},${b.color}`)
    .sort()
    .join('|');
}

/**
 * Xây tự do: build with bricks on a studded plate, with gravity. Two ways: by blueprint (a faint
 * shadow of the whole model, the next brick glowing and said aloud, step by step) or free (kept on
 * the device). The 📸 button puts what is on the plate into the display cabinet.
 */
export function createBuildMode(w: Workshop): ModeCtl {
  const { ctx } = w;
  let alive = true;
  let active = false;
  let sub: Sub = 'blueprint';
  let portrait = isPortrait();
  let board: Board = emptyBoard(plateDims(portrait).cols, plateDims(portrait).rows);
  let freeBoard: Board | null = null;
  let color = BRICK_COLORS[0] as string;
  let modelBase: Model | null = null;
  let model: Model | null = null;
  let modelOffset = 0;
  let celebrating = false;
  let started = false;
  let lastModelId: string | undefined;
  let lastShot = '';
  let step: Suggestion | null = null;
  /** The brick picked by a tap in the dock: a tap on the plate then puts it down there. */
  let selected: BrickSize | null = null;

  const disposers: Array<() => void> = [];
  const brickDisposers = new Map<HTMLElement, () => void>();

  const ghost = h('div', { class: 'bw-bk-ghost' });
  const next = h('div', { class: 'bw-bk-next', hidden: true });
  const layer = h('div', { class: 'bw-bk-layer' });
  const plate = h('div', { class: 'bw-bk-plate' }, ghost, next, layer);
  const caption = h('div', { class: 'bw-caption bw-bk-caption', 'aria-live': 'polite' });
  const flash = h('div', { class: 'bw-flash' });
  const area = h('div', { class: 'bw-bk-area' }, plate, caption, flash);
  // The dock is a thin strip (a row under the plate in portrait, a narrow column beside it in
  // landscape) so the plate gets the room. Bricks and the few buttons sit in the strip; the colours
  // fold into a palette that opens from one chip, over the plate, only when asked for.
  const pieces = h('div', { class: 'bw-bk-pieces' });
  const colors = h('div', { class: 'bw-bk-colors' });
  const palette = h('div', { class: 'bw-bk-palette', hidden: true, role: 'listbox', 'aria-label': 'Chọn màu' }, colors);
  const actions = h('div', { class: 'bw-bk-actions' });
  const tools = h('div', { class: 'bw-bk-tools' }, actions);
  const tray = h('div', { class: 'bw-bk-tray' }, pieces, tools);
  const dock = h('div', { class: 'bw-bk-dock' }, tray, palette);
  const el = h('section', { class: 'bw-mode bw-bk', 'data-sub': sub }, area, dock);

  // ---- geometry ----

  function setPlateDims(): void {
    el.style.setProperty('--bw-cols', String(board.cols));
    el.style.setProperty('--bw-rows', String(board.rows));
  }

  /** Square cells that fill the area left by the tray. jsdom has no layout: keep the CSS default. */
  function fit(): void {
    const a = area.getBoundingClientRect();
    if (a.width <= 0 || a.height <= 0) return;
    const cs = getComputedStyle(area);
    const aw = a.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const ah = a.height - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    // A plate whose shape is far from the area's leaves bare margins: widen it (never narrow it, so
    // no brick is ever lost) until it is closer. Rotation goes back to the base shape first.
    const base = plateDims(portrait);
    const wide = portrait ? aw / ah > 0.8 : aw / ah > 1.4;
    const want = wide ? { cols: base.cols + 2, rows: base.rows } : base;
    if (want.cols > board.cols && want.rows >= board.rows) {
      applyDims(want.cols, want.rows);
      return fit();
    }
    const cell = Math.floor(Math.min(aw / board.cols, ah / board.rows));
    if (cell > 0) el.style.setProperty('--bw-cell', `${cell}px`);
  }

  /** Put a brick of `size` (in the current colour) with its middle over `clientX`. */
  const dropAtX = (size: BrickSize, clientX: number): boolean => {
    const r = plate.getBoundingClientRect();
    const cell = plateCell(r);
    if (cell <= 0) return false;
    const col = clampCol(Math.round((clientX - r.left) / cell - size.w / 2), size.w);
    return dropTemplate(size, col);
  };

  const plateCell = (rect: DOMRect): number => (rect.width > 0 ? rect.width / board.cols : 0);
  const overPlate = (p: { x: number; y: number }, rect: DOMRect, cell: number): boolean =>
    cell > 0 && hitTest(p, [{ id: 'plate', rect }], cell * 0.5) !== null;
  const clampCol = (col: number, bw: number): number => Math.max(0, Math.min(board.cols - bw, col));
  const withDims = (b: Board): Board => (b.cols === board.cols && b.rows === board.rows ? b : refitBoard(b, board.cols, board.rows));

  // ---- bricks on the plate ----

  function addBrickEl(brick: Brick, land: boolean): HTMLElement {
    const node = brickNode(brick, brick.color, brick.x, brick.y);
    node.dataset.id = String(brick.id);
    let grabDx = 0;
    let lifted: Brick | null = null;
    const down = (e: PointerEvent): void => {
      const b = board.bricks.find((k) => k.id === Number(node.dataset.id));
      if (!b) return;
      const r = plate.getBoundingClientRect();
      const cell = plateCell(r);
      grabDx = cell > 0 ? e.clientX - (r.left + b.x * cell) : 0;
    };
    node.addEventListener('pointerdown', down);
    const dispose = makeDraggable(node, {
      onStart() {
        ctx.hint.touch();
        lifted = board.bricks.find((k) => k.id === Number(node.dataset.id)) ?? null;
        if (lifted) board = removeBrick(board, lifted.id);
      },
      onDrop(_n, p) {
        const b = lifted;
        lifted = null;
        if (!b) return false;
        const r = plate.getBoundingClientRect();
        const cell = plateCell(r);
        if (!overPlate(p, r, cell)) {
          // Lifted off the plate: the brick goes back in the box.
          discard(node);
          ctx.audio.pop(0.7);
          navigator.vibrate?.(10);
          afterChange();
          return false;
        }
        const col = clampCol(Math.round((p.x - grabDx - r.left) / cell), b.w);
        let x = col;
        let y = dropY(board, col, b.w, b.h);
        if (y === null) {
          if (!canPlace(board, b.x, b.y, b.w, b.h)) {
            discard(node);
            ctx.audio.pop(0.7);
            afterChange();
            return false;
          }
          x = b.x;
          y = b.y;
          ctx.audio.boing();
        } else {
          ctx.audio.tick();
          ctx.audio.pop(1.4);
          navigator.vibrate?.(10);
        }
        discard(node);
        board = place(board, { x, y, w: b.w, h: b.h, color: b.color });
        addBrickEl(board.bricks[board.bricks.length - 1] as Brick, true);
        afterChange();
        return false;
      },
    });
    brickDisposers.set(node, () => {
      node.removeEventListener('pointerdown', down);
      dispose();
    });
    if (land) node.classList.add('bw-land');
    layer.append(node);
    return node;
  }

  function discard(node: HTMLElement): void {
    brickDisposers.get(node)?.();
    brickDisposers.delete(node);
    node.remove();
  }

  function rebuild(): void {
    for (const node of [...brickDisposers.keys()]) discard(node);
    for (const b of board.bricks) addBrickEl(b, false);
  }

  // ---- blueprint: the faint whole, the glowing next brick ----

  function renderGhost(): void {
    ghost.replaceChildren(
      ...(model?.cells ?? []).map((c) => h('div', { class: 'bw-bk-ghost-cell', style: `--x:${c.x};--y:${c.y};--bw-color:${c.color}` })),
    );
  }

  /** Show (and optionally say) the next brick of the blueprint. */
  function markNext(): void {
    for (const t of templates) t.classList.toggle('next', !!step && Number(t.dataset.w) === step.w && Number(t.dataset.h) === step.h);
    chip.classList.toggle('need', !!step && step.color !== color);
  }

  function showStep(say: boolean): void {
    step = null;
    next.hidden = true;
    markNext();
    if (sub !== 'blueprint' || !model) return;
    const progress = modelProgress(board, model);
    caption.textContent = `${modelBase?.name ?? ''} · ${progress.done}/${progress.total}`;
    caption.classList.add('show');
    if (progress.complete) return;
    step = nextBrick(board, model);
    if (!step) {
      // Every missing cell is under a brick of the wrong colour: point at one, no scolding.
      let wrong: Brick | undefined;
      for (const c of model.cells) {
        const b = brickAt(board, c.x, c.y);
        if (b && b.color !== c.color) {
          wrong = b;
          break;
        }
      }
      if (wrong) {
        const node = layer.querySelector<HTMLElement>(`[data-id="${wrong.id}"]`);
        if (node) replay(node, 'anim-wiggle');
      }
      if (say && active) speakText(ctx, 'Thử đổi gạch khác màu nhé');
      return;
    }
    const y = dropY(board, step.x, step.w, step.h) ?? 0;
    next.hidden = false;
    next.style.cssText = `--x:${step.x};--y:${y};--w:${step.w};--h:${step.h};--bw-color:${step.color}`;
    selectColor(step.color, false);
    selectPiece({ w: step.w, h: step.h }, true);
    markNext();
    if (say && active) speakText(ctx, describeStep(step));
  }

  function afterChange(): void {
    if (sub === 'free') {
      writeRaw(FREE_KEY, serialize(board));
      return;
    }
    if (!model || celebrating) return;
    if (modelProgress(board, model).complete) void finish();
    else showStep(true);
  }

  async function finish(): Promise<void> {
    const done = modelBase;
    celebrating = true;
    ctx.hint.clear();
    next.hidden = true;
    replay(plate, 'anim-bounce');
    caption.textContent = `${done?.name ?? ''} xong rồi!`;
    // The finished model goes into the cabinet by itself.
    const work = workFromBoard(board, done?.name ?? '', Date.now());
    if (work) w.addWork(work);
    if (done) speakText(ctx, `Bé xây xong ${done.name}`);
    await ctx.celebrate();
    if (!alive) return;
    const unlocked = w.award('build');
    celebrating = false;
    if (unlocked.length && active) speakText(ctx, `Có bản vẽ mới rồi! ${unlocked.join(', ')}`);
    w.later(
      () => {
        if (alive && sub === 'blueprint') startBlueprint(true);
      },
      unlocked.length ? 1800 : 600,
    );
  }

  function startBlueprint(announce: boolean): void {
    const m = pickBlueprint(w.stars('build'), Math.random, lastModelId);
    lastModelId = m.id;
    modelBase = m;
    modelOffset = centerOffset(m, board.cols);
    model = shiftModel(m, modelOffset);
    el.dataset.model = m.id;
    board = emptyBoard(board.cols, board.rows);
    syncColors();
    rebuild();
    renderGhost();
    showStep(false);
    // One sequence, so the first sentence is never cut off by the step's brick.
    if (announce && active) void sayLines(ctx, step ? [`Mình xây ${m.name} nhé`, describeStep(step)] : [`Mình xây ${m.name} nhé`]);
    armHint();
  }

  function setSub(nextSub: Sub, announce = true): void {
    if (nextSub === sub && started) return;
    const was = sub;
    const wasStarted = started;
    started = true;
    sub = nextSub;
    el.dataset.sub = sub;
    toggleBtn.firstElementChild!.textContent = sub === 'free' ? '📐' : '✋';
    toggleBtn.setAttribute('aria-label', sub === 'free' ? 'Xây theo bản vẽ' : 'Xây tự do');
    refreshButtons();
    if (sub === 'blueprint') {
      // Park the free build (when we come from it) so the blueprint gets a clean plate.
      if (wasStarted && was === 'free') freeBoard = board;
      startBlueprint(announce);
      return;
    }
    modelBase = null;
    model = null;
    step = null;
    next.hidden = true;
    delete el.dataset.model;
    selectPiece(null, true);
    celebrating = false;
    board = freeBoard ? withDims(freeBoard) : emptyBoard(board.cols, board.rows);
    freeBoard = null;
    caption.textContent = '';
    caption.classList.remove('show');
    syncColors();
    renderGhost();
    rebuild();
    if (announce && active) speakText(ctx, 'Xây tuỳ thích nhé');
    armHint();
  }

  // ---- tray ----

  function dropTemplate(size: BrickSize, x: number): boolean {
    const y = dropY(board, x, size.w, size.h);
    if (y === null) return false;
    board = place(board, { x, y, w: size.w, h: size.h, color });
    addBrickEl(board.bricks[board.bricks.length - 1] as Brick, true);
    ctx.audio.tick();
    ctx.audio.pop(1.4);
    navigator.vibrate?.(10);
    afterChange();
    return true;
  }

  const templates = BRICK_SIZES.map((size) => {
    const piece = h(
      'div',
      { class: 'bw-bk-piece', 'data-w': size.w, 'data-h': size.h, 'aria-label': `gạch ${size.w} nhân ${size.h}` },
      brickNode(size, color),
    );
    let downAt = { x: 0, y: 0 };
    const mark = (e: PointerEvent): void => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    piece.addEventListener('pointerdown', mark);
    disposers.push(() => piece.removeEventListener('pointerdown', mark));
    disposers.push(
      makeDraggable(piece, {
        onStart(node) {
          node.classList.remove('anim-wiggle');
          ctx.hint.touch();
        },
        onDrop(_n, p) {
          // A tap, not a drag: pick this brick, then a tap on the plate puts it down.
          if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < 10) {
            selectPiece(size);
            return false;
          }
          const r = plate.getBoundingClientRect();
          const cell = plateCell(r);
          if (!overPlate(p, r, cell)) {
            ctx.audio.boing();
            return false;
          }
          const col = clampCol(Math.round((p.x - r.left) / cell - size.w / 2), size.w);
          if (!dropTemplate(size, col)) ctx.audio.boing();
          // The template always springs back; the plate got its own brick.
          return false;
        },
      }),
    );
    return piece;
  });
  pieces.append(...templates);

  function selectPiece(size: BrickSize | null, quiet = false): void {
    selected = size;
    for (const t of templates) t.classList.toggle('sel', size !== null && Number(t.dataset.w) === size.w && Number(t.dataset.h) === size.h);
    if (size && !quiet) {
      ctx.audio.tick();
      ctx.hint.touch();
    }
  }

  // Tap the plate (not a brick) with a brick picked: it goes down there.
  const onPlateTap = (e: PointerEvent): void => {
    if (!selected || !e.isPrimary || (e.target as HTMLElement).closest('.bw-brick')) return;
    ctx.hint.touch();
    if (!dropAtX(selected, e.clientX)) ctx.audio.boing();
  };
  plate.addEventListener('pointerup', onPlateTap);
  disposers.push(() => plate.removeEventListener('pointerup', onPlateTap));

  const colorBtns = BRICK_COLORS.map((c) => {
    const btn = h('button', {
      class: 'bw-bk-color',
      type: 'button',
      style: `--bw-color:${c}`,
      'data-color': c,
      'aria-label': colorName(c),
    });
    makeTappable(btn, () => selectColor(c, true), { cooldownMs: 0, ctx });
    return btn;
  });

  function selectColor(c: string, speak: boolean): void {
    color = c;
    chipSwatch.style.setProperty('--bw-color', c);
    markNext();
    if (speak) closePalette();
    for (const b of colorBtns) b.classList.toggle('active', b.dataset.color === c);
    for (const t of templates) t.querySelector<HTMLElement>('.bw-brick')?.style.setProperty('--bw-color', c);
    if (speak) {
      ctx.hint.touch();
      ctx.audio.tick();
      speakText(ctx, colorName(c));
    }
  }

  /** In a blueprint only the colours the model uses are shown; free building has them all. */
  function syncColors(): void {
    const used = sub === 'blueprint' && modelBase ? new Set(modelBase.cells.map((c) => c.color)) : null;
    for (const b of colorBtns) b.hidden = used !== null && !used.has(b.dataset.color ?? '');
    if (used && !used.has(color)) selectColor([...used][0] ?? color, false);
    else selectColor(color, false);
    // One colour only: nothing to choose, so no chip.
    chip.hidden = used !== null && used.size <= 1;
    closePalette();
  }

  const chipSwatch = h('span', { class: 'bw-bk-swatch' });
  const chip = h(
    'button',
    { class: 'bw-bk-btn bw-bk-chip', type: 'button', 'aria-label': 'Chọn màu', 'aria-expanded': 'false' },
    chipSwatch,
  );
  makeTappable(chip, () => (palette.hidden ? openPalette() : closePalette()), { cooldownMs: 150, ctx });

  function openPalette(): void {
    palette.hidden = false;
    chip.setAttribute('aria-expanded', 'true');
    ctx.hint.touch();
    ctx.audio.tick();
  }
  function closePalette(): void {
    palette.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
  }
  // A tap anywhere else folds the palette away.
  const outside = (e: PointerEvent): void => {
    const t = e.target as Node | null;
    if (!palette.hidden && t && !palette.contains(t) && !chip.contains(t)) closePalette();
  };
  document.addEventListener('pointerdown', outside, true);
  disposers.push(() => document.removeEventListener('pointerdown', outside, true));

  const toggleBtn = h('button', { class: 'bw-bk-btn', type: 'button', 'aria-label': 'Xây tự do' }, h('span', { class: 'bw-ico' }, '✋'));
  makeTappable(toggleBtn, () => setSub(sub === 'free' ? 'blueprint' : 'free'), { cooldownMs: 300, ctx });

  const skipBtn = h(
    'button',
    { class: 'bw-bk-btn bw-bk-skip', type: 'button', 'aria-label': 'Bản vẽ khác' },
    h('span', { class: 'bw-ico' }, '🔄'),
  );
  makeTappable(
    skipBtn,
    () => {
      if (sub !== 'blueprint' || celebrating) return;
      ctx.audio.pop();
      startBlueprint(true);
    },
    { cooldownMs: 400, ctx },
  );

  const shotBtn = h(
    'button',
    { class: 'bw-bk-btn bw-bk-shot', type: 'button', 'aria-label': 'Chụp tác phẩm' },
    h('span', { class: 'bw-ico' }, '📸'),
  );
  makeTappable(shotBtn, capture, { cooldownMs: 600, ctx });

  const trash = h(
    'button',
    { class: 'bw-bk-btn bw-bk-trash', type: 'button', 'aria-label': 'Giữ để dọn hết' },
    h('span', { class: 'bw-ico' }, '🗑️'),
  );
  disposers.push(onHold(trash, 700, clearPlate));

  actions.append(chip, toggleBtn, skipBtn, shotBtn, trash);
  colors.append(...colorBtns);

  function refreshButtons(): void {
    skipBtn.hidden = sub !== 'blueprint';
  }

  /** 📸: what is on the plate goes into the cabinet. A new free build of a few bricks also earns a star. */
  function capture(): void {
    const name = sub === 'blueprint' && modelBase ? modelBase.name : 'Tác phẩm của bé';
    const work = workFromBoard(board, name, Date.now());
    if (!work) {
      ctx.audio.boing();
      speakText(ctx, 'Mình xây gì đó rồi chụp nhé');
      return;
    }
    w.addWork(work);
    replay(flash, 'bw-flash-go');
    ctx.audio.fx('sparkle');
    navigator.vibrate?.(20);
    speakText(ctx, 'Tách! Đã cất vào tủ rồi');
    ctx.hint.touch();
    const sig = signature(board);
    if (sub === 'free' && board.bricks.length >= STAR_BRICKS && sig !== lastShot) {
      lastShot = sig;
      const unlocked = w.award('build');
      if (unlocked.length) w.later(() => alive && active && speakText(ctx, `Có bản vẽ mới rồi! ${unlocked.join(', ')}`), 3200);
    }
  }

  function clearPlate(): void {
    board = emptyBoard(board.cols, board.rows);
    rebuild();
    ctx.audio.tick();
    navigator.vibrate?.(20);
    replay(trash, 'anim-bounce');
    afterChange();
    if (sub === 'blueprint') showStep(true);
  }

  // ---- idle hint ----

  function armHint(): void {
    w.arm(() => {
      if (sub === 'blueprint' && model) {
        if (!step) return;
        const s = step;
        const dot = s.color !== color ? colorBtns.find((b) => b.dataset.color === s.color) : null;
        if (dot) replay(dot, 'anim-wiggle');
        else {
          const t = templates.find((p) => Number(p.dataset.w) === s.w && Number(p.dataset.h) === s.h);
          if (t) replay(t, 'anim-wiggle');
        }
        replay(next, 'anim-pulse');
        speakText(ctx, describeStep(s));
        return;
      }
      const t = templates[Math.floor(Math.random() * templates.length)];
      if (t) replay(t, 'anim-wiggle');
    });
  }

  // ---- orientation and lifecycle ----

  function onResize(): void {
    const p = isPortrait();
    if (p !== portrait) {
      portrait = p;
      const { cols, rows } = plateDims(p);
      applyDims(cols, rows);
    }
    fit();
  }

  /** The same bricks (and the blueprint, re-centred) on a `cols × rows` plate. */
  function applyDims(cols: number, rows: number): void {
    if (cols === board.cols && rows === board.rows) return;
    if (sub === 'blueprint' && modelBase) {
      const offset = centerOffset(modelBase, cols);
      board = refitBoard(board, cols, rows, offset - modelOffset);
      modelOffset = offset;
      model = shiftModel(modelBase, offset);
    } else {
      board = refitBoard(board, cols, rows);
    }
    if (freeBoard) freeBoard = refitBoard(freeBoard, cols, rows);
    setPlateDims();
    rebuild();
    renderGhost();
    showStep(false);
    if (sub === 'free') writeRaw(FREE_KEY, serialize(board));
  }

  // The tray changes height with the colours it shows: refit the plate whenever the area changes.
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(() => fit());
    observer.observe(area);
  }

  const raw = readRaw(FREE_KEY);
  const saved = raw ? deserialize(raw) : null;
  if (saved) freeBoard = withDims(saved);
  setPlateDims();

  return {
    el,
    enter() {
      active = true;
      if (!started) {
        // Open on a blueprint; the free build waits (with what the child left in it) one tap away.
        setSub('blueprint', true);
      } else {
        showStep(false);
        armHint();
      }
      fit();
    },
    leave() {
      active = false;
      ctx.hint.clear();
    },
    relayout: onResize,
    destroy() {
      alive = false;
      observer?.disconnect();
      disposers.forEach((d) => d());
      for (const d of brickDisposers.values()) d();
      brickDisposers.clear();
    },
  };
}
