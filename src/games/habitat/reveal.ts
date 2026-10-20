import { h } from '../../core/dom';
import { kindByKey } from './catalog';
import { DECOR_EMOJI, type DecorId } from './decor';
import { portrait } from './portrait';
import { worldById, type WorldId } from './worlds';

export type RevealWhat =
  | { type: 'species'; key: string; count: number; how: 'quest' | 'egg' | 'catch' | 'gift' }
  | { type: 'decor'; id: DecorId }
  | { type: 'world'; id: WorldId }
  | { type: 'star'; stars: number };

export interface Reveal {
  el: HTMLElement;
  /** What is spoken, in order, each slowly. */
  say: string[];
}

/** What to show and say for something the child just got. */
export function describe(what: RevealWhat): Reveal {
  switch (what.type) {
    case 'species': {
      const kind = kindByKey(what.key);
      const name = kind?.name ?? 'bạn mới';
      const hello =
        what.how === 'egg' ? 'Trứng nở rồi!' : what.how === 'catch' ? 'Câu được rồi!' : what.how === 'quest' ? 'Quà cho bé!' : 'Bạn mới đến!';
      return {
        el: h('div', { class: 'hb-reveal-card', 'data-reveal': 'species' }, portrait(what.key, 'hb-reveal-art', 256), h('span', { class: 'hb-reveal-name' }, name)),
        say: [`${hello} ${name}.`, `Bé có ${what.count} bạn trong sổ rồi.`],
      };
    }
    case 'decor':
      return {
        el: h('div', { class: 'hb-reveal-card', 'data-reveal': 'decor' }, h('span', { class: 'hb-reveal-emoji' }, DECOR_EMOJI[what.id])),
        say: ['Có đồ trang trí mới!'],
      };
    case 'world': {
      const world = worldById(what.id);
      return {
        el: h('div', { class: 'hb-reveal-card', 'data-reveal': 'world' }, h('span', { class: 'hb-reveal-emoji' }, world?.icon ?? '🌍')),
        say: [`Mở được thế giới mới! ${world?.name ?? ''}.`],
      };
    }
    case 'star':
      return {
        el: h('div', { class: 'hb-reveal-card', 'data-reveal': 'star' }, h('span', { class: 'hb-reveal-emoji' }, '⭐')),
        say: ['Giỏi quá! Thêm một ngôi sao.'],
      };
  }
}
