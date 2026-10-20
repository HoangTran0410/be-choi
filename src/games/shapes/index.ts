import { h, replay } from '../../core/dom';
import { createDragDrop, pickTarget } from '../../core/dragdrop';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { holeSvg, makeShapeRound, shapeDef, shapeSvg } from './logic';
import './style.css';

/** Shape sorter: drag each colored shape onto the hole with the same outline. */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  let holes: HTMLElement[] = [];
  let pieces: HTMLElement[] = [];
  let placed = 0;
  let detach: Array<() => void> = [];

  const board = h('div', { class: 'g-board shapes-board' });
  const tray = h('div', { class: 'g-tray shapes-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => {
    alive = false;
  });

  // One shared drag-and-drop (core/dragdrop) for every piece; each round attaches its own pieces.
  const dd = createDragDrop<HTMLElement>({
    layer: ctx.stage,
    targets: () =>
      holes
        .filter((hole) => !hole.classList.contains('filled'))
        .map((hole) => ({ id: hole.dataset.shape ?? '', rect: hole.getBoundingClientRect() })),
    resolve: (p, t) => pickTarget(p, t, { tolerance: 14 }),
    ghost: (_piece, el) => {
      const g = el.cloneNode(true) as HTMLElement;
      g.classList.remove('anim-wiggle', 'is-carried');
      return g;
    },
    onPickUp: () => ctx.hint.touch(),
    onHover: (id) =>
      holes.forEach((hole) => hole.classList.toggle('is-hover', hole.dataset.shape === id && !hole.classList.contains('filled'))),
    onDrop(piece, hit) {
      ctx.hint.touch();
      const hole = holes.find((x) => x.dataset.shape === piece.dataset.shape);
      if (!hole || hit !== piece.dataset.shape) {
        ctx.audio.boing();
        return false;
      }
      accept(piece, hole);
      return true;
    },
    ctx,
  });

  function accept(piece: HTMLElement, hole: HTMLElement): void {
    piece.classList.add('placed');
    hole.classList.add('filled');
    hole.append(piece);
    replay(piece, 'anim-bounce');
    ctx.audio.ding();
    navigator.vibrate?.(15);
    const shape = piece.dataset.shape;
    if (shape) ctx.speak(shapeDef(shape as never).name);
    placed++;
    if (placed === holes.length) {
      ctx.hint.clear();
      void ctx.celebrate().then(() => {
        if (!alive) return;
        ctx.addStar();
        round++;
        play();
      });
    }
  }

  function play(): void {
    detach.forEach((d) => d());
    detach = [];
    const r = makeShapeRound(round);

    holes = r.targets.map((t) => {
      const hole = h('div', { class: 'g-target hole', 'data-shape': t.shape });
      hole.append(holeSvg(t.shape));
      return hole;
    });
    board.replaceChildren(...holes);

    placed = 0;
    pieces = r.tray.map((t) => {
      const piece = h('div', { class: 'g-item piece', 'data-shape': t.shape });
      piece.append(shapeSvg(t.shape, t.color));
      detach.push(dd.attach(piece, () => (piece.classList.contains('placed') ? null : piece)));
      return piece;
    });
    tray.replaceChildren(...pieces);

    ctx.hint.arm(() => {
      const piece = pieces.find((p) => !p.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      const hole = holes.find((x) => x.dataset.shape === piece.dataset.shape);
      if (hole) replay(hole, 'anim-wiggle');
      // Spoken rarely: the shell's quiet-voice gate lets only a few of these through in a row.
      ctx.speak(hole ? `${shapeDef(piece.dataset.shape as never).name} vào lỗ nào` : 'Bỏ hình vào đúng lỗ nào');
    });
    if (round === 0) ctx.speak('Bỏ hình vào đúng lỗ nào');
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
