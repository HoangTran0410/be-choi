import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable } from '../../core/drag';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { holeSvg, makeShapeRound, shapeDef, shapeSvg } from './logic';
import './style.css';

/**
 * Shape sorter: drag each colored shape onto the hole with the same outline.
 * Reference implementation for drag-and-drop games.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  let disposers: Array<() => void> = [];

  const board = h('div', { class: 'g-board shapes-board' });
  const tray = h('div', { class: 'g-tray shapes-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => {
    alive = false;
    disposers.forEach((d) => d());
  });

  function play(): void {
    disposers.forEach((d) => d());
    disposers = [];
    const r = makeShapeRound(round);

    const holes = r.targets.map((t) => {
      const hole = h('div', { class: 'g-target hole', 'data-shape': t.shape });
      hole.append(holeSvg(t.shape));
      return hole;
    });
    board.replaceChildren(...holes);

    let placed = 0;
    const pieces = r.tray.map((t) => {
      const piece = h('div', { class: 'g-item piece', 'data-shape': t.shape });
      piece.append(shapeSvg(t.shape, t.color));
      disposers.push(
        makeDraggable(piece, {
          onDrop(el, p) {
            const open = holes
              .filter((hole) => !hole.classList.contains('filled'))
              .map((hole) => ({ id: hole.dataset.shape ?? '', rect: hole.getBoundingClientRect() }));
            const tolerance = el.getBoundingClientRect().width * 0.25;
            const hit = hitTest(p, open, tolerance);
            if (hit !== t.shape) {
              ctx.audio.boing();
              return false;
            }
            const hole = holes.find((x) => x.dataset.shape === t.shape);
            if (!hole) return false;
            accept(el, hole);
            return true;
          },
        }),
      );
      return piece;
    });
    tray.replaceChildren(...pieces);

    function accept(piece: HTMLElement, hole: HTMLElement): void {
      piece.classList.add('placed');
      piece.style.transform = '';
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

    ctx.hint.arm(() => {
      const piece = pieces.find((p) => !p.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      const hole = holes.find((x) => x.dataset.shape === piece.dataset.shape);
      if (hole) replay(hole, 'anim-wiggle');
    });
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
