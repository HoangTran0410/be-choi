import { h, replay } from '../../core/dom';
import { hitTest, makeDraggable } from '../../core/drag';
import type { Item } from '../../core/content';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { makeShadowRound } from './logic';
import './style.css';

/**
 * Shadow match: drag each coloured animal onto its black silhouette.
 * Structure mirrors the shapes game (drag-and-drop reference).
 */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  let disposers: Array<() => void> = [];

  const board = h('div', { class: 'g-board shadows-board' });
  const tray = h('div', { class: 'g-tray shadows-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => {
    alive = false;
    disposers.forEach((d) => d());
    disposers = [];
  });

  function play(): void {
    if (!alive) return;
    disposers.forEach((d) => d());
    disposers = [];
    const r = makeShadowRound(round);

    const shadows = r.animals.map((a) => {
      const shadow = h('div', { class: 'g-target shadows-shadow', 'data-emoji': a.emoji });
      shadow.append(h('span', { class: 'shadows-glyph' }, a.emoji));
      return shadow;
    });
    board.replaceChildren(...shadows);

    let placed = 0;
    const pieces = r.tray.map((a) => {
      const piece = h('div', { class: 'g-item shadows-piece', 'data-emoji': a.emoji }, a.emoji);
      disposers.push(
        makeDraggable(piece, {
          onDrop(el, p) {
            const open = shadows
              .filter((s) => !s.classList.contains('revealed'))
              .map((s) => ({ id: s.dataset.emoji ?? '', rect: s.getBoundingClientRect() }));
            const tolerance = el.getBoundingClientRect().width * 0.25;
            const hit = hitTest(p, open, tolerance);
            if (hit !== a.emoji) {
              ctx.audio.boing();
              return false;
            }
            const shadow = shadows.find((s) => s.dataset.emoji === a.emoji);
            if (!shadow) return false;
            accept(el, shadow, a);
            return true;
          },
        }),
      );
      return piece;
    });
    tray.replaceChildren(...pieces);

    function accept(piece: HTMLElement, shadow: HTMLElement, animal: Item): void {
      piece.classList.add('placed');
      piece.style.transform = '';
      shadow.classList.add('revealed');
      shadow.append(piece);
      replay(piece, 'anim-bounce');
      ctx.audio.ding();
      navigator.vibrate?.(15);
      ctx.speak(animal.name);
      placed++;
      if (placed === shadows.length) {
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
      const shadow = shadows.find((s) => s.dataset.emoji === piece.dataset.emoji);
      if (shadow) replay(shadow, 'anim-wiggle');
    });
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
