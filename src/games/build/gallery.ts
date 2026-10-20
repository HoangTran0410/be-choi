import { h } from '../../core/dom';
import { onHold } from '../../core/hold';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import { workSvg, type Work } from './store';
import { speakText } from '../../core/say';

export interface CabinetOptions {
  ctx: GameContext;
  host: HTMLElement;
  list(): Work[];
  remove(id: string): void;
  onClose(): void;
}

/** A work drawn as SVG inside a div. */
function picture(work: Work, cls: string): HTMLElement {
  const el = h('div', { class: cls });
  el.innerHTML = workSvg(work);
  return el;
}

/**
 * "Tủ trưng bày": the child's brick works on shelves, big tiles to tap, then one work shown large.
 * Deleting is a long press (a stray tap never loses a work). Returns a function that closes it.
 */
export function openCabinet(o: CabinetOptions): () => void {
  const { ctx } = o;
  let closed = false;
  const disposers: Array<() => void> = [];

  const body = h('div', { class: 'bw-cab-body' });
  const closeBtn = h(
    'button',
    { class: 'bw-btn bw-cab-close', type: 'button', 'aria-label': 'Đóng tủ' },
    h('span', { class: 'bw-ico' }, '✕'),
  );
  const panel = h('div', { class: 'bw-cab-panel' }, body);
  const overlay = h('div', { class: 'bw-cab', role: 'dialog', 'aria-label': 'Tủ trưng bày' }, panel, closeBtn);
  o.host.append(overlay);

  function close(): void {
    if (closed) return;
    closed = true;
    for (const d of disposers) d();
    overlay.remove();
    o.onClose();
  }
  makeTappable(closeBtn, () => (viewing ? showShelf() : close()), { cooldownMs: 250 });
  let viewing = false;

  function clearTemp(): void {
    for (const d of disposers.splice(0)) d();
  }

  function showShelf(): void {
    clearTemp();
    viewing = false;
    const works = o.list();
    if (!works.length) {
      body.replaceChildren(
        h(
          'div',
          { class: 'bw-cab-empty' },
          h('div', { class: 'bw-cab-emoji' }, '🧱'),
          h('div', { class: 'bw-cab-hint' }, 'Xây xong bấm 📸 để cất vào tủ nhé'),
        ),
      );
      speakText(ctx, 'Tủ còn trống. Mình xây rồi cất vào tủ nhé');
      return;
    }
    const tiles = works.map((work) => {
      const tile = h(
        'button',
        { class: 'bw-cab-tile', type: 'button', 'aria-label': work.name || 'Tác phẩm' },
        picture(work, 'bw-cab-pic'),
      );
      disposers.push(makeTappable(tile, () => showWork(work), { cooldownMs: 250 }));
      return tile;
    });
    body.replaceChildren(h('div', { class: 'bw-cab-grid' }, ...tiles));
    speakText(ctx, 'Tủ trưng bày của bé. Bé xem nhé');
  }

  function showWork(work: Work): void {
    clearTemp();
    viewing = true;
    const del = h(
      'button',
      { class: 'bw-btn bw-cab-del', type: 'button', 'aria-label': 'Giữ để bỏ tác phẩm này' },
      h('span', { class: 'bw-ico' }, '🗑️'),
    );
    disposers.push(
      onHold(del, 900, () => {
        o.remove(work.id);
        ctx.audio.pop(0.7);
        showShelf();
      }),
    );
    body.replaceChildren(
      h(
        'div',
        { class: 'bw-cab-view' },
        picture(work, 'bw-cab-big'),
        h('div', { class: 'bw-cab-name' }, work.name || 'Tác phẩm của bé'),
        del,
      ),
    );
    ctx.audio.ding();
    speakText(ctx, work.name ? `Bé xây ${work.name}` : 'Tác phẩm của bé');
  }

  showShelf();
  return close;
}
