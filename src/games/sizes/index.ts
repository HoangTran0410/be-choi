import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable } from '../../core/drag';
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
  let disposers: Array<() => void> = [];
  let alive = true;
  let lastEmoji: string | undefined;

  const board = h('div', { class: 'g-board sizes-board' });
  const tray = h('div', { class: 'g-tray sizes-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => {
    alive = false;
    disposers.forEach((d) => d());
    disposers = [];
  });

  function play(): void {
    disposers.forEach((d) => d());
    disposers = [];
    const r = makeSizeRound(Math.random, lastEmoji);
    lastEmoji = r.item.emoji;

    function makeBox(big: boolean): HTMLElement {
      const key = keyOf(big);
      const label = h('span', { class: 'sizes-box-label' }, r.item.emoji);
      label.style.setProperty('--sizes-scale', String(big ? 1.3 : 0.6));
      const items = h('div', { class: 'sizes-box-items' });
      return h('div', { class: `g-target sizes-box sizes-box-${key}`, 'data-size': key }, label, items);
    }

    const boxes: Record<SizeKey, HTMLElement> = { big: makeBox(true), small: makeBox(false) };
    board.replaceChildren(boxes.big, boxes.small);

    let placed = 0;

    function makePiece(p: SizePiece): HTMLElement {
      const key = keyOf(p.big);
      const piece = h(
        'div',
        { class: `g-item sizes-piece sizes-piece-${key}`, 'data-size': key, 'data-id': p.id },
        h('span', { class: 'sizes-piece-emoji' }, r.item.emoji),
      );
      piece.style.setProperty('--sizes-scale', String(sizeScale(p.big)));
      disposers.push(
        makeDraggable(piece, {
          onStart: () => ctx.hint.touch(),
          onDrop(el, pt) {
            const targets = [boxes.big, boxes.small].map((box) => ({
              id: box.dataset.size ?? '',
              rect: box.getBoundingClientRect(),
            }));
            const tolerance = el.getBoundingClientRect().width * 0.25;
            if (hitTest(pt, targets, tolerance) !== key) {
              ctx.audio.boing();
              return false;
            }
            accept(el, boxes[key], p.big);
            return true;
          },
        }),
      );
      return piece;
    }

    const pieces = r.pieces.map(makePiece);
    tray.replaceChildren(...pieces);

    function accept(piece: HTMLElement, box: HTMLElement, big: boolean): void {
      piece.classList.add('placed');
      piece.style.transform = '';
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

    ctx.speak(`${r.item.name} to và nhỏ`);

    ctx.hint.arm(() => {
      const piece = pieces.find((x) => !x.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      replay(piece.dataset.size === 'big' ? boxes.big : boxes.small, 'anim-wiggle');
    });
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
