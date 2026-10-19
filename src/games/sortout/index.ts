import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable } from '../../core/drag';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { makeSortRound, type CategoryId } from './logic';
import './style.css';

/** Pointer travel under this many px counts as a tap, not a drag. */
const TAP_SLOP = 10;

/**
 * Sort-out: drag (or tap an item, then tap a bin) to put toys in the box,
 * clothes in the wardrobe and fruit in the basket. A wrong bin just sends the
 * item floating back, with no "wrong" feedback.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  let disposers: Array<() => void> = [];

  const board = h('div', { class: 'g-board sortout-board' });
  const tray = h('div', { class: 'g-tray sortout-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => {
    alive = false;
    disposers.forEach((d) => d());
    disposers = [];
  });

  function play(): void {
    disposers.forEach((d) => d());
    disposers = [];
    const r = makeSortRound(round);
    let placed = 0;
    let selected: HTMLElement | null = null;

    const select = (el: HTMLElement | null) => {
      selected?.classList.remove('selected');
      selected = el;
      el?.classList.add('selected');
    };

    const bins = r.bins.map((c) => {
      const contents = h('div', { class: 'sortout-contents' });
      const bin = h(
        'div',
        { class: 'g-target sortout-bin', 'data-cat': c.id },
        h('div', { class: 'sortout-bin-icon' }, c.bin),
        h('div', { class: 'sortout-bin-name' }, c.binName),
        contents,
      );
      return { cat: c.id, el: bin, contents };
    });
    board.replaceChildren(...bins.map((b) => b.el));

    function accept(piece: HTMLElement, cat: CategoryId, name: string): void {
      const bin = bins.find((b) => b.cat === cat);
      if (!bin) return;
      if (selected === piece) select(null);
      piece.classList.add('placed');
      piece.style.transform = '';
      delete piece.dataset.dx;
      delete piece.dataset.dy;
      bin.contents.append(piece);
      replay(piece, 'anim-bounce');
      replay(bin.el, 'anim-pulse');
      ctx.audio.ding();
      navigator.vibrate?.(15);
      ctx.speak(name);
      placed++;
      if (placed === r.items.length) {
        ctx.hint.clear();
        void ctx.celebrate().then(() => {
          if (!alive) return;
          ctx.addStar();
          round++;
          play();
        });
      }
    }

    /** Wrong bin: no message, just a soft boing and the item floats home. */
    function reject(piece: HTMLElement): void {
      ctx.audio.boing();
      replay(piece, 'anim-wiggle');
    }

    const pieces = r.items.map((it) => {
      const piece = h('div', { class: 'g-item sortout-piece', 'data-cat': it.category, 'data-id': it.id }, it.emoji);
      let travel = 0;
      let sx = 0;
      let sy = 0;
      const track = (e: PointerEvent) => {
        travel = Math.max(travel, Math.hypot(e.clientX - sx, e.clientY - sy));
      };
      const begin = (e: PointerEvent) => {
        sx = e.clientX;
        sy = e.clientY;
        travel = 0;
      };
      piece.addEventListener('pointerdown', begin);
      piece.addEventListener('pointermove', track);
      disposers.push(() => {
        piece.removeEventListener('pointerdown', begin);
        piece.removeEventListener('pointermove', track);
      });
      disposers.push(
        makeDraggable(piece, {
          onDrop(el, p) {
            ctx.hint.touch();
            if (travel < TAP_SLOP) {
              // A tap: pick the item up (or put it down); then a tap on a bin files it.
              select(selected === el ? null : el);
              return false;
            }
            const targets = bins.map((b) => ({ id: b.cat, rect: b.el.getBoundingClientRect() }));
            const hit = hitTest(p, targets, el.getBoundingClientRect().width * 0.25);
            if (hit === it.category) {
              accept(el, it.category, it.name);
              return true;
            }
            if (hit) select(null);
            reject(el);
            return false;
          },
        }),
      );
      return piece;
    });
    tray.replaceChildren(...pieces);

    for (const b of bins) {
      const onTap = () => {
        ctx.hint.touch();
        const piece = selected;
        if (!piece) return;
        const it = r.items.find((x) => x.id === piece.dataset.id);
        if (!it) return;
        if (it.category === b.cat) {
          accept(piece, b.cat, it.name);
        } else {
          select(null);
          reject(piece);
        }
      };
      b.el.addEventListener('click', onTap);
      disposers.push(() => b.el.removeEventListener('click', onTap));
    }

    ctx.hint.arm(() => {
      const piece = pieces.find((p) => !p.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      const bin = bins.find((b) => b.cat === piece.dataset.cat);
      if (bin) replay(bin.el, 'anim-wiggle');
    });
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
