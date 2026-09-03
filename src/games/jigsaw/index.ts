import { h, replay } from '../../core/dom';
import { makeDraggable } from '../../core/drag';
import { showPhotoPicker, type PickerChoice } from '../../core/photoPicker';
import type { Photo } from '../../core/photos';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { makeJigsawRound, renderPhotoPicture, renderPicture, scalePath, trayPieceWidth, type CutPiece, type JigsawRound } from './logic';
import './style.css';

/** Picture bitmap side, clamped: about 70vmin at device resolution. */
const PICTURE_MIN = 256;
const PICTURE_MAX = 1024;
/** A drop is accepted when the piece's centre is within this fraction of the board side of its slot's centre. */
const DROP_TOLERANCE = 0.28;
/** User units of the guide-line SVG: dashes scale with the board, the stroke stays in px. */
const LINES_UNITS = 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';

function pictureSize(): number {
  const vmin = Math.min(window.innerWidth, window.innerHeight) || PICTURE_MIN;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return Math.max(PICTURE_MIN, Math.min(PICTURE_MAX, Math.round(vmin * 0.7 * dpr)));
}

function px(n: number): string {
  return `${Math.round(n * 100) / 100}px`;
}

function pct(n: number): string {
  return `${Math.round(n * 1e4) / 100}%`;
}

/** Clip `el` to piece `p` drawn at `size` px per board side, local to the piece's bounding box. */
function clipTo(el: HTMLElement, p: CutPiece, size: number): void {
  el.style.clipPath = `path("${scalePath(p.path, size, size, -p.bbox.x * size, -p.bbox.y * size)}")`;
}

/** Thin white line along the piece's outline: an SVG over the piece, clipped with it so only the inner half shows. */
function edgeOf(p: CutPiece): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'jigsaw-piece-edge');
  svg.setAttribute('viewBox', `${p.bbox.x} ${p.bbox.y} ${p.bbox.w} ${p.bbox.h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', p.path);
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  return svg;
}

/** One piece of the current round: its shape, the tray item (drag handle), the clipped visual and its slot. */
interface PieceEls {
  p: CutPiece;
  item: HTMLElement;
  piece: HTMLElement;
  slot: HTMLElement;
}

/**
 * Jigsaw: drag the pieces of a picture into place on a square board. The cut
 * climbs a ladder (rectangles, strips, triangles, knobs, pie wedges, waves; see
 * `levelFor`). The picture is an emoji painted on a canvas once per round, or —
 * when a parent picked family photos — the photo the child chose in the 🖼️
 * picker (the first one until something is chosen; a 🐣 tile goes back to emoji).
 * Every piece is a div clipped to its shape showing its part of the picture via
 * background-position.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  let disposers: Array<() => void> = [];
  let current: JigsawRound | null = null;
  let els: PieceEls[] = [];
  /** The largest bounding box of the cut, the "cell" the tray is sized for. */
  let cell = { w: 1, h: 1 };
  /** Family photos, if any; the picker button exists only while there are some. */
  let photos: Photo[] = [];
  let usePhotos = false;
  /** Photo the child chose in the picker; `null` → the first photo. Kept round after round. */
  let chosenId: string | null = null;
  /** Closes the open picker, if any. */
  let closePicker: (() => void) | null = null;
  /** Bumped per deal so a slow photo render never builds a stale round. */
  let deal = 0;

  const wrap = h('div', { class: 'jigsaw' });
  const area = h('div', { class: 'jigsaw-area' });
  const board = h('div', { class: 'jigsaw-board' });
  const ghost = h('div', { class: 'jigsaw-ghost' });
  const lines = document.createElementNS(SVG_NS, 'svg');
  lines.setAttribute('class', 'jigsaw-lines');
  lines.setAttribute('viewBox', `0 0 ${LINES_UNITS} ${LINES_UNITS}`);
  lines.setAttribute('preserveAspectRatio', 'none');
  const linesPath = document.createElementNS(SVG_NS, 'path');
  linesPath.setAttribute('vector-effect', 'non-scaling-stroke');
  lines.append(linesPath);
  const tray = h('div', { class: 'g-tray jigsaw-tray' });
  area.append(board);
  wrap.append(area, tray);
  ctx.stage.append(wrap);

  // 🖼️ in the corner opens a full-stage picker: one tile per photo and a 🐣 tile for emoji pictures.
  const source = h('button', { class: 'btn-round jigsaw-source', type: 'button', 'aria-label': 'Chọn ảnh' }, '🖼️');
  source.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    openPicker();
  });

  function openPicker(): void {
    if (!photos.length || closePicker) return;
    const choices: PickerChoice[] = [
      ...photos.map((p, i) => ({ id: p.id, url: p.url, label: `Ảnh ${i + 1}` })),
      { id: 'emoji', emoji: '🐣', label: 'Tranh emoji' },
    ];
    closePicker = showPhotoPicker(ctx.stage, choices, (choice) => {
      closePicker = null;
      if (!choice || !alive) return;
      usePhotos = choice.id !== 'emoji';
      if (usePhotos) chosenId = choice.id;
      ctx.audio.pop();
      void play();
    });
  }

  /** The photo to play: the chosen one, else the first; none in emoji mode. */
  function chosenPhoto(): Photo | undefined {
    if (!usePhotos) return undefined;
    return photos.find((p) => p.id === chosenId) ?? photos[0];
  }

  function syncSource(): void {
    if (!photos.length) {
      source.remove();
      closePicker?.();
    } else if (!source.isConnected) {
      ctx.stage.append(source);
    }
  }

  function setPhotos(list: Photo[]): void {
    photos = list;
    if (!photos.length) usePhotos = false;
    // The chosen photo is gone: back to the first one.
    if (chosenId !== null && !photos.some((p) => p.id === chosenId)) chosenId = null;
    syncSource();
  }

  /**
   * Size everything from the laid-out board: placed pieces fill their slot at
   * board scale, tray pieces are scaled so they all fit the tray (the largest
   * bounding box stands in for the cell), and every clip path is rewritten in
   * px. jsdom has no layout: nothing to do.
   */
  function layout(): void {
    if (!current) return;
    const size = board.getBoundingClientRect().width;
    if (size <= 0) return;
    let scale = 1;
    const t = tray.getBoundingClientRect();
    if (t.width > 0 && t.height > 0) {
      const cs = getComputedStyle(tray);
      const gap = parseFloat(cs.columnGap) || 0;
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const cellW = cell.w * size;
      const w = trayPieceWidth(els.length, cellW, cell.h * size, t.width - padX, t.height - padY, gap);
      // 3 % slack so rounding of gaps/borders never pushes a row's last piece onto the next line.
      scale = (w * 0.97) / cellW;
    }
    for (const e of els) {
      const { bbox } = e.p;
      const placed = e.piece.classList.contains('placed');
      const s = placed ? size : size * scale;
      if (placed) {
        e.piece.style.width = '100%';
        e.piece.style.height = '100%';
      } else {
        e.piece.style.width = px(bbox.w * s);
        e.piece.style.height = px(bbox.h * s);
        e.item.style.setProperty('--w', px(bbox.w * s));
        e.item.style.setProperty('--h', px(bbox.h * s));
      }
      e.piece.style.backgroundSize = `${px(s)} ${px(s)}`;
      e.piece.style.backgroundPosition = `${px(-bbox.x * s)} ${px(-bbox.y * s)}`;
      clipTo(e.piece, e.p, s);
      clipTo(e.slot, e.p, size);
    }
  }

  /**
   * Deal the current round. In photo mode the next family photo is rendered first
   * (the old round stays on screen, inert, meanwhile); if that fails the round is
   * an ordinary emoji round.
   */
  async function play(exclude?: string): Promise<void> {
    const id = ++deal;
    disposers.forEach((d) => d());
    disposers = [];
    let photoUrl: string | null = null;
    const photo = chosenPhoto();
    if (photo) {
      photoUrl = await renderPhotoPicture(photo.url, pictureSize());
      if (!alive || id !== deal) return;
    }
    build(photoUrl, exclude);
  }

  function build(photoUrl: string | null, exclude?: string): void {
    const r = makeJigsawRound(round, Math.random, exclude);
    current = r;
    const { cut } = r;
    const isPhoto = photoUrl !== null;
    const url = photoUrl ?? renderPicture(r.item.emoji, pictureSize(), r.bg);

    wrap.classList.toggle('jigsaw-many', r.pieces.length > 4);
    board.classList.remove('done');
    board.dataset.style = cut.style;
    cell = {
      w: Math.max(...cut.pieces.map((p) => p.bbox.w)),
      h: Math.max(...cut.pieces.map((p) => p.bbox.h)),
    };

    ghost.className = 'jigsaw-ghost';
    ghost.textContent = '';
    ghost.style.cssText = '';
    if (url) {
      ghost.style.backgroundImage = `url("${url}")`;
    } else {
      ghost.classList.add('jigsaw-ghost-plain');
      ghost.style.background = r.bg;
      ghost.textContent = r.item.emoji;
    }
    linesPath.setAttribute('d', scalePath(cut.lines, LINES_UNITS, LINES_UNITS));

    let placed = 0;
    els = r.pieces.map((p) => {
      const slot = h('div', { class: 'jigsaw-slot', 'data-id': p.id });
      slot.style.left = pct(p.bbox.x);
      slot.style.top = pct(p.bbox.y);
      slot.style.width = pct(p.bbox.w);
      slot.style.height = pct(p.bbox.h);
      const piece = h('div', { class: 'jigsaw-piece', 'data-id': p.id });
      if (url) {
        piece.style.backgroundImage = `url("${url}")`;
      } else {
        piece.classList.add('jigsaw-piece-plain');
        piece.style.background = r.bg;
        piece.textContent = r.item.emoji;
      }
      piece.append(edgeOf(p));
      // The tray item is the drag handle: never smaller than a tap target, the visual centred in it.
      const item = h('div', { class: 'g-item jigsaw-item', 'data-id': p.id }, piece);
      const e: PieceEls = { p, item, piece, slot };
      disposers.push(
        makeDraggable(item, {
          onDrop(el) {
            // Close enough to its own slot (centre to centre) wins; nothing else counts.
            const size = board.getBoundingClientRect().width;
            const a = el.getBoundingClientRect();
            const b = slot.getBoundingClientRect();
            const dx = a.left + a.width / 2 - (b.left + b.width / 2);
            const dy = a.top + a.height / 2 - (b.top + b.height / 2);
            if (Math.hypot(dx, dy) > DROP_TOLERANCE * size) {
              ctx.audio.boing();
              return false;
            }
            accept(e);
            return true;
          },
        }),
      );
      return e;
    });
    board.replaceChildren(ghost, lines, ...els.map((e) => e.slot));
    tray.replaceChildren(...els.map((e) => e.item));
    layout();

    function accept(e: PieceEls): void {
      e.item.classList.add('placed');
      e.piece.classList.add('placed');
      e.piece.style.transform = '';
      e.slot.classList.add('filled');
      e.slot.append(e.piece);
      e.item.remove();
      layout();
      replay(e.slot, 'anim-bounce');
      ctx.audio.ding();
      navigator.vibrate?.(15);
      placed++;
      if (placed === els.length) void finish(r, isPhoto);
    }

    ctx.speak(isPhoto ? 'Ghép ảnh nào!' : `Ghép ${r.item.name} nào!`);
    ctx.hint.arm(() => {
      const e = els.find((x) => !x.piece.classList.contains('placed'));
      if (!e) return;
      replay(e.piece, 'anim-wiggle');
      replay(e.slot, 'anim-wiggle');
    });
  }

  async function finish(r: JigsawRound, isPhoto: boolean): Promise<void> {
    board.classList.add('done');
    replay(board, 'anim-bounce');
    // A photo has no name to say; the celebration's praise is enough.
    if (!isPhoto) ctx.speak(r.item.name);
    ctx.hint.clear();
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
    round++;
    void play(r.item.emoji);
  }

  // Layout may settle after the first paint (fonts, safe areas): fit once more.
  const raf = requestAnimationFrame(() => layout());
  const onResize = (): void => layout();
  window.addEventListener('resize', onResize);

  const offPhotos = ctx.photos.onChange((list) => {
    if (alive) setPhotos(list);
  });

  ctx.onCleanup(() => {
    alive = false;
    closePicker?.();
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    offPhotos();
    disposers.forEach((d) => d());
  });

  // First round straight away (emoji); once the photos are known, start over in photo mode.
  void play();
  void ctx.photos.list().then((list) => {
    if (!alive) return;
    setPhotos(list);
    if (list.length) {
      usePhotos = true;
      void play();
    }
  });
}

const game: GameModule = { ...meta, start };
export default game;
