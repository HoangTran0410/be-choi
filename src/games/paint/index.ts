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
  SAVE_MAX_PX,
  SAVE_MS,
  STAR_AFTER_STROKES,
  colorName,
  deserializePainting,
  nextTool,
  serializePainting,
  stampFontPx,
  STAMPS,
  stampList,
  strokeWidth,
  type SavedPainting,
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

/** localStorage key of the drawing in progress. */
export const STORAGE_KEY = 'be-choi:paint';

function loadSaved(): SavedPainting | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? deserializePainting(raw) : null;
  } catch {
    return null;
  }
}

function writeSaved(raw: string | null): void {
  try {
    if (raw === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* quota or blocked storage: the drawing lives in memory only */
  }
}

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
 *
 * The drawing and the chosen background are kept in localStorage, so leaving the
 * game and coming back finds the picture exactly where the child left it.
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

  const saved = loadSaved();
  /** Last visit's strokes, until they are painted back (or dropped). */
  let restoreArt: SavedPainting | null = saved;
  /** Last visit's background, until the photo list arrives. */
  let restoreBg: SavedPainting | null = saved;
  /** The child has drawn since the game opened: a late restore must not paint over them. */
  let touched = false;
  /** There is something new to write out. */
  let dirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

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
    // Wiping the picture wipes the copy on disk, and any restore still in flight.
    restoreArt = null;
    touched = false;
    dirty = false;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    writeSaved(null);
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
    touched = true;
    done++;
    if (done === STAR_AFTER_STROKES) {
      ctx.addStar();
      ctx.audio.jingle();
    }
    schedulePersist();
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

  // The toolbar carries the handful of everyday stamps. Everything the child has
  // unlocked lives behind the 🎁 button: forty-odd of them along the toolbar
  // would leave no paper to draw on.
  const stamps = STAMPS.map((emoji) => {
    const btn = h('button', { class: 'paint-btn paint-stamp', 'aria-label': `dán hình ${emoji}`, 'data-emoji': emoji }, emoji);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      select(nextTool(tool, { emoji }));
    });
    return btn;
  });

  /**
   * Every sticker the child has earned, behind one button. Before this they went
   * to the album and stopped there: the toolbar took the first eight and the
   * rest were collected and never seen, which made collecting them pointless.
   */
  const owned = ctx.stickers();
  const allStamps = stampList(owned);
  const moreBtn = h('button', { class: 'paint-btn paint-stamp-more', 'aria-label': 'chọn hình dán', hidden: owned.length === 0 }, '🎁');
  let closeStickers: (() => void) | null = null;
  moreBtn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    ctx.audio.tick();
    const choices: PickerChoice[] = allStamps.map((emoji) => ({ id: emoji, emoji, label: `hình dán ${emoji}` }));
    closeStickers = showPhotoPicker(root, choices, (choice) => {
      closeStickers = null;
      if (!choice?.emoji) return;
      moreBtn.textContent = choice.emoji;
      select(nextTool(tool, { emoji: choice.emoji }));
    });
  });
  ctx.onCleanup(() => closeStickers?.());

  const stampButtons = [...stamps, moreBtn];

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
    ...chunk(stampButtons, GROUP_SIZE).map((run) => group('paint-group-stamps', ...run)),
    group('paint-group-actions', eraser, trash),
  );

  function render(): void {
    for (const b of swatches) b.classList.toggle('selected', tool.kind === 'brush' && b.dataset.color === tool.color);
    for (const b of sizes) b.classList.toggle('selected', Number(b.dataset.size) === tool.size);
    for (const b of stamps) b.classList.toggle('selected', tool.kind === 'stamp' && b.dataset.emoji === tool.emoji);
    // Lit when the stamp in hand came from the collection rather than the toolbar.
    moreBtn.classList.toggle('selected', tool.kind === 'stamp' && !STAMPS.includes(tool.emoji));
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
    schedulePersist();
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

  /** Turn the background photo into a line drawing. Call `dropConversion()` first. */
  function startLineArt(): void {
    const photo = photos[photoIndex];
    if (!photo) return;
    lineArt = true;
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

  function toggleLineArt(): void {
    const photo = photos[photoIndex];
    if (!photo) return;
    dropConversion();
    ctx.audio.tick();
    if (lineArt) {
      lineArt = false;
      renderBackground();
    } else {
      ctx.speak('Tô màu ảnh nào!');
      startLineArt();
    }
    schedulePersist();
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
    // The first list to arrive brings back the background the child left last time.
    const want = restoreBg;
    restoreBg = null;
    if (want?.photo && photoIndex < 0) photoIndex = list.findIndex((p) => p.id === want.photo);
    if (photoIndex < 0) {
      lineArt = false;
      dropConversion();
    }
    if (list.length === 0) photoGroup.remove();
    else if (photoGroup.parentNode !== tools) tools.append(photoGroup);
    renderBackground();
    if (want?.lineArt && photoIndex >= 0 && !lineArt) {
      dropConversion();
      startLineArt();
    }
  }

  let disposed = false;
  ctx.photos.list().then(
    (list) => {
      if (!disposed) setPhotos(list);
    },
    () => undefined,
  );
  const offPhotos = ctx.photos.onChange(setPhotos);

  // ---- keeping the picture ----

  /** The drawing as a PNG small enough to sit in localStorage, or null if unreadable. */
  function snapshot(): string | null {
    if (!canvas.width || !canvas.height) return null;
    try {
      const scale = Math.min(1, SAVE_MAX_PX / Math.max(canvas.width, canvas.height));
      if (scale === 1) return canvas.toDataURL('image/png');
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(canvas.width * scale));
      small.height = Math.max(1, Math.round(canvas.height * scale));
      const sc = small.getContext('2d');
      if (!sc) return null;
      sc.drawImage(canvas, 0, 0, small.width, small.height);
      return small.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function persist(): void {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!dirty) return;
    dirty = false;
    const image = snapshot();
    if (!image) return;
    writeSaved(
      serializePainting({
        image,
        w: area.clientWidth || canvas.width / dpr,
        h: area.clientHeight || canvas.height / dpr,
        photo: photos[photoIndex]?.id ?? null,
        lineArt,
      }),
    );
  }

  /** Write out once the child pauses; leaving the game flushes it right away. */
  function schedulePersist(): void {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, SAVE_MS);
  }

  /** Paint last visit's drawing back, scaled to fit and centred the way a rotation does. */
  function restoreDrawing(): void {
    const last = restoreArt;
    restoreArt = null;
    if (!last || typeof Image !== 'function') return;
    const img = new Image();
    img.addEventListener('load', () => {
      const c = get2d();
      // Never paint over strokes the child made while this was loading.
      if (!c || touched || !canvas.width) return;
      const w = canvas.width / dpr;
      const hgt = canvas.height / dpr;
      const s = Math.min(1, w / last.w, hgt / last.h);
      c.drawImage(img, (w - last.w * s) / 2, (hgt - last.h * s) / 2, last.w * s, last.h * s);
    });
    img.addEventListener('error', () => undefined);
    img.src = last.image;
  }

  // ---- lifecycle ----

  resize();
  restoreDrawing();
  let raf = 0;
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(resize);
  window.addEventListener('resize', resize);
  ctx.onCleanup(() => {
    disposed = true;
    persist();
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
