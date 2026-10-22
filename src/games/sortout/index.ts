import { h, replay } from '../../core/dom';
import { createDragDrop, pickTarget } from '../../core/dragdrop';
import type { GameContext, GameModule } from '../../core/types';
import { makeTappable } from '../../core/tap';
import { meta } from './meta';
import { makeSortRound, type CategoryId } from './logic';
import './style.css';

/**
 * Sort-out: drag (or tap an item, then tap a bin) to put toys in the box,
 * clothes in the wardrobe and fruit in the basket. A wrong bin just sends the
 * item floating back, with no "wrong" feedback.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  let disposers: Array<() => void> = [];
  let bins: Array<{ cat: CategoryId; el: HTMLElement; contents: HTMLElement }> = [];
  let items: Array<{ id: string; category: CategoryId; name: string }> = [];
  let selected: HTMLElement | null = null;
  let pieces: HTMLElement[] = [];
  let placed = 0;

  const board = h('div', { class: 'g-board sortout-board' });
  const tray = h('div', { class: 'g-tray sortout-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => {
    alive = false;
    disposers.forEach((d) => d());
    disposers = [];
  });

  const select = (el: HTMLElement | null): void => {
    selected?.classList.remove('selected');
    selected = el;
    el?.classList.add('selected');
  };

  // One shared drag-and-drop (core/dragdrop) for every item; a tap (no drag) selects it for the tap-a-bin way.
  const dd = createDragDrop<HTMLElement>({
    layer: ctx.stage,
    targets: () => bins.map((b) => ({ id: b.cat, rect: b.el.getBoundingClientRect() })),
    resolve: (p, t) => pickTarget(p, t, { tolerance: 14 }),
    ghost: (_piece, el) => {
      const g = el.cloneNode(true) as HTMLElement;
      g.classList.remove('anim-wiggle', 'is-carried', 'selected');
      return g;
    },
    onTap(piece) {
      ctx.hint.touch();
      // A tap: pick the item up (or put it down); then a tap on a bin files it.
      select(selected === piece ? null : piece);
    },
    onPickUp: () => ctx.hint.touch(),
    onHover: (id) => bins.forEach((b) => b.el.classList.toggle('is-hover', b.cat === id)),
    onDrop(piece, hit) {
      ctx.hint.touch();
      const it = items.find((x) => x.id === piece.dataset.id);
      if (it && hit === it.category) {
        accept(piece, it.category, it.name);
        return true;
      }
      if (hit) select(null);
      reject(piece);
      return false;
    },
    ctx,
  });

  function accept(piece: HTMLElement, cat: CategoryId, name: string): void {
    const bin = bins.find((b) => b.cat === cat);
    if (!bin) return;
    if (selected === piece) select(null);
    piece.classList.add('placed');
    bin.contents.append(piece);
    replay(piece, 'anim-bounce');
    replay(bin.el, 'anim-pulse');
    ctx.audio.ding();
    navigator.vibrate?.(15);
    ctx.speak(name);
    placed++;
    if (placed === items.length) {
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

  function play(): void {
    disposers.forEach((d) => d());
    disposers = [];
    const r = makeSortRound(round);
    items = r.items;
    placed = 0;
    select(null);

    bins = r.bins.map((c) => {
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

    pieces = r.items.map((it) => {
      const piece = h('div', { class: 'g-item sortout-piece', 'data-cat': it.category, 'data-id': it.id }, it.emoji);
      disposers.push(dd.attach(piece, () => (piece.classList.contains('placed') ? null : piece)));
      return piece;
    });
    tray.replaceChildren(...pieces);

    for (const b of bins) {
      const onTap = () => {
        ctx.hint.touch();
        const piece: HTMLElement | null = selected;
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
      disposers.push(makeTappable(b.el, onTap, { cooldownMs: 0 }));
    }

    ctx.hint.arm(() => {
      const piece = pieces.find((p) => !p.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      const bin = bins.find((b) => b.cat === piece.dataset.cat);
      if (bin) replay(bin.el, 'anim-wiggle');
      // Spoken rarely: the shell's quiet-voice gate lets only a few of these through in a row.
      ctx.speak(
        bin
          ? `${items.find((x) => x.id === piece.dataset.id)?.name ?? 'Món này'} vào ${bin.el.querySelector('.sortout-bin-name')?.textContent ?? 'chỗ của nó'} nào`
          : 'Cất đồ vào đúng chỗ nào',
      );
    });
    if (round === 0) ctx.speak('Cất đồ vào đúng chỗ nào');
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
