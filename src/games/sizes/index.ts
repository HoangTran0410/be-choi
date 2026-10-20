import { h, replay } from '../../core/dom';
import { createDragDrop, pickTarget } from '../../core/dragdrop';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { makeSizeRound, sizeScale, sizeWord, type SizePiece } from './logic';
import './style.css';

type SizeKey = 'big' | 'small';
const keyOf = (big: boolean): SizeKey => (big ? 'big' : 'small');

/**
 * Big vs small: a big box and a small box on the board, four copies of one
 * emoji in the tray (two big, two small). Drag each copy into the box of its size.
 */
function start(ctx: GameContext): void {
  let detach: Array<() => void> = [];
  let alive = true;
  let lastEmoji: string | undefined;
  let boxes: Record<SizeKey, HTMLElement> | null = null;
  let pieces: HTMLElement[] = [];
  let placed = 0;

  const board = h('div', { class: 'g-board sizes-board' });
  const tray = h('div', { class: 'g-tray sizes-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => {
    alive = false;
  });

  // One shared drag-and-drop (core/dragdrop) for every piece; each round attaches its own pieces.
  const dd = createDragDrop<HTMLElement>({
    layer: ctx.stage,
    targets: () => (boxes ? (['big', 'small'] as const).map((k) => ({ id: k, rect: boxes![k].getBoundingClientRect() })) : []),
    resolve: (p, t) => pickTarget(p, t, { tolerance: 14 }),
    ghost: (_piece, el) => {
      const g = el.cloneNode(true) as HTMLElement;
      g.classList.remove('anim-wiggle', 'is-carried');
      return g;
    },
    onPickUp: () => ctx.hint.touch(),
    onHover: (id) => (['big', 'small'] as const).forEach((k) => boxes?.[k].classList.toggle('is-hover', k === id)),
    onDrop(piece, hit) {
      ctx.hint.touch();
      const key = piece.dataset.size as SizeKey;
      if (!boxes || hit !== key) {
        ctx.audio.boing();
        return false;
      }
      accept(piece, boxes[key], key === 'big');
      return true;
    },
    ctx,
  });

  function accept(piece: HTMLElement, box: HTMLElement, big: boolean): void {
    piece.classList.add('placed');
    const row = box.querySelector('.sizes-box-items') ?? box;
    row.append(piece);
    if (row.querySelectorAll('.sizes-piece').length >= 2) box.classList.add('sizes-full');
    replay(piece, 'anim-bounce');
    ctx.audio.ding();
    navigator.vibrate?.(15);
    ctx.speak(sizeWord(big));
    placed++;
    if (placed === pieces.length) {
      ctx.hint.clear();
      void ctx.celebrate().then(() => {
        if (!alive) return;
        ctx.addStar();
        play();
      });
    }
  }

  function play(): void {
    detach.forEach((d) => d());
    detach = [];
    const r = makeSizeRound(Math.random, lastEmoji);
    lastEmoji = r.item.emoji;

    function makeBox(big: boolean): HTMLElement {
      const key = keyOf(big);
      const label = h('span', { class: 'sizes-box-label' }, r.item.emoji);
      label.style.setProperty('--sizes-scale', String(big ? 1.3 : 0.6));
      const items = h('div', { class: 'sizes-box-items' });
      return h('div', { class: `g-target sizes-box sizes-box-${key}`, 'data-size': key }, label, items);
    }

    const made: Record<SizeKey, HTMLElement> = { big: makeBox(true), small: makeBox(false) };
    boxes = made;
    board.replaceChildren(made.big, made.small);

    placed = 0;

    function makePiece(p: SizePiece): HTMLElement {
      const key = keyOf(p.big);
      const piece = h(
        'div',
        { class: `g-item sizes-piece sizes-piece-${key}`, 'data-size': key, 'data-id': p.id },
        h('span', { class: 'sizes-piece-emoji' }, r.item.emoji),
      );
      piece.style.setProperty('--sizes-scale', String(sizeScale(p.big)));
      detach.push(dd.attach(piece, () => (piece.classList.contains('placed') ? null : piece)));
      return piece;
    }

    pieces = r.pieces.map(makePiece);
    tray.replaceChildren(...pieces);

    ctx.speak(`${r.item.name} to và nhỏ`);

    ctx.hint.arm(() => {
      const piece = pieces.find((x) => !x.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      replay(piece.dataset.size === 'big' ? made.big : made.small, 'anim-wiggle');
      ctx.speak(piece.dataset.size === 'big' ? 'Con to vào hộp to nào' : 'Con nhỏ vào hộp nhỏ nào');
    });
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
