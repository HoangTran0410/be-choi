import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable } from '../../core/drag';
import { onHold } from '../../core/hold';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  BRICK_COLORS,
  BRICK_SIZES,
  FREE_STAR_AFTER,
  canPlace,
  centerOffset,
  colorName,
  deserialize,
  dropY,
  emptyBoard,
  modelFor,
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
} from './logic';
import './style.css';

/** localStorage key of the free-mode build. */
export const STORAGE_KEY = 'be-choi:bricks';

type Mode = 'free' | 'model';

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

function loadSaved(): Board | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

function save(board: Board): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(board));
  } catch {
    /* quota or blocked storage: the build lives in memory only */
  }
}

/** A brick drawing; geometry and colour live in custom properties so the same node works in the tray and on the plate. */
function brickNode(size: BrickSize, color: string, x = 0, y = 0): HTMLElement {
  return h('div', {
    class: 'bricks-brick',
    style: `--w:${size.w};--h:${size.h};--x:${x};--y:${y};--bricks-color:${color}`,
  });
}

/**
 * Brick builder: drag templates from the tray onto a studded plate where they
 * drop with gravity; drag placed bricks around or off the plate to remove them.
 * Free mode keeps the build in localStorage; model mode shows a translucent
 * target to copy and celebrates when every cell is covered in the right colour.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let mode: Mode = 'free';
  let portrait = isPortrait();
  let board: Board = emptyBoard(plateDims(portrait).cols, plateDims(portrait).rows);
  /** The free build, parked while the child copies a model. */
  let freeBoard: Board | null = null;
  let color = BRICK_COLORS[0] as string;
  /** The current model as authored (left-aligned) and as drawn (centred on the plate). */
  let modelBase: Model | null = null;
  let model: Model | null = null;
  let modelOffset = 0;
  let round = 0;
  let celebrating = false;
  let freePlaced = 0;
  let freeStar = false;

  const disposers: Array<() => void> = [];
  const brickDisposers = new Map<HTMLElement, () => void>();

  const ghost = h('div', { class: 'bricks-ghost' });
  const layer = h('div', { class: 'bricks-layer' });
  const plate = h('div', { class: 'bricks-plate' }, ghost, layer);
  const area = h('div', { class: 'bricks-area' }, plate);
  const pieces = h('div', { class: 'bricks-pieces' });
  const colors = h('div', { class: 'bricks-colors' });
  const tray = h('div', { class: 'bricks-tray' }, pieces, colors);
  const root = h('div', { class: 'bricks', 'data-mode': mode }, area, tray);
  ctx.stage.append(root);

  // ---- geometry ----

  function setPlateDims(): void {
    root.style.setProperty('--bricks-cols', String(board.cols));
    root.style.setProperty('--bricks-rows', String(board.rows));
    plate.dataset.cols = String(board.cols);
    plate.dataset.rows = String(board.rows);
  }

  /** Square cells that fill the area left by the tray. jsdom has no layout: keep the CSS default. */
  function fit(): void {
    const a = area.getBoundingClientRect();
    if (a.width <= 0 || a.height <= 0) return;
    const cs = getComputedStyle(area);
    const w = a.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const hgt = a.height - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    const cell = Math.floor(Math.min(w / board.cols, hgt / board.rows));
    if (cell > 0) root.style.setProperty('--bricks-cell', `${cell}px`);
  }

  /** On-screen cell size from the plate itself (tests stub its rect). 0 without layout. */
  function plateCell(rect: DOMRect): number {
    return rect.width > 0 ? rect.width / board.cols : 0;
  }

  function overPlate(p: { x: number; y: number }, rect: DOMRect, cell: number): boolean {
    return cell > 0 && hitTest(p, [{ id: 'plate', rect }], cell * 0.5) !== null;
  }

  function clampCol(col: number, w: number): number {
    return Math.max(0, Math.min(board.cols - w, col));
  }

  /** The board on the current plate size: refitted when it was saved for the other orientation. */
  function withDims(b: Board): Board {
    return b.cols === board.cols && b.rows === board.rows ? b : refitBoard(b, board.cols, board.rows);
  }

  // ---- bricks on the plate ----

  function addBrickEl(brick: Brick, land: boolean): HTMLElement {
    const el = brickNode(brick, brick.color, brick.x, brick.y);
    el.dataset.id = String(brick.id);
    let grabDx = 0;
    let lifted: Brick | null = null;
    const down = (e: PointerEvent) => {
      const b = board.bricks.find((k) => k.id === Number(el.dataset.id));
      if (!b) return;
      const r = plate.getBoundingClientRect();
      const cell = plateCell(r);
      grabDx = cell > 0 ? e.clientX - (r.left + b.x * cell) : 0;
    };
    el.addEventListener('pointerdown', down);
    const dispose = makeDraggable(el, {
      onStart() {
        ctx.hint.touch();
        lifted = board.bricks.find((k) => k.id === Number(el.dataset.id)) ?? null;
        if (lifted) board = removeBrick(board, lifted.id);
      },
      onDrop(_el, p) {
        const b = lifted;
        lifted = null;
        if (!b) return false;
        const r = plate.getBoundingClientRect();
        const cell = plateCell(r);
        if (!overPlate(p, r, cell)) {
          discard(el);
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
            discard(el);
            ctx.audio.pop(0.7);
            afterChange();
            return false;
          }
          // Nowhere to go: back to where it was.
          x = b.x;
          y = b.y;
          ctx.audio.boing();
        } else {
          ctx.audio.tick();
          ctx.audio.pop(1.4);
          navigator.vibrate?.(10);
        }
        discard(el);
        board = place(board, { x, y, w: b.w, h: b.h, color: b.color });
        addBrickEl(board.bricks[board.bricks.length - 1] as Brick, true);
        afterChange();
        return false;
      },
    });
    brickDisposers.set(el, () => {
      el.removeEventListener('pointerdown', down);
      dispose();
    });
    if (land) el.classList.add('bricks-land');
    layer.append(el);
    return el;
  }

  function discard(el: HTMLElement): void {
    brickDisposers.get(el)?.();
    brickDisposers.delete(el);
    el.remove();
  }

  function rebuild(): void {
    for (const el of [...brickDisposers.keys()]) discard(el);
    for (const b of board.bricks) addBrickEl(b, false);
  }

  function renderGhost(): void {
    ghost.replaceChildren(
      ...(model?.cells ?? []).map((c) =>
        h('div', { class: 'bricks-ghost-cell', style: `--x:${c.x};--y:${c.y};--bricks-color:${c.color}` }),
      ),
    );
  }

  /** Drop a template brick at column `x` with gravity. False when it does not fit. */
  function dropTemplate(size: BrickSize, x: number): boolean {
    const y = dropY(board, x, size.w, size.h);
    if (y === null) return false;
    board = place(board, { x, y, w: size.w, h: size.h, color });
    addBrickEl(board.bricks[board.bricks.length - 1] as Brick, true);
    ctx.audio.tick();
    ctx.audio.pop(1.4);
    navigator.vibrate?.(10);
    if (mode === 'free') {
      freePlaced++;
      if (freePlaced >= FREE_STAR_AFTER && !freeStar) {
        freeStar = true;
        ctx.addStar();
        ctx.audio.jingle();
      }
    }
    afterChange();
    return true;
  }

  function afterChange(): void {
    if (mode === 'free') {
      save(board);
      return;
    }
    if (model && !celebrating && modelProgress(board, model).complete) void finish();
  }

  function clearPlate(): void {
    board = emptyBoard(board.cols, board.rows);
    rebuild();
    ctx.audio.tick();
    navigator.vibrate?.(20);
    replay(trash, 'anim-bounce');
    afterChange();
  }

  // ---- model mode ----

  function startModel(exclude?: string): void {
    const m = modelFor(round, Math.random, exclude);
    modelBase = m;
    modelOffset = centerOffset(m, board.cols);
    model = shiftModel(m, modelOffset);
    root.dataset.model = m.id;
    board = emptyBoard(board.cols, board.rows);
    rebuild();
    renderGhost();
    ctx.speak(`Xây ${m.name} nào!`);
    armHint();
  }

  async function finish(): Promise<void> {
    const done = modelBase;
    celebrating = true;
    ctx.hint.clear();
    replay(plate, 'anim-bounce');
    await ctx.celebrate();
    if (!alive) return;
    celebrating = false;
    ctx.addStar();
    round++;
    if (mode === 'model') startModel(done?.id);
  }

  function setMode(next: Mode): void {
    if (next === mode) return;
    mode = next;
    root.dataset.mode = mode;
    modeBtn.textContent = mode === 'free' ? '🏗️' : '🎨';
    modeBtn.setAttribute('aria-label', mode === 'free' ? 'xây theo mẫu' : 'xếp tự do');
    ctx.audio.tick();
    if (mode === 'model') {
      freeBoard = board;
      startModel();
      return;
    }
    modelBase = null;
    model = null;
    delete root.dataset.model;
    board = freeBoard ? withDims(freeBoard) : emptyBoard(board.cols, board.rows);
    freeBoard = null;
    renderGhost();
    rebuild();
    ctx.speak('Xếp gạch tuỳ thích nhé!');
    armHint();
  }

  // ---- tray ----

  const templates = BRICK_SIZES.map((size) => {
    const piece = h(
      'div',
      { class: 'bricks-piece', 'data-w': size.w, 'data-h': size.h, 'aria-label': `gạch ${size.w} nhân ${size.h}` },
      brickNode(size, color),
    );
    disposers.push(
      makeDraggable(piece, {
        onStart(el) {
          el.classList.remove('anim-wiggle');
          ctx.hint.touch();
        },
        onDrop(_el, p) {
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

  const colorBtns = BRICK_COLORS.map((c) => {
    const btn = h('button', {
      class: 'bricks-color',
      style: `--bricks-color:${c}`,
      'data-color': c,
      'aria-label': colorName(c),
    });
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pickColor(c);
    });
    return btn;
  });

  function pickColor(c: string): void {
    color = c;
    for (const b of colorBtns) b.classList.toggle('active', b.dataset.color === c);
    for (const t of templates) t.querySelector<HTMLElement>('.bricks-brick')?.style.setProperty('--bricks-color', c);
    ctx.hint.touch();
    ctx.audio.tick();
    ctx.speak(colorName(c));
  }

  const trash = h('button', { class: 'bricks-btn bricks-trash', 'aria-label': 'giữ để xoá hết' }, '🗑️');
  ctx.onCleanup(onHold(trash, 700, clearPlate));

  const modeBtn = h('button', { class: 'bricks-btn bricks-mode', 'aria-label': 'xây theo mẫu' }, '🏗️');
  modeBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setMode(mode === 'free' ? 'model' : 'free');
  });

  colors.append(...colorBtns, trash, modeBtn);
  for (const b of colorBtns) b.classList.toggle('active', b.dataset.color === color);

  // ---- idle hint ----

  function armHint(): void {
    ctx.hint.arm(() => {
      if (mode === 'model' && model) {
        const s = nextBrick(board, model);
        if (!s) return;
        if (s.color !== color) {
          const dot = colorBtns.find((b) => b.dataset.color === s.color);
          if (dot) replay(dot, 'anim-wiggle');
          return;
        }
        const t = templates.find((p) => Number(p.dataset.w) === s.w && Number(p.dataset.h) === s.h);
        if (t) replay(t, 'anim-wiggle');
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
      if (mode === 'model' && modelBase) {
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
      if (mode === 'free') save(board);
    }
    fit();
  }

  const saved = loadSaved();
  if (saved) board = withDims(saved);
  setPlateDims();
  rebuild();
  fit();
  let raf = 0;
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(() => fit());
  window.addEventListener('resize', onResize);
  armHint();

  ctx.onCleanup(() => {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    disposers.forEach((d) => d());
    for (const d of brickDisposers.values()) d();
    brickDisposers.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
