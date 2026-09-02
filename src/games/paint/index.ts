import { h, replay } from '../../core/dom';
import { onHold } from '../../core/hold';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  BRUSHES,
  DEFAULT_TOOL,
  PALETTE,
  STAMPS,
  STAR_AFTER_STROKES,
  colorName,
  nextTool,
  stampFontPx,
  strokeWidth,
  type Tool,
} from './logic';
import './style.css';

interface Point {
  x: number;
  y: number;
}

const STAMP_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';
const SIZE_NAMES: readonly string[] = ['cỡ nhỏ', 'cỡ vừa', 'cỡ to'];

/**
 * Finger painting: a full-stage canvas with colours, brush sizes, emoji stamps
 * and an eraser. Several fingers can draw at once. No rounds; one star after
 * the first `STAR_AFTER_STROKES` strokes.
 */
function start(ctx: GameContext): void {
  const canvas = h('canvas', { class: 'paint-canvas' });
  const area = h('div', { class: 'paint-area' }, canvas);
  const tools = h('div', { class: 'paint-tools' });
  const root = h('div', { class: 'paint' }, area, tools);
  ctx.stage.append(root);

  let tool: Tool = DEFAULT_TOOL;
  /** Last point of each finger currently brushing, keyed by pointerId. */
  const strokes = new Map<number, Point>();
  let done = 0;
  let dpr = 1;

  function get2d(): CanvasRenderingContext2D | null {
    return canvas.getContext('2d');
  }

  /** Reset context state (lost whenever the backing store is resized). */
  function setup(c: CanvasRenderingContext2D): void {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
  }

  /**
   * Match the backing store to the drawing area. The old picture is copied to
   * an offscreen canvas and drawn back, scaled down (never up) to fit and centred,
   * so nothing is lost on rotation.
   */
  function resize(): void {
    const c = get2d();
    if (!c) return;
    const w = area.clientWidth;
    const hgt = area.clientHeight;
    if (!w || !hgt) return;
    const nextDpr = window.devicePixelRatio || 1;
    const bw = Math.round(w * nextDpr);
    const bh = Math.round(hgt * nextDpr);
    if (bw === canvas.width && bh === canvas.height && nextDpr === dpr) return;

    let snap: HTMLCanvasElement | null = null;
    const oldCssW = canvas.width / dpr;
    const oldCssH = canvas.height / dpr;
    if (canvas.width && canvas.height) {
      snap = document.createElement('canvas');
      snap.width = canvas.width;
      snap.height = canvas.height;
      const sc = snap.getContext('2d');
      if (sc) sc.drawImage(canvas, 0, 0);
      else snap = null;
    }

    dpr = nextDpr;
    canvas.width = bw;
    canvas.height = bh;
    setup(c);
    if (snap) {
      const s = Math.min(1, w / oldCssW, hgt / oldCssH);
      const dw = oldCssW * s;
      const dh = oldCssH * s;
      c.drawImage(snap, (w - dw) / 2, (hgt - dh) / 2, dw, dh);
    }
  }

  function clear(): void {
    const c = get2d();
    if (!c) return;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.restore();
    strokes.clear();
    ctx.audio.tick();
    navigator.vibrate?.(20);
    replay(trash, 'anim-bounce');
  }

  // ---- drawing ----

  function pos(e: PointerEvent): Point {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function applyStroke(c: CanvasRenderingContext2D): void {
    if (tool.kind === 'eraser') {
      c.globalCompositeOperation = 'destination-out';
      c.strokeStyle = '#000';
    } else {
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = tool.kind === 'brush' ? tool.color : '#000';
    }
    c.lineWidth = strokeWidth(tool);
  }

  function segment(c: CanvasRenderingContext2D, a: Point, b: Point): void {
    c.beginPath();
    c.moveTo(a.x, a.y);
    // A tap must still leave a dot: nudge zero-length segments so round caps render.
    c.lineTo(a.x === b.x && a.y === b.y ? b.x + 0.01 : b.x, b.y);
    c.stroke();
  }

  function stamp(c: CanvasRenderingContext2D, p: Point, emoji: string): void {
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000';
    c.font = `${stampFontPx(tool.size)}px ${STAMP_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(emoji, p.x, p.y);
  }

  function finished(): void {
    done++;
    if (done === STAR_AFTER_STROKES) {
      ctx.addStar();
      ctx.audio.jingle();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const c = get2d();
    if (!c) return;
    const p = pos(e);
    if (tool.kind === 'stamp') {
      stamp(c, p, tool.emoji);
      ctx.audio.pop();
      navigator.vibrate?.(10);
      finished();
      return;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom or a pointer that is already up */
    }
    applyStroke(c);
    segment(c, p, p);
    strokes.set(e.pointerId, p);
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = strokes.get(e.pointerId);
    if (!prev) return;
    const c = get2d();
    if (!c) return;
    applyStroke(c);
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    let last = prev;
    for (const ev of events.length ? events : [e]) {
      const p = pos(ev);
      segment(c, last, p);
      last = p;
    }
    strokes.set(e.pointerId, last);
  });

  const end = (e: PointerEvent): void => {
    if (strokes.delete(e.pointerId)) finished();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- toolbar ----

  const swatches = PALETTE.map((color) => {
    const btn = h('button', {
      class: 'paint-btn paint-swatch',
      style: `--paint-color:${color}`,
      'aria-label': colorName(color),
      'data-color': color,
    });
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      select(nextTool(tool, { color }));
      const name = colorName(color);
      if (name) ctx.speak(name);
    });
    return btn;
  });

  const sizes = BRUSHES.map((size, i) => {
    const btn = h(
      'button',
      { class: 'paint-btn paint-size', 'aria-label': SIZE_NAMES[i] ?? 'cỡ bút', 'data-size': size },
      h('span', { class: 'paint-size-dot', style: `--paint-dot:${size}px` }),
    );
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      select(nextTool(tool, { size }));
    });
    return btn;
  });

  const stamps = STAMPS.map((emoji) => {
    const btn = h('button', { class: 'paint-btn paint-stamp', 'aria-label': `dán hình ${emoji}`, 'data-emoji': emoji }, emoji);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      select(nextTool(tool, { emoji }));
    });
    return btn;
  });

  const eraser = h('button', { class: 'paint-btn paint-eraser', 'aria-label': 'cục tẩy' }, '🧹');
  eraser.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    select(nextTool(tool, { eraser: true }));
  });

  const trash = h('button', { class: 'paint-btn paint-trash', 'aria-label': 'giữ để xoá hết' }, '🗑️');
  ctx.onCleanup(onHold(trash, 700, clear));

  tools.append(
    h('div', { class: 'paint-group paint-group-colors' }, ...swatches.slice(0, 4)),
    h('div', { class: 'paint-group paint-group-colors' }, ...swatches.slice(4)),
    h('div', { class: 'paint-group paint-group-sizes' }, ...sizes),
    h('div', { class: 'paint-group paint-group-stamps' }, ...stamps),
    h('div', { class: 'paint-group paint-group-actions' }, eraser, trash),
  );

  function render(): void {
    for (const b of swatches) b.classList.toggle('selected', tool.kind === 'brush' && b.dataset.color === tool.color);
    for (const b of sizes) b.classList.toggle('selected', Number(b.dataset.size) === tool.size);
    for (const b of stamps) b.classList.toggle('selected', tool.kind === 'stamp' && b.dataset.emoji === tool.emoji);
    eraser.classList.toggle('selected', tool.kind === 'eraser');
  }

  function select(next: Tool): void {
    tool = next;
    render();
    ctx.audio.tick();
  }

  render();

  // ---- lifecycle ----

  resize();
  let raf = 0;
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(resize);
  window.addEventListener('resize', resize);
  ctx.onCleanup(() => {
    window.removeEventListener('resize', resize);
    if (raf) cancelAnimationFrame(raf);
    strokes.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
