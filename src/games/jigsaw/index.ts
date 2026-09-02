import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable } from '../../core/drag';
import type { Photo } from '../../core/photos';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { makeJigsawRound, renderPhotoPicture, renderPicture, trayPieceWidth, type JigsawRound } from './logic';
import './style.css';

/** Picture bitmap side, clamped: about 70vmin at device resolution. */
const PICTURE_MIN = 256;
const PICTURE_MAX = 1024;

function pictureSize(): number {
  const vmin = Math.min(window.innerWidth, window.innerHeight) || PICTURE_MIN;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return Math.max(PICTURE_MIN, Math.min(PICTURE_MAX, Math.round(vmin * 0.7 * dpr)));
}

function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

/**
 * Jigsaw: drag the pieces of a picture into their cells on a square grid.
 * 2×2 for two rounds, then 3×2, then 3×3. The picture is an emoji painted on
 * a canvas once per round, or — when a parent picked family photos — one of
 * those photos, cycling in order; a 🐣/📷 toggle in the corner switches between
 * the two. Every piece shows its cell via background-position.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  let disposers: Array<() => void> = [];
  let current: JigsawRound | null = null;
  let pieces: HTMLElement[] = [];
  /** Family photos, if any; the toggle exists only while there are some. */
  let photos: Photo[] = [];
  let usePhotos = false;
  let photoIndex = 0;
  /** Bumped per deal so a slow photo render never builds a stale round. */
  let deal = 0;

  const wrap = h('div', { class: 'jigsaw' });
  const area = h('div', { class: 'jigsaw-area' });
  const board = h('div', { class: 'jigsaw-board' });
  const ghost = h('div', { class: 'jigsaw-ghost' });
  const tray = h('div', { class: 'g-tray jigsaw-tray' });
  area.append(board);
  wrap.append(area, tray);
  ctx.stage.append(wrap);

  const toggle = h('button', { class: 'btn-round jigsaw-source', type: 'button', 'aria-label': 'Đổi ảnh' });
  toggle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!photos.length) return;
    usePhotos = !usePhotos;
    syncToggle();
    ctx.audio.pop();
    void play();
  });

  function syncToggle(): void {
    toggle.textContent = usePhotos ? '🐣' : '📷';
    if (!photos.length) toggle.remove();
    else if (!toggle.isConnected) ctx.stage.append(toggle);
  }

  function setPhotos(list: Photo[]): void {
    photos = list;
    if (!photos.length) usePhotos = false;
    syncToggle();
  }

  /** Size tray pieces from the laid-out board and tray. jsdom has no layout: keep the CSS default. */
  function fit(): void {
    if (!current) return;
    const b = board.getBoundingClientRect();
    const t = tray.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0 || t.width <= 0 || t.height <= 0) return;
    const cs = getComputedStyle(tray);
    const gap = parseFloat(cs.columnGap) || 0;
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const w = trayPieceWidth(
      current.pieces.length,
      b.width / current.cols,
      b.height / current.rows,
      t.width - padX,
      t.height - padY,
      gap,
    );
    // 3 % slack so rounding of gaps/borders never pushes a row's last piece onto the next line.
    tray.style.setProperty('--jigsaw-pw', `${(w * 0.97).toFixed(1)}px`);
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
    const photo = usePhotos && photos.length ? photos[photoIndex % photos.length] : undefined;
    if (photo) {
      photoIndex++;
      photoUrl = await renderPhotoPicture(photo.url, pictureSize());
      if (!alive || id !== deal) return;
    }
    build(photoUrl, exclude);
  }

  function build(photoUrl: string | null, exclude?: string): void {
    const r = makeJigsawRound(round, Math.random, exclude);
    current = r;
    const { cols, rows } = r;
    const isPhoto = photoUrl !== null;
    const url = photoUrl ?? renderPicture(r.item.emoji, pictureSize(), r.bg);

    wrap.classList.toggle('jigsaw-many', r.pieces.length > 4);
    board.classList.remove('done');
    board.style.setProperty('--jigsaw-cols', String(cols));
    board.style.setProperty('--jigsaw-rows', String(rows));
    tray.style.setProperty('--jigsaw-ar', `${rows} / ${cols}`);

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

    const slots: HTMLElement[] = [];
    for (let rr = 0; rr < rows; rr++) {
      for (let cc = 0; cc < cols; cc++) slots.push(h('div', { class: 'jigsaw-slot', 'data-r': rr, 'data-c': cc }));
    }
    board.replaceChildren(ghost, ...slots);
    const slotAt = (rr: number, cc: number): HTMLElement | undefined => slots[rr * cols + cc];

    let placed = 0;
    pieces = r.pieces.map((p) => {
      const piece = h('div', { class: 'g-item jigsaw-piece', 'data-r': p.r, 'data-c': p.c, 'data-id': String(p.id) });
      if (url) {
        piece.style.backgroundImage = `url("${url}")`;
        piece.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
        const x = cols > 1 ? (p.c * 100) / (cols - 1) : 0;
        const y = rows > 1 ? (p.r * 100) / (rows - 1) : 0;
        piece.style.backgroundPosition = `${x}% ${y}%`;
      } else {
        piece.classList.add('jigsaw-piece-plain');
        piece.style.background = r.bg;
        piece.textContent = r.item.emoji;
      }
      disposers.push(
        makeDraggable(piece, {
          onDrop(el, pt) {
            const own = slotAt(p.r, p.c);
            if (!own) return false;
            // Own cell first: a drop within tolerance of the right cell wins over a neighbour.
            const open = [own, ...slots.filter((s) => s !== own && !s.classList.contains('filled'))].map((s) => ({
              id: cellKey(Number(s.dataset.r), Number(s.dataset.c)),
              rect: s.getBoundingClientRect(),
            }));
            const tolerance = el.getBoundingClientRect().width * 0.3;
            if (hitTest(pt, open, tolerance) !== cellKey(p.r, p.c)) {
              ctx.audio.boing();
              return false;
            }
            accept(el, own);
            return true;
          },
        }),
      );
      return piece;
    });
    tray.replaceChildren(...pieces);
    fit();

    function accept(piece: HTMLElement, slot: HTMLElement): void {
      piece.classList.add('placed');
      piece.style.transform = '';
      slot.classList.add('filled');
      slot.append(piece);
      replay(piece, 'anim-bounce');
      ctx.audio.ding();
      navigator.vibrate?.(15);
      placed++;
      if (placed === slots.length) void finish(r, isPhoto);
    }

    ctx.speak(isPhoto ? 'Ghép ảnh nào!' : `Ghép ${r.item.name} nào!`);
    ctx.hint.arm(() => {
      const piece = pieces.find((x) => !x.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      const slot = slotAt(Number(piece.dataset.r), Number(piece.dataset.c));
      if (slot) replay(slot, 'anim-wiggle');
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
  const raf = requestAnimationFrame(() => fit());
  const onResize = (): void => fit();
  window.addEventListener('resize', onResize);

  const offPhotos = ctx.photos.onChange((list) => {
    if (alive) setPhotos(list);
  });

  ctx.onCleanup(() => {
    alive = false;
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
      syncToggle();
      void play();
    }
  });
}

const game: GameModule = { ...meta, start };
export default game;
