import { h, svgEl } from '../../core/dom';
import { basketSvg } from '../colors/logic';
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
    case 'group': {
      const size = v.n <= 3 ? 'big' : v.n <= 6 ? 'mid' : 'small';
      return h(
        'span',
        { class: `lv lv-group lv-group-${size}`, 'data-n': v.n },
        ...Array.from({ length: v.n }, () => h('span', { class: 'lv-g' }, v.v)),
      );
    }
    case 'row':
      return h('span', { class: 'lv lv-row' }, ...v.items.map(renderVisual));
  }
}
