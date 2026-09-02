import { h, replay } from '../../core/dom';
import { onHold } from '../../core/hold';
import { showPhotoPicker, type PickerChoice } from '../../core/photoPicker';
import { toLineArt, type Photo } from '../../core/photos';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  BRUSHES,
  DEFAULT_TOOL,
  PALETTE,
  STAR_AFTER_STROKES,
  colorName,
  nextTool,
  stampFontPx,
  stampList,
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
/** Buttons per toolbar group: in landscape each group is one run of a column. */
const GROUP_SIZE = 4;
/** Give up on a line drawing that takes longer than this; the photo stays. */
const LINE_ART_TIMEOUT_MS = 10_000;

/** A toolbar group. The landscape strip is a grid, so the group spans one row per button. */
function group(cls: string, ...buttons: HTMLElement[]): HTMLDivElement {
  const el = h('div', { class: `paint-group ${cls}` }, ...buttons);
  el.style.gridRow = `span ${Math.max(1, buttons.length)}`;
  return el;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Finger painting: a full-stage canvas with colours, brush sizes, emoji stamps
 * and an eraser. Several fingers can draw at once. No rounds; one star after
 * the first `STAR_AFTER_STROKES` strokes. A family photo picked by the child
 * can sit under the (transparent) canvas, as-is or as a line drawing to colour in.
 */
function start(ctx: GameContext): void {
  const bg = h('img', { class: 'paint-bg', alt: '', hidden: true });
  const canvas = h('canvas', { class: 'paint-canvas' });
  const area = h('div', { class: 'paint-area' }, bg, canvas);
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

  /** Wipe the drawing only; the background photo stays. */
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

  // Default stamps, then the stickers the child has unlocked so far.
  const stamps = stampList(ctx.stickers()).map((emoji) => {
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
    group('paint-group-colors', ...swatches.slice(0, GROUP_SIZE)),
    group('paint-group-colors', ...swatches.slice(GROUP_SIZE)),
    group('paint-group-sizes', ...sizes),
    ...chunk(stamps, GROUP_SIZE).map((run) => group('paint-group-stamps', ...run)),
    group('paint-group-actions', eraser, trash),
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

  // ---- background photo / colouring page ----

  let photos: Photo[] = [];
  /** Index into `photos`; -1 = plain white. */
  let photoIndex = -1;
  /** Show the photo as a line drawing to colour in. */
  let lineArt = false;
  /** A line drawing is being computed (button shows ⏳). */
  let converting = false;
  /** Bumped whenever the background changes so a late conversion result is ignored. */
  let job = 0;
  let convertTimer: ReturnType<typeof setTimeout> | undefined;
  /** Line drawings by photo id: the edge detection runs once per photo per visit. */
  const lineArtCache = new Map<string, string>();

  const photoBtn = h('button', { class: 'paint-btn paint-photo', 'aria-label': 'chọn ảnh của bé' }, '🖼️');
  const lineArtBtn = h('button', { class: 'paint-btn paint-lineart', 'aria-label': 'tô màu ảnh', hidden: true }, '✏️');
  /** Only in the toolbar while there are photos. */
  const photoGroup = group('paint-group-photo', photoBtn, lineArtBtn);

  function renderBackground(): void {
    const photo = photos[photoIndex];
    photoBtn.classList.toggle('selected', photo !== undefined);
    lineArtBtn.hidden = photo === undefined;
    lineArtBtn.classList.toggle('selected', lineArt);
    lineArtBtn.textContent = converting ? '⏳' : '✏️';
    photoGroup.style.gridRow = `span ${photo ? 2 : 1}`;
    if (!photo) {
      bg.hidden = true;
      bg.removeAttribute('src');
      return;
    }
    const src = (lineArt ? lineArtCache.get(photo.id) : undefined) ?? photo.url;
    if (bg.getAttribute('src') !== src) bg.src = src;
    bg.hidden = false;
  }

  /** Forget any conversion in flight (its result is still cached when it lands). */
  function dropConversion(): void {
    job++;
    converting = false;
    clearTimeout(convertTimer);
  }

  /** Show `photos[index]` (-1 = plain white) as the background, leaving line-art mode. */
  function setPhoto(index: number): void {
    photoIndex = index;
    lineArt = false;
    dropConversion();
    renderBackground();
    if (photoIndex >= 0) ctx.speak('Ảnh của bé');
  }

  /** Dismisses the open picker, if any. */
  let closePicker: (() => void) | null = null;

  function openPicker(): void {
    closePicker?.();
    ctx.audio.tick();
    const choices: PickerChoice[] = [
      { id: 'none', emoji: '⬜', label: 'Không ảnh' },
      ...photos.map((p, i) => ({ id: p.id, url: p.url, label: `Ảnh ${i + 1}` })),
    ];
    closePicker = showPhotoPicker(ctx.stage, choices, (choice) => {
      closePicker = null;
      if (!choice) return;
      setPhoto(choice.id === 'none' ? -1 : photos.findIndex((p) => p.id === choice.id));
    });
  }
  photoBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    openPicker();
  });

  function toggleLineArt(): void {
    const photo = photos[photoIndex];
    if (!photo) return;
    dropConversion();
    ctx.audio.tick();
    lineArt = !lineArt;
    if (!lineArt) {
      renderBackground();
      return;
    }
    ctx.speak('Tô màu ảnh nào!');
    if (lineArtCache.has(photo.id)) {
      renderBackground();
      return;
    }
    const id = job;
    converting = true;
    renderBackground();
    // Never throws: on failure (no canvas, huge image, stuck decode) the photo stays.
    const fail = (): void => {
      if (id !== job) return;
      clearTimeout(convertTimer);
      converting = false;
      lineArt = false;
      renderBackground();
    };
    convertTimer = setTimeout(fail, LINE_ART_TIMEOUT_MS);
    toLineArt(photo.url).then((url) => {
      lineArtCache.set(photo.id, url);
      if (id !== job) return;
      clearTimeout(convertTimer);
      converting = false;
      renderBackground();
    }, fail);
  }
  lineArtBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toggleLineArt();
  });

  function setPhotos(list: Photo[]): void {
    closePicker?.();
    const selected = photos[photoIndex]?.id;
    photos = list;
    photoIndex = selected === undefined ? -1 : list.findIndex((p) => p.id === selected);
    if (photoIndex < 0) {
      lineArt = false;
      dropConversion();
    }
    if (list.length === 0) photoGroup.remove();
    else if (photoGroup.parentNode !== tools) tools.append(photoGroup);
    renderBackground();
  }

  let disposed = false;
  ctx.photos.list().then(
    (list) => {
      if (!disposed) setPhotos(list);
    },
    () => undefined,
  );
  const offPhotos = ctx.photos.onChange(setPhotos);

  // ---- lifecycle ----

  resize();
  let raf = 0;
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(resize);
  window.addEventListener('resize', resize);
  ctx.onCleanup(() => {
    disposed = true;
    offPhotos();
    closePicker?.();
    dropConversion();
    window.removeEventListener('resize', resize);
    if (raf) cancelAnimationFrame(raf);
    strokes.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
