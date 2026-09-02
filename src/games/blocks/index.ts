import { h, replay, svgEl } from '../../core/dom';
import { hitTest, makeDraggable } from '../../core/drag';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { blockPath, blockTransform, congruent, makeBlocksRound, pieceOrder, type Block } from './logic';
import './style.css';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

/**
 * A block drawn as a unit-box path inside a group that carries the block's transform.
 * The path itself stays untransformed so CSS animations (pulse, snap) can scale it in place.
 */
function blockNode(block: Block, attrs: Record<string, string>, x = block.x, y = block.y): { g: SVGGElement; path: SVGPathElement } {
  const path = svgNode('path', {
    d: blockPath(block.shape),
    'stroke-linejoin': 'round',
    'vector-effect': 'non-scaling-stroke',
    ...attrs,
  });
  const g = svgNode('g', { transform: blockTransform(block, x, y) });
  g.append(path);
  return { g, path };
}

/** The block alone, in its own box, so the piece looks exactly like its outline on the board. */
function pieceSvg(block: Block): SVGSVGElement {
  const svg = svgEl(`<svg viewBox="0 0 ${block.w} ${block.h}" class="blocks-piece-svg" aria-hidden="true"></svg>`);
  svg.append(blockNode(block, { fill: block.color, stroke: 'rgba(0,0,0,.15)', 'stroke-width': '2' }, 0, 0).g);
  return svg;
}

/** One block's outline on the board and whether a piece has filled it. */
interface Slot {
  index: number;
  block: Block;
  path: SVGPathElement;
  placed: boolean;
}

/**
 * Block builder: drag each geometric piece from the tray onto its outline to build a picture.
 * 3–4 blocks for the first two rounds, up to 6 afterwards.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  let lastId: string | undefined;
  let disposers: Array<() => void> = [];

  const outlineLayer = svgNode('g', { class: 'blocks-outline' });
  const fillLayer = svgNode('g', { class: 'blocks-fill' });
  const svg = svgEl('<svg viewBox="0 0 100 100" class="blocks-svg" aria-hidden="true"></svg>');
  svg.append(outlineLayer, fillLayer);
  const board = h('div', { class: 'blocks-board' }, svg);
  const tray = h('div', { class: 'g-tray blocks-tray' });
  // Names the picture being built, so a parent can read it out between rounds.
  const title = h('div', { class: 'blocks-title' });
  const main = h('div', { class: 'blocks-main' }, board, tray);
  const root = h('div', { class: 'blocks' }, title, main);
  ctx.stage.append(root);

  /** Tray pieces are sized from the picture's on-screen size (see style.css). */
  const measure = () => {
    const r = svg.getBoundingClientRect();
    root.style.setProperty('--blocks-px', `${Math.min(r.width, r.height)}px`);
  };
  window.addEventListener('resize', measure);
  ctx.onCleanup(() => {
    alive = false;
    window.removeEventListener('resize', measure);
    disposers.forEach((d) => d());
  });

  function play(): void {
    disposers.forEach((d) => d());
    disposers = [];
    const picture = makeBlocksRound(round, undefined, lastId);
    lastId = picture.id;
    root.dataset.picture = picture.id;
    root.classList.toggle('blocks-many', picture.blocks.length > 4);
    svg.classList.remove('anim-bounce');
    outlineLayer.replaceChildren();
    fillLayer.replaceChildren();

    const slots: Slot[] = picture.blocks.map((block, index) => {
      const { g, path } = blockNode(block, {
        fill: 'rgba(255,255,255,.55)',
        stroke: 'rgba(59,47,47,.4)',
        'stroke-width': '3',
        'stroke-dasharray': '4 3',
        'data-index': String(index),
      });
      outlineLayer.append(g);
      return { index, block, path, placed: false };
    });

    let placed = 0;
    const pieces = pieceOrder(picture).flatMap((index) => {
      const slot = slots[index];
      return slot ? [pieceFor(slot)] : [];
    });
    tray.replaceChildren(...pieces);
    title.textContent = `Xếp ${picture.name}`;
    measure();
    ctx.speak(`Xếp ${picture.name} nào!`);

    function pieceFor({ block, index }: Slot): HTMLElement {
      const piece = h(
        'div',
        {
          class: `g-item blocks-piece ${block.w >= block.h ? 'blocks-wide' : 'blocks-tall'}`,
          'data-index': String(index),
          style: `--blocks-frac:${Math.max(block.w, block.h) / 100}`,
        },
        pieceSvg(block),
      );
      disposers.push(
        makeDraggable(piece, {
          onStart(el) {
            el.classList.remove('anim-wiggle');
            ctx.hint.touch();
          },
          onDrop(el, p) {
            // Any open outline of the same shape and size will do: twin blocks (two wheels,
            // two eyes) look identical, so the child must not be told off for swapping them.
            const open = slots
              .filter((s) => !s.placed && congruent(s.block, block))
              .map((s) => ({ id: String(s.index), rect: s.path.getBoundingClientRect() }));
            const tolerance = el.getBoundingClientRect().width * 0.3;
            const hit = hitTest(p, open, tolerance);
            const slot = hit === null ? undefined : slots[Number(hit)];
            if (!slot) {
              ctx.audio.boing();
              return false;
            }
            accept(el, block, slot);
            return true;
          },
        }),
      );
      return piece;
    }

    function accept(piece: HTMLElement, block: Block, slot: Slot): void {
      slot.placed = true;
      slot.path.classList.add('blocks-done');
      fillLayer.append(
        blockNode(slot.block, { fill: block.color, stroke: 'rgba(0,0,0,.15)', 'stroke-width': '2', class: 'blocks-placed' }).g,
      );
      piece.classList.add('placed');
      piece.style.transform = '';
      ctx.audio.ding();
      navigator.vibrate?.(15);
      placed++;
      if (placed === slots.length) finish();
    }

    function finish(): void {
      replay(svg, 'anim-bounce');
      title.textContent = `${picture.name} xong rồi!`;
      replay(title, 'anim-bounce');
      ctx.speak(picture.name);
      ctx.hint.clear();
      void ctx.celebrate().then(() => {
        if (!alive) return;
        ctx.addStar();
        round++;
        play();
      });
    }

    ctx.hint.arm(() => {
      const piece = pieces.find((p) => !p.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      const slot = slots[Number(piece.dataset.index)];
      if (!slot) return;
      replay(slot.path, 'anim-pulse');
      setTimeout(() => slot.path.classList.remove('anim-pulse'), 1500);
    });
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
