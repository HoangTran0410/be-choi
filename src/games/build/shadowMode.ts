import { h, replay, svgEl } from '../../core/dom';
import { makeDraggable } from '../../core/drag';
import { makeTappable } from '../../core/tap';
import { blockPath, blockTransform, congruent, pieceOrder, type Block, type Picture } from '../blocks/logic';
import { describeBlock, pickShadow, shadowHasSeams } from './levels';
import { pullElement } from './magnet';
import type { ModeCtl, Workshop } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SHADOW = '#334155';

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

/** A block as a unit-box path in a group carrying the block's transform (so CSS can scale the path alone). */
function blockNode(block: Block, attrs: Record<string, string>, x = block.x, y = block.y): { g: SVGGElement; path: SVGPathElement } {
  const path = svgNode('path', { d: blockPath(block.shape), 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', ...attrs });
  const g = svgNode('g', { transform: blockTransform(block, x, y) });
  g.append(path);
  return { g, path };
}

function pieceSvg(block: Block): SVGSVGElement {
  const svg = svgEl(`<svg viewBox="0 0 ${block.w} ${block.h}" class="bw-sh-piece-svg" aria-hidden="true"></svg>`);
  svg.append(blockNode(block, { fill: block.color, stroke: 'rgba(0,0,0,.18)', 'stroke-width': '2' }, 0, 0).g);
  return svg;
}

interface Slot {
  index: number;
  block: Block;
  path: SVGPathElement;
  placed: boolean;
}

let clipSeq = 0;

/**
 * Xếp theo bóng: a black shadow of something (a house, a ship, an elephant…) and coloured blocks to
 * drag into it. Early on the seams between the blocks show in the shadow; later it is one plain
 * black shape. When the shadow is full it lights up, says what it is and, if the family has photos,
 * the photo shows through the shape.
 */
export function createShadowMode(w: Workshop): ModeCtl {
  const { ctx } = w;
  let alive = true;
  let active = false;
  let round = 0;
  let placed = 0;
  let finishing = false;
  let hasRound = false;
  let lastId: string | undefined;
  let slots: Slot[] = [];
  let pieces: HTMLElement[] = [];
  let disposers: Array<() => void> = [];

  const shadowLayer = svgNode('g', { class: 'bw-sh-shadow' });
  const fillLayer = svgNode('g', { class: 'bw-sh-fill' });
  const photoLayer = svgNode('g', { class: 'bw-sh-photo' });
  const defs = svgNode('defs', {});
  const svg = svgEl('<svg viewBox="0 0 100 100" class="bw-sh-svg" aria-hidden="true"></svg>');
  svg.append(defs, shadowLayer, fillLayer, photoLayer);
  const caption = h('div', { class: 'bw-caption', 'aria-live': 'polite' });
  const board = h('div', { class: 'bw-sh-board' }, svg);
  const area = h('div', { class: 'bw-sh-area' }, board);
  const tray = h('div', { class: 'bw-tray bw-sh-tray' });
  const source = h('button', { class: 'bw-btn bw-source', type: 'button', 'aria-label': 'Chọn ảnh', hidden: true }, h('span', { class: 'bw-ico' }, '🖼️'));
  makeTappable(source, () => w.choosePhoto(), { ctx, cooldownMs: 300 });
  const el = h('section', { class: 'bw-mode bw-sh' }, area, tray, caption, source);

  /** Tray pieces are sized from the picture's on-screen size (see style.css). */
  function layout(): void {
    const r = svg.getBoundingClientRect();
    el.style.setProperty('--bw-px', `${Math.min(r.width, r.height)}px`);
  }

  function syncSource(): void {
    source.hidden = w.photos().length === 0;
  }

  function play(): void {
    disposers.forEach((d) => d());
    disposers = [];
    hasRound = true;
    const stars = w.stars('shadow');
    const picture = pickShadow(stars, Math.random, lastId);
    lastId = picture.id;
    placed = 0;
    finishing = false;
    el.dataset.picture = picture.id;
    el.classList.toggle('bw-many', picture.blocks.length > 4);
    board.classList.remove('lit');
    caption.textContent = '';
    caption.classList.remove('show');
    defs.replaceChildren();
    shadowLayer.replaceChildren();
    fillLayer.replaceChildren();
    photoLayer.replaceChildren();

    const seams = shadowHasSeams(stars);
    slots = picture.blocks.map((block, index) => {
      const { g, path } = blockNode(block, {
        fill: SHADOW,
        stroke: seams ? 'rgba(255,255,255,.55)' : SHADOW,
        'stroke-width': seams ? '2' : '1.5',
        'data-index': String(index),
      });
      shadowLayer.append(g);
      return { index, block, path, placed: false };
    });
    pieces = pieceOrder(picture).flatMap((index) => {
      const slot = slots[index];
      return slot ? [pieceFor(slot, picture)] : [];
    });
    tray.replaceChildren(...pieces);
    layout();
    if (active) ctx.speak('Bóng đen này là gì nhỉ? Mình xếp thử nhé');
    armHint();
  }

  function openSlots(block: Block): Slot[] {
    return slots.filter((s) => !s.placed && congruent(s.block, block));
  }

  function nearest(node: HTMLElement, block: Block): { slot: Slot; dist: number; x: number; y: number } | null {
    const a = node.getBoundingClientRect();
    const cx = a.left + a.width / 2;
    const cy = a.top + a.height / 2;
    let best: { slot: Slot; dist: number; x: number; y: number } | null = null;
    for (const slot of openSlots(block)) {
      const r = slot.path.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (!best || dist < best.dist) best = { slot, dist, x, y };
    }
    return best;
  }

  function radiusFor(node: HTMLElement): number {
    const b = svg.getBoundingClientRect();
    const a = node.getBoundingClientRect();
    return Math.max(0.2 * Math.min(b.width, b.height), 0.45 * Math.max(a.width, a.height));
  }

  function pieceFor({ block, index }: Slot, picture: Picture): HTMLElement {
    const piece = h(
      'div',
      {
        class: `g-item bw-sh-piece ${block.w >= block.h ? 'bw-wide' : 'bw-tall'}`,
        'data-index': String(index),
        'aria-label': describeBlock(block.shape, block.color),
        style: `--bw-frac:${Math.max(block.w, block.h) / 100}`,
      },
      pieceSvg(block),
    );
    disposers.push(
      makeDraggable(piece, {
        onStart(node) {
          node.classList.remove('anim-wiggle');
          ctx.hint.touch();
          ctx.speak(describeBlock(block.shape, block.color));
        },
        onMove(node) {
          const n = nearest(node, block);
          if (n) pullElement(node, { x: n.x, y: n.y }, radiusFor(node));
        },
        onDrop(node) {
          node.classList.remove('bw-near');
          const n = nearest(node, block);
          if (!n || n.dist > radiusFor(node)) {
            ctx.audio.boing();
            return false;
          }
          accept(node, block, n.slot, picture);
          return true;
        },
      }),
    );
    return piece;
  }

  function accept(piece: HTMLElement, block: Block, slot: Slot, picture: Picture): void {
    slot.placed = true;
    slot.path.classList.add('bw-done');
    fillLayer.append(
      blockNode(slot.block, { fill: block.color, stroke: 'rgba(255,255,255,.7)', 'stroke-width': '2', class: 'bw-placed' }).g,
    );
    piece.classList.add('placed');
    piece.style.transform = '';
    ctx.audio.ding();
    navigator.vibrate?.(15);
    ctx.hint.touch();
    placed++;
    if (placed === slots.length) void finish(picture);
  }

  /** The shadow lights up; a family photo, if there is one, shows through the shape. */
  async function finish(picture: Picture): Promise<void> {
    if (finishing) return;
    finishing = true;
    ctx.hint.clear();
    board.classList.add('lit');
    replay(svg, 'anim-bounce');
    revealPhoto(picture);
    caption.textContent = `Là ${picture.name}!`;
    caption.classList.add('show');
    ctx.speak(`Là ${picture.name}`);
    ctx.audio.fx('sparkle');
    await ctx.celebrate();
    if (!alive) return;
    const unlocked = w.award('shadow');
    round++;
    if (unlocked.length && active) ctx.speak(`Có bóng mới rồi! ${unlocked.join(', ')}`);
    w.later(() => {
      if (alive) play();
    }, unlocked.length ? 1800 : 700);
  }

  /** Family photo clipped to the shape of the shadow. Odd rounds of 'auto' come out as the photo list rotating. */
  function revealPhoto(picture: Picture): void {
    const photo = w.photoFor(round * 2 + 1);
    if (!photo) return;
    const id = `bw-clip-${++clipSeq}`;
    const clip = svgNode('clipPath', { id });
    for (const block of picture.blocks) clip.append(svgNode('path', { d: blockPath(block.shape), transform: blockTransform(block) }));
    defs.append(clip);
    const img = svgNode('image', { href: photo.url, x: '0', y: '0', width: '100', height: '100', preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${id})` });
    img.setAttribute('class', 'bw-sh-img');
    photoLayer.append(img);
  }

  function armHint(): void {
    w.arm(() => {
      const piece = pieces.find((p) => !p.classList.contains('placed'));
      if (!piece) return;
      replay(piece, 'anim-wiggle');
      const slot = slots[Number(piece.dataset.index)];
      if (!slot) return;
      ctx.speak(`Thử khối này, ${describeBlock(slot.block.shape, slot.block.color)}`);
      replay(slot.path, 'anim-pulse');
      w.later(() => slot.path.classList.remove('anim-pulse'), 1500);
    });
  }

  const offPhotos = w.onPhotosChange(syncSource);

  return {
    el,
    enter() {
      active = true;
      syncSource();
      if (!hasRound) play();
      else armHint();
    },
    leave() {
      active = false;
      ctx.hint.clear();
    },
    relayout: layout,
    destroy() {
      alive = false;
      disposers.forEach((d) => d());
      disposers = [];
      offPhotos();
    },
  };
}
