/**
 * The paper every drawing mode shares: a paint canvas, an optional overlay canvas above it
 * (the lines of a colouring page, the faint template), pen / crayon / rainbow / sparkle,
 * stamps, an eraser and a paint bucket. Several fingers can draw at once.
 *
 * The canvas backing store is made once for a given paper shape and never resized: the
 * paper is scaled by CSS, so turning the tablet or opening a toolbar can never smear,
 * shift or lose a drawing. Everything copes with `getContext()` giving null (jsdom).
 */
import { perf } from '../../core/frame';
import { h } from '../../core/dom';
import { pickDpr } from '../../core/quality';
import type { GameContext } from '../../core/types';
import { floodRegion, growMask, nearestOpen, paintMask, wallsFromRgba } from './flood';
import type { BrushKind } from './progress';

export type ToolKind = 'brush' | 'stamp' | 'eraser' | 'bucket';

export interface ToolState {
  tool: ToolKind;
  color: string;
  brush: BrushKind;
  /** 0 … SIZES.length - 1 */
  size: number;
  emoji: string;
}

export const SIZES: readonly number[] = [12, 24, 44];
export const SIZE_NAMES: readonly string[] = ['cỡ nhỏ', 'cỡ vừa', 'cỡ to'];
export const DEFAULT_TOOL: ToolState = { tool: 'brush', color: '#ef4444', brush: 'pen', size: 1, emoji: '🐶' };
const STAMP_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';
/** Biggest side of the backing store in device pixels. */
const MAX_BACKING = 1400;
/** The paper never gets more oblong than this. */
export const MIN_ASPECT = 0.56;
export const MAX_ASPECT = 1.78;

export function clampAspect(a: number): number {
  return Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, Number.isFinite(a) && a > 0 ? a : 1));
}

/** Largest `aspect` (w/h) box that fits in `w` × `h` with `pad` around it. */
export function fitPaper(w: number, hh: number, aspect: number, pad = 8): { w: number; h: number; x: number; y: number } {
  const aw = Math.max(40, w - pad * 2);
  const ah = Math.max(40, hh - pad * 2);
  let pw = aw;
  let ph = pw / aspect;
  if (ph > ah) {
    ph = ah;
    pw = ph * aspect;
  }
  return { w: Math.round(pw), h: Math.round(ph), x: Math.round((w - pw) / 2), y: Math.round((hh - ph) / 2) };
}

interface Pt {
  x: number;
  y: number;
}

interface Finger {
  last: Pt;
  hue: number;
  carry: number;
}

export interface SurfaceOptions {
  ctx: GameContext;
  /** Element the paper sits in (fills the free space). */
  host: HTMLElement;
  /** Paper shape (w / h). Omit to match the host as it is now. */
  aspect?: number;
  /** How the overlay combines with the paint when saved. */
  overlayBlend?: 'multiply' | 'normal';
  /** A stroke, stamp or fill was just finished. */
  onStroke?: () => void;
  /** Ink went from `a` (null for a dot) to `b`, in paper units 0…w / 0…h. */
  onInk?: (a: Pt | null, b: Pt, w: number, h: number) => void;
  /** An emoji stamp was put down. */
  onStamp?: (emoji: string) => void;
  /** A bucket fill happened. */
  onFill?: () => void;
}

export interface Surface {
  paper: HTMLElement;
  tool: ToolState;
  setTool(patch: Partial<ToolState>): void;
  /** Strokes, stamps and fills since the last clear. */
  strokes(): number;
  clear(): void;
  /** Rebuild the paper for a new shape (and clear it). */
  reset(aspect?: number): void;
  /** Set (or with null remove) what is drawn on the overlay, and draw it now. */
  setOverlay(fn: ((c: CanvasRenderingContext2D, w: number, hh: number) => void) | null): void;
  redrawOverlay(): void;
  size(): { w: number; h: number };
  /** JPEG of the paper as it looks now. */
  snapshot(maxSide?: number): { url: string; w: number; h: number } | null;
  destroy(): void;
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.32;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
}

export function createSurface(opts: SurfaceOptions): Surface {
  const { ctx, host } = opts;
  const canvas = h('canvas', { class: 'dr-canvas' });
  const overlay = h('canvas', { class: 'dr-overlay' });
  if (opts.overlayBlend === 'multiply') overlay.classList.add('multiply');
  const paper = h('div', { class: 'dr-paper' }, canvas, overlay);
  host.append(paper);

  const state: ToolState = { ...DEFAULT_TOOL };
  const fingers = new Map<number, Finger>();
  let aspect = opts.aspect ? clampAspect(opts.aspect) : 0;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let count = 0;
  let overlayFn: ((c: CanvasRenderingContext2D, w: number, hh: number) => void) | null = null;
  let walls: Uint8Array | null = null;
  let alive = true;

  const get2d = (): CanvasRenderingContext2D | null => canvas.getContext('2d');
  const getOverlay2d = (): CanvasRenderingContext2D | null => overlay.getContext('2d', { willReadFrequently: true });

  function hostSize(): { w: number; h: number } {
    return { w: host.clientWidth || 400, h: host.clientHeight || 600 };
  }

  function layout(): void {
    const hs = hostSize();
    if (!aspect) aspect = clampAspect(hs.w / hs.h);
    const f = fitPaper(hs.w, hs.h, aspect);
    paper.style.cssText = `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px`;
    if (!W) buildBacking(f.w, f.h);
  }

  /** Make the backing stores for a paper of this CSS size. Runs once per paper shape. */
  function buildBacking(cssW: number, cssH: number): void {
    dpr = pickDpr(window.devicePixelRatio || 1, 2, perf.low);
    const longest = Math.max(cssW, cssH) * dpr;
    if (longest > MAX_BACKING) dpr *= MAX_BACKING / longest;
    W = Math.max(1, Math.round(cssW));
    H = Math.max(1, Math.round(cssH));
    for (const cv of [canvas, overlay]) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    prepare();
    redrawOverlay();
  }

  function prepare(): void {
    const c = get2d();
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
  }

  function redrawOverlay(): void {
    walls = null;
    const c = getOverlay2d();
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, overlay.width, overlay.height);
    if (!overlayFn) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    overlayFn(c, W, H);
  }

  function sizeScale(): number {
    return Math.max(0.8, Math.min(1.5, Math.min(W, H) / 420));
  }
  const lineWidth = (): number => (SIZES[state.size] ?? SIZES[1]!) * sizeScale();

  function pos(e: PointerEvent): Pt {
    const r = canvas.getBoundingClientRect();
    const sx = r.width > 0 ? W / r.width : 1;
    const sy = r.height > 0 ? H / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  /* ---------------------------------------------------------------- brushes */

  function segment(c: CanvasRenderingContext2D, a: Pt, b: Pt, f: Finger): void {
    const w = lineWidth();
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const bx = a.x === b.x && a.y === b.y ? b.x + 0.01 : b.x;
    if (state.tool === 'eraser') {
      c.globalCompositeOperation = 'destination-out';
      c.strokeStyle = '#000';
      c.lineWidth = w * 1.8;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(bx, b.y);
      c.stroke();
      c.globalCompositeOperation = 'source-over';
      return;
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    switch (state.brush) {
      case 'rainbow': {
        f.hue = (f.hue + len * 1.4) % 360;
        c.strokeStyle = `hsl(${Math.round(f.hue)} 90% 55%)`;
        c.lineWidth = w;
        break;
      }
      case 'crayon': {
        c.strokeStyle = state.color;
        c.lineWidth = w * 0.9;
        break;
      }
      case 'sparkle': {
        // A thin trail, then little stars along it.
        c.strokeStyle = state.color;
        c.globalAlpha = 0.45;
        c.lineWidth = w * 0.35;
        break;
      }
      default: {
        c.strokeStyle = state.color;
        c.lineWidth = w;
      }
    }
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(bx, b.y);
    c.stroke();
    c.globalAlpha = 1;

    if (state.brush === 'crayon' && !perf.low) {
      // Wax grain: tiny gaps where the paper shows through.
      c.globalCompositeOperation = 'destination-out';
      const n = Math.max(1, Math.ceil(len / (w * 0.35)));
      for (let i = 0; i < n; i++) {
        const t = Math.random();
        c.globalAlpha = 0.25 + Math.random() * 0.25;
        c.beginPath();
        c.arc(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * w * 0.8, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * w * 0.8, w * (0.06 + Math.random() * 0.1), 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    if (state.brush === 'sparkle') {
      const gap = Math.max(10, w * 0.9) * (perf.low ? 1.8 : 1);
      f.carry += len;
      c.fillStyle = state.color;
      while (f.carry >= gap) {
        f.carry -= gap;
        const t = len === 0 ? 1 : Math.max(0, 1 - f.carry / len);
        const r = w * (0.35 + Math.random() * 0.45);
        star(c, a.x + (b.x - a.x) * t + (Math.random() - 0.5) * w, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * w, r, Math.random() * 1.5);
      }
    }
  }

  function stamp(c: CanvasRenderingContext2D, p: Pt): void {
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#000';
    c.font = `${Math.round(lineWidth() * 3.2)}px ${STAMP_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(state.emoji, p.x, p.y);
  }

  /** Where the lines of the page are, read once per overlay. */
  function getWalls(): Uint8Array | null {
    if (walls) return walls;
    const c = getOverlay2d();
    if (!c || !overlay.width || !overlay.height) return null;
    try {
      walls = wallsFromRgba(c.getImageData(0, 0, overlay.width, overlay.height).data, overlay.width, overlay.height);
    } catch {
      walls = null;
    }
    return walls;
  }

  function bucket(p: Pt): boolean {
    const c = get2d();
    const wl = getWalls();
    if (!c || !wl) return false;
    const bw = canvas.width;
    const bh = canvas.height;
    const start = nearestOpen(wl, bw, bh, p.x * dpr, p.y * dpr, Math.round(10 * dpr));
    if (!start) return false;
    const region = floodRegion(wl, bw, bh, start.x, start.y);
    if (!region) return false;
    try {
      const img = c.getImageData(0, 0, bw, bh);
      paintMask(img.data, growMask(region.mask, bw, bh, Math.max(1, Math.round(1.5 * dpr))), state.color);
      c.putImageData(img, 0, 0);
    } catch {
      return false;
    }
    return true;
  }

  /* ----------------------------------------------------------------- events */

  function finished(): void {
    count++;
    opts.onStroke?.();
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!W) return;
    const c = get2d();
    const p = pos(e);
    if (state.tool === 'stamp') {
      if (c) stamp(c, p);
      ctx.audio.pop();
      navigator.vibrate?.(10);
      opts.onStamp?.(state.emoji);
      finished();
      return;
    }
    if (state.tool === 'bucket') {
      if (bucket(p)) {
        ctx.audio.pop(1.2);
        navigator.vibrate?.(12);
        opts.onFill?.();
        finished();
      } else {
        ctx.audio.tick();
      }
      return;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom or a pointer that is already up */
    }
    const f: Finger = { last: p, hue: Math.random() * 360, carry: 0 };
    fingers.set(e.pointerId, f);
    if (c) segment(c, p, p, f);
    opts.onInk?.(null, p, W, H);
  });

  canvas.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const c = get2d();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const p = pos(ev);
      if (c) segment(c, f.last, p, f);
      opts.onInk?.(f.last, p, W, H);
      f.last = p;
    }
  });

  const end = (e: PointerEvent): void => {
    if (fingers.delete(e.pointerId)) finished();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------------------------------------------------------- lifecycle */

  let watch: ResizeObserver | null = null;
  const onResize = (): void => {
    if (alive) layout();
  };
  if (typeof ResizeObserver === 'function') {
    watch = new ResizeObserver(onResize);
    watch.observe(host);
  } else {
    window.addEventListener('resize', onResize);
  }
  layout();

  const surface: Surface = {
    paper,
    tool: state,
    setTool(patch) {
      Object.assign(state, patch);
    },
    strokes: () => count,
    clear() {
      const c = get2d();
      if (c) {
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, canvas.width, canvas.height);
        c.restore();
      }
      fingers.clear();
      count = 0;
    },
    reset(next) {
      surface.clear();
      aspect = next ? clampAspect(next) : aspect;
      W = 0;
      layout();
    },
    setOverlay(fn) {
      overlayFn = fn;
      redrawOverlay();
    },
    redrawOverlay,
    size: () => ({ w: W, h: H }),
    snapshot(maxSide = 480) {
      if (!W || !H) return null;
      try {
        const s = Math.min(1, maxSide / Math.max(W, H));
        const tw = Math.max(1, Math.round(W * s));
        const th = Math.max(1, Math.round(H * s));
        const out = document.createElement('canvas');
        out.width = tw;
        out.height = th;
        const c = out.getContext('2d');
        if (!c) return null;
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, tw, th);
        c.drawImage(canvas, 0, 0, tw, th);
        if (overlayFn) {
          c.globalCompositeOperation = opts.overlayBlend === 'multiply' ? 'multiply' : 'source-over';
          c.drawImage(overlay, 0, 0, tw, th);
        }
        return { url: out.toDataURL('image/jpeg', 0.82), w: tw, h: th };
      } catch {
        return null;
      }
    },
    destroy() {
      alive = false;
      watch?.disconnect();
      window.removeEventListener('resize', onResize);
      fingers.clear();
      paper.remove();
    },
  };
  return surface;
}
