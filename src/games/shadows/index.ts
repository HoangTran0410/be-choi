import { h, replay } from '../../core/dom';
import { createDragDrop, pickTarget } from '../../core/dragdrop';
import type { Item } from '../../core/content';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { makeShadowRound } from './logic';
import './style.css';

/** Shadow match: drag each coloured animal onto its black silhouette. */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  let shadows: HTMLElement[] = [];
  let pieces: HTMLElement[] = [];
  let names = new Map<string, string>();
  let placed = 0;
  let detach: Array<() => void> = [];

  const board = h('div', { class: 'g-board shadows-board' });
  const tray = h('div', { class: 'g-tray shadows-tray' });
  ctx.stage.append(board, tray);
  ctx.onCleanup(() => {
    alive = false;
  });

  // One shared drag-and-drop (core/dragdrop) for every animal; each round attaches its own.
  const dd = createDragDrop<HTMLElement>({
    layer: ctx.stage,
    targets: () =>
      shadows.filter((s) => !s.classList.contains('revealed')).map((s) => ({ id: s.dataset.emoji ?? '', rect: s.getBoundingClientRect() })),
    resolve: (p, t) => pickTarget(p, t, { tolerance: 14 }),
    ghost: (_piece, el) => {
      const g = el.cloneNode(true) as HTMLElement;
      g.classList.remove('anim-wiggle', 'is-carried');
      return g;
    },
    onPickUp: () => ctx.hint.touch(),
    onHover: (id) => shadows.forEach((s) => s.classList.toggle('is-hover', s.dataset.emoji === id && !s.classList.contains('revealed'))),
    onDrop(piece, hit) {
      ctx.hint.touch();
      const shadow = shadows.find((s) => s.dataset.emoji === piece.dataset.emoji);
      if (!shadow || hit !== piece.dataset.emoji) {
        ctx.audio.boing();
        return false;
      }
      accept(piece, shadow);
      return true;
    },
    ctx,
  });

  function accept(piece: HTMLElement, shadow: HTMLElement): void {
    piece.classList.add('placed');
    shadow.classList.add('revealed');
    shadow.append(piece);
    replay(piece, 'anim-bounce');
    ctx.audio.ding();
    navigator.vibrate?.(15);
    ctx.speak(names.get(piece.dataset.emoji ?? '') ?? '');
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

  function play(): void {
    if (!alive) return;
    detach.forEach((d) => d());
    detach = [];
    const r = makeShadowRound(round);
    names = new Map(r.animals.map((a: Item) => [a.emoji, a.name]));

    shadows = r.animals.map((a) => {
      const shadow = h('div', { class: 'g-target shadows-shadow', 'data-emoji': a.emoji });
      shadow.append(h('span', { class: 'shadows-glyph' }, a.emoji));
      return shadow;
    });
    board.replaceChildren(...shadows);

    placed = 0;
    pieces = r.tray.map((a) => {
      const piece = h('div', { class: 'g-item shadows-piece', 'data-emoji': a.emoji }, a.emoji);
      detach.push(dd.attach(piece, () => (piece.classList.contains('placed') ? null : piece)));
      return piece;
    });
    tray.replaceChildren(...pieces);

    ctx.hint.arm(() => {
      const piece = pieces.find((p) => !p.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      const shadow = shadows.find((s) => s.dataset.emoji === piece.dataset.emoji);
      if (shadow) replay(shadow, 'anim-wiggle');
      // Spoken rarely: the shell's quiet-voice gate lets only a few of these through in a row.
      ctx.speak('Con vật nào hợp với cái bóng này nhỉ');
    });
    if (round === 0) ctx.speak('Đưa con vật vào đúng cái bóng nào');
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
