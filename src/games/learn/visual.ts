import { h, svgEl } from '../../core/dom';
import { basketSvg } from '../colors/logic';
import { FALLBACK_BOX, countLayout } from './countgrid';
import type { Visual } from './types';

/** Draw any picture the game shows. Sizes come from CSS (`font-size` / container), never fixed pixels. */
export function renderVisual(v: Visual): HTMLElement {
  switch (v.k) {
    case 'emoji': {
      const el = h('span', { class: `lv lv-emoji${v.silhouette ? ' lv-silhouette' : ''}` }, v.v);
      if (v.scale !== undefined) el.style.setProperty('--s', String(v.scale));
      return el;
    }
    case 'text':
      return h('span', { class: 'lv lv-text' }, v.v);
    case 'chip':
      return h('span', { class: 'lv lv-chip' }, v.v);
    case 'ball': {
      const el = h('span', { class: 'lv lv-ball', 'aria-hidden': 'true' });
      el.style.setProperty('--ball', v.hex);
      return el;
    }
    case 'basket': {
      const el = h('span', { class: 'lv lv-basket', 'aria-hidden': 'true' });
      el.append(basketSvg(v.hex));
      return el;
    }
    case 'shape': {
      const svg = svgEl(
        `<svg viewBox="0 0 100 100" class="lv-shape-svg" aria-hidden="true"><path d="${v.path}" fill="${v.hex}" stroke="rgba(0,0,0,.22)" stroke-width="4" stroke-linejoin="round"/></svg>`,
      );
      return h('span', { class: 'lv lv-shape' }, svg);
    }
    case 'photo': {
      const el = h('span', { class: 'lv lv-photo', role: 'img', 'aria-label': 'ảnh' });
      el.style.backgroundImage = `url("${v.url}")`;
      return el;
    }
    case 'group':
      return countGrid(
        Array.from({ length: v.n }, () => h('span', { class: 'lv-g' }, v.v)),
        { 'data-n': v.n },
      );
    case 'row': {
      const el = h('span', { class: 'lv lv-row' }, ...v.items.map(renderVisual));
      el.style.setProperty('--n', String(Math.max(1, v.items.length)));
      return el;
    }
  }
}

/**
 * Lay countable cells out in rows of five that always fit the box they are put in (see
 * countgrid.ts). The returned element fills its parent (give the parent a definite size in CSS);
 * it re-fits itself whenever that size changes. Each cell stays its own element, so a tap on a
 * single picture still lands on that picture.
 */
export function countGrid(cells: HTMLElement[], attrs: Record<string, string | number> = {}): HTMLElement {
  const wrap = h('span', { class: 'lv-gwrap' });
  const box = h('span', { class: 'lv lv-group', ...attrs }, wrap);
  let last = '';
  const fit = (): void => {
    const w = box.clientWidth || FALLBACK_BOX.w;
    const hh = box.clientHeight || FALLBACK_BOX.h;
    const l = countLayout(cells.length, w, hh);
    const key = `${l.cell}|${l.rows.join(',')}|${l.rowsAcross}`;
    if (key === last) return;
    last = key;
    box.style.setProperty('--cell', `${l.cell}px`);
    box.style.setProperty('--gap', `${l.gap}px`);
    box.style.setProperty('--rgap', `${l.rowGap}px`);
    box.style.setProperty('--pad', `${l.pad}px`);
    box.style.setProperty('--across', String(l.rowsAcross));
    box.classList.toggle('framed', l.framed);
    let at = 0;
    wrap.replaceChildren(
      ...l.rows.map((count) => {
        const row = h('span', { class: 'lv-gg' }, ...cells.slice(at, at + count));
        at += count;
        return row;
      }),
    );
  };
  fit();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (box.isConnected) fit();
    });
    ro.observe(box);
  }
  return box;
}
