import { ANIMALS, voiceOf } from '../../core/content';
import { h, randInt, replay, shuffle } from '../../core/dom';
import { makeDraggable } from '../../core/drag';
import { makeTappable } from '../../core/tap';
import { makeCut, renderPhotoPicture, renderPicture, scalePath, trayPieceWidth, type CutPiece } from '../jigsaw/logic';
import { artBg, pickArt, pieceHint, puzzleLevel, vehicleVoice, type PuzzleArt } from './levels';
import { pullElement } from './magnet';
import { renderScene } from './scenes';
import type { ModeCtl, Workshop } from './types';
import { speakText } from '../../core/say';

const PICTURE_MIN = 256;
const PICTURE_MAX = 1024;
/** A piece within this fraction of the board side of its place is pulled in and counts as put there. */
const MAGNET = 0.3;
const LINES_UNITS = 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';

function pictureSize(): number {
  const vmin = Math.min(window.innerWidth, window.innerHeight) || PICTURE_MIN;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return Math.max(PICTURE_MIN, Math.min(PICTURE_MAX, Math.round(vmin * 0.7 * dpr)));
}

const px = (n: number): string => `${Math.round(n * 100) / 100}px`;
const pct = (n: number): string => `${Math.round(n * 1e4) / 100}%`;

function clipTo(el: HTMLElement, p: CutPiece, size: number): void {
  el.style.clipPath = `path("${scalePath(p.path, size, size, -p.bbox.x * size, -p.bbox.y * size)}")`;
}

/** Thin white line along the piece's outline (clipped with the piece, so only the inner half shows). */
function edgeOf(p: CutPiece): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bw-pz-edge');
  svg.setAttribute('viewBox', `${p.bbox.x} ${p.bbox.y} ${p.bbox.w} ${p.bbox.h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', p.path);
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  return svg;
}

interface PieceEls {
  p: CutPiece;
  item: HTMLElement;
  piece: HTMLElement;
  slot: HTMLElement;
}

/**
 * Ghép tranh: drag the pieces of a picture onto the board. The picture is a ready-made one (animals,
 * vehicles, fruits, scenes, unlocked by stars) or a family photo; the cut gets harder with the stars
 * (see `puzzleLevel`). A piece near its place is pulled in like a magnet; when the picture is whole
 * it comes alive: it breathes, sparkles and makes its sound.
 */
export function createPuzzleMode(w: Workshop): ModeCtl {
  const { ctx } = w;
  let alive = true;
  let active = false;
  /** Pictures finished or started this visit, used to take turns between photos and ready-made ones. */
  let round = 0;
  let deal = 0;
  let placed = 0;
  let finishing = false;
  let lastArtId: string | undefined;
  let els: PieceEls[] = [];
  let cell = { w: 1, h: 1 };
  let disposers: Array<() => void> = [];
  let hasRound = false;

  const board = h('div', { class: 'bw-pz-board' });
  const ghost = h('div', { class: 'bw-pz-ghost' });
  const lines = document.createElementNS(SVG_NS, 'svg');
  lines.setAttribute('class', 'bw-pz-lines');
  lines.setAttribute('viewBox', `0 0 ${LINES_UNITS} ${LINES_UNITS}`);
  lines.setAttribute('preserveAspectRatio', 'none');
  const linesPath = document.createElementNS(SVG_NS, 'path');
  linesPath.setAttribute('vector-effect', 'non-scaling-stroke');
  lines.append(linesPath);
  const caption = h('div', { class: 'bw-caption', 'aria-live': 'polite' });
  const area = h('div', { class: 'bw-pz-area' }, board);
  const tray = h('div', { class: 'bw-tray bw-pz-tray' });
  const source = h(
    'button',
    { class: 'bw-btn bw-source', type: 'button', 'aria-label': 'Chọn ảnh', hidden: true },
    h('span', { class: 'bw-ico' }, '🖼️'),
  );
  makeTappable(source, () => w.choosePhoto(), { ctx, cooldownMs: 300 });
  const el = h('section', { class: 'bw-mode bw-pz' }, area, tray, caption, source);

  function layout(): void {
    const size = board.getBoundingClientRect().width;
    if (size <= 0 || !els.length) return;
    let scale = 1;
    const t = tray.getBoundingClientRect();
    if (t.width > 0 && t.height > 0) {
      const cs = getComputedStyle(tray);
      const gap = parseFloat(cs.columnGap) || 0;
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const cellW = cell.w * size;
      const unplaced = els.filter((e) => !e.piece.classList.contains('placed')).length;
      const wide = trayPieceWidth(Math.max(1, unplaced), cellW, cell.h * size, t.width - padX, t.height - padY, gap);
      scale = (wide * 0.97) / cellW;
    }
    for (const e of els) {
      const { bbox } = e.p;
      const isPlaced = e.piece.classList.contains('placed');
      const s = isPlaced ? size : size * scale;
      if (isPlaced) {
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

  function syncSource(): void {
    source.hidden = w.photos().length === 0;
  }

  async function play(): Promise<void> {
    const id = ++deal;
    disposers.forEach((d) => d());
    disposers = [];
    hasRound = true;
    const stars = w.stars('puzzle');
    const photo = w.photoFor(round);
    let url: string | null = null;
    let art: PuzzleArt | null = null;
    const size = pictureSize();
    if (photo) {
      url = await renderPhotoPicture(photo.url, size);
      if (!alive || id !== deal) return;
    }
    if (!url) {
      art = pickArt(stars, Math.random, lastArtId);
      lastArtId = art.id;
      url = art.kind === 'scene' && art.scene ? renderScene(art.scene, size) : renderPicture(art.emoji, size, artBg());
    }
    build(url, art, stars);
  }

  function build(url: string | null, art: PuzzleArt | null, stars: number): void {
    const cut = makeCut(puzzleLevel(stars));
    const pieces = shuffle(cut.pieces);
    const isPhoto = art === null;
    placed = 0;
    finishing = false;
    board.classList.remove('done', 'alive');
    board.dataset.style = cut.style;
    caption.textContent = '';
    caption.classList.remove('show');
    board.querySelectorAll('.bw-spark').forEach((s) => s.remove());
    el.classList.toggle('bw-many', pieces.length > 4);
    cell = { w: Math.max(...cut.pieces.map((p) => p.bbox.w)), h: Math.max(...cut.pieces.map((p) => p.bbox.h)) };

    const bg = art?.kind === 'scene' && art.scene ? art.scene.sky[0] : '#fde68a';
    ghost.className = 'bw-pz-ghost';
    ghost.textContent = '';
    ghost.style.cssText = '';
    if (url) ghost.style.backgroundImage = `url("${url}")`;
    else {
      ghost.classList.add('bw-pz-plain');
      ghost.style.background = bg;
      ghost.textContent = art?.emoji ?? '🖼️';
    }
    linesPath.setAttribute('d', scalePath(cut.lines, LINES_UNITS, LINES_UNITS));

    els = pieces.map((p) => {
      const slot = h('div', { class: 'bw-pz-slot', 'data-id': p.id });
      slot.style.left = pct(p.bbox.x);
      slot.style.top = pct(p.bbox.y);
      slot.style.width = pct(p.bbox.w);
      slot.style.height = pct(p.bbox.h);
      const piece = h('div', { class: 'bw-pz-piece', 'data-id': p.id });
      if (url) piece.style.backgroundImage = `url("${url}")`;
      else {
        piece.classList.add('bw-pz-piece-plain');
        piece.style.background = bg;
        piece.textContent = art?.emoji ?? '🖼️';
      }
      piece.append(edgeOf(p));
      const item = h('div', { class: 'g-item bw-pz-item', 'data-id': p.id }, piece);
      const e: PieceEls = { p, item, piece, slot };
      const center = () => {
        const r = slot.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const radius = () => MAGNET * board.getBoundingClientRect().width;
      disposers.push(
        makeDraggable(item, {
          onStart(node) {
            node.classList.remove('anim-wiggle');
            ctx.hint.touch();
          },
          onMove(node) {
            pullElement(node, center(), radius());
          },
          onDrop(node) {
            node.classList.remove('bw-near');
            const a = node.getBoundingClientRect();
            const c = center();
            if (Math.hypot(a.left + a.width / 2 - c.x, a.top + a.height / 2 - c.y) > radius()) {
              ctx.audio.boing();
              return false;
            }
            accept(e, isPhoto, art);
            return true;
          },
        }),
      );
      return e;
    });
    board.replaceChildren(ghost, lines, ...els.map((e) => e.slot), caption);
    tray.replaceChildren(...els.map((e) => e.item));
    layout();

    const name = art ? art.name : 'bức ảnh của nhà mình';
    if (active) speakText(ctx, isPhoto ? 'Ghép ảnh nhà mình nào' : `Mình ghép ${name} nhé`);
    armHint();
  }

  function armHint(): void {
    w.arm(() => {
      const e = els.find((x) => !x.piece.classList.contains('placed'));
      if (!e) return;
      replay(e.item, 'anim-wiggle');
      replay(e.slot, 'anim-wiggle');
      speakText(ctx, pieceHint(e.p.cx, e.p.cy));
    });
  }

  function accept(e: PieceEls, isPhoto: boolean, art: PuzzleArt | null): void {
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
    ctx.hint.touch();
    if (placed === els.length) void finish(isPhoto, art);
  }

  /** The picture comes alive: it breathes, sparkles and makes its sound. */
  async function finish(isPhoto: boolean, art: PuzzleArt | null): Promise<void> {
    if (finishing) return;
    finishing = true;
    ctx.hint.clear();
    board.classList.add('done', 'alive');
    const sparks = w.lite() ? 3 : 7;
    for (let i = 0; i < sparks; i++) {
      const s = h('span', { class: 'bw-spark', 'aria-hidden': 'true' }, i % 2 ? '✨' : '⭐');
      s.style.left = `${randInt(8, 84)}%`;
      s.style.top = `${randInt(8, 80)}%`;
      s.style.animationDelay = `${(i * 0.18).toFixed(2)}s`;
      board.append(s);
    }
    const name = art ? art.name : 'bức ảnh của nhà mình';
    caption.textContent = art ? `${art.emoji} ${art.name}` : '📷';
    caption.classList.add('show');
    if (!isPhoto && art) {
      speakText(ctx, art.name);
      const animal = ANIMALS.find((a) => a.emoji === art.emoji);
      const vehicle = vehicleVoice(art.emoji);
      if (animal) ctx.audio.fx(voiceOf(animal));
      else if (vehicle) ctx.audio.fx(vehicle);
      else ctx.audio.fx('sparkle');
    } else {
      speakText(ctx, `Ảnh đẹp quá! ${name}`);
      ctx.audio.fx('sparkle');
    }
    await ctx.celebrate();
    if (!alive) return;
    const unlocked = w.award('puzzle');
    round++;
    if (unlocked.length && active) speakText(ctx, `Có tranh mới rồi! ${unlocked.join(', ')}`);
    w.later(() => void play(), unlocked.length ? 1800 : 600);
  }

  const offPhotos = w.onPhotosChange(() => {
    syncSource();
    // Photos arrived (or went) before the child touched anything: deal again with the new choice.
    if (alive && hasRound && placed === 0 && !finishing) void play();
  });

  return {
    el,
    enter() {
      active = true;
      syncSource();
      if (!hasRound) void play();
      else armHint();
    },
    leave() {
      active = false;
      ctx.hint.clear();
    },
    relayout: layout,
    destroy() {
      alive = false;
      disposers.forEach((d) => d());
      disposers = [];
      offPhotos();
    },
  };
}
