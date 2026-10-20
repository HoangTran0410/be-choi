/**
 * The workshop door: four big pictures (one per way of drawing), the notebook and the
 * sticker collection, plus a row of pips counting down to whatever opens next.
 * Pictures only — nothing here needs reading.
 */
import { h } from '../../core/dom';
import { PICTURES } from '../trace/pictures';
import type { Gallery } from './gallery';
import { DOOR_ICONS } from './icons';
import { MODES, TOTAL_STAMPS, modeInfo, nextMilestone, type ModeId } from './progress';
import { makeButton, type Scope } from './ui';

export interface HubActions {
  mode(id: ModeId): void;
  notebook(): void;
  collection(): void;
}

export function buildHub(scope: Scope, gallery: Gallery, act: HubActions): HTMLElement {
  const tiles: HTMLElement[] = MODES.map((m) => {
    const icon = h('span', { class: 'dr-door-icon' });
    icon.innerHTML = DOOR_ICONS[m.id];
    return makeButton(scope, {
      label: modeInfo(m.id).name,
      content: icon,
      cls: `dr-door dr-door-${m.id}`,
      onTap: () => act.mode(m.id),
    });
  });

  const last = gallery.list()[gallery.list().length - 1];
  const book = makeButton(scope, {
    label: 'quyển vở của bé',
    content: h('span', { class: 'dr-door-book' }, '📒', gallery.list().length ? h('span', { class: 'dr-door-count', 'aria-hidden': 'true' }, String(gallery.list().length)) : null),
    cls: 'dr-door dr-door-book-tile',
    onTap: act.notebook,
  });
  if (last) {
    book.style.backgroundImage = `linear-gradient(rgba(255,255,255,.35), rgba(255,255,255,.35)), url("${last.thumb}")`;
    book.classList.add('has-cover');
  }

  const found = gallery.collected().length;
  const sticker = makeButton(scope, {
    label: 'bộ sưu tập hình dán',
    content: h('span', { class: 'dr-door-stickers' }, h('span', { class: 'dr-door-big' }, '🌟'), h('span', { class: 'dr-door-small' }, `${found}/${TOTAL_STAMPS}`)),
    cls: 'dr-door dr-door-collection',
    onTap: act.collection,
  });

  const grid = h('div', { class: 'dr-doors' }, ...tiles, book, sticker);
  return h('div', { class: 'dr-hub' }, grid, nextBar(gallery.made()));
}

/** "●●○ → 🔒 🖍️": pips for the pictures still to finish, and what they will open. */
function nextBar(made: number): HTMLElement {
  const next = nextMilestone(made, PICTURES);
  if (!next) return h('div', { class: 'dr-next done', 'aria-hidden': 'true' }, '🏆');
  const span = Math.max(1, next.at - next.from);
  const pips = Array.from({ length: Math.min(span, 8) }, (_, i) => h('span', { class: `dr-pip${i < made - next.from ? ' on' : ''}` }));
  const p = next.preview;
  const prize = p.hex ? h('span', { class: 'dr-prize swatch', style: `--sw:${p.hex}` }) : h('span', { class: 'dr-prize' }, p.icon ?? '🎁');
  return h('div', { class: 'dr-next', 'aria-label': 'còn vài bức tranh nữa là mở khoá thêm' }, h('span', { class: 'dr-pips' }, ...pips), '🔒', prize);
}
