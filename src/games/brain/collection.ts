/** Two small overlays: the treasure box (who to be, what has been found) and the "you found something!" reveal. */
import { h, replay } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import { avatarsOpen, gearOpen, gemsOpen, ISLANDS, islandsOpen, REWARDS, STATION_IDS, unlockedStations, type Reward } from './levels';
import type { Progress } from './progress';
import { STATIONS } from './stations';

function closeButton(ctx: GameContext, label: string, onTap: () => void): HTMLElement {
  const b = h('button', { class: 'brain-ok', type: 'button', 'aria-label': label }, '👍');
  makeTappable(b, onTap, { ctx });
  return b;
}

/** The treasure box. Tap an explorer to be them. */
export function openBox(ctx: GameContext, parent: HTMLElement, p: Progress, on: { pick(avatar: string): void; close(): void }): HTMLElement {
  const avatars = avatarsOpen(p.stars);
  const allAvatars = avatarsOpen(100000);
  const faces = allAvatars.map((a) => {
    const have = avatars.includes(a);
    const b = h('button', { class: `brain-face-btn${a === p.avatar ? ' on' : ''}${have ? '' : ' dim'}`, type: 'button', 'aria-label': have ? 'chọn bạn này' : 'chưa có' }, have ? a : '❔');
    if (have) makeTappable(b, () => on.pick(a), { ctx });
    return b;
  });
  const gear = gearOpen(p.stars);
  const allGear = REWARDS.filter((r) => r.kind === 'gear');
  const things = allGear.map((g) => h('span', { class: `brain-thing${gear.includes(g.emoji) ? '' : ' dim'}` }, gear.includes(g.emoji) ? g.emoji : '❔'));
  const gems = gemsOpen(p.stars);
  const islands = islandsOpen(p.stars);
  const places = ISLANDS.map((isl, i) => h('span', { class: `brain-thing${i < islands ? '' : ' dim'}` }, i < islands ? isl.emoji : '❔'));
  const stations = STATION_IDS.map((id) => {
    const open = unlockedStations(p.stars).includes(id);
    return h('span', { class: `brain-thing${open ? '' : ' dim'}` }, open ? STATIONS[id].icon : '❔');
  });
  const row = (title: string, ...kids: HTMLElement[]) => h('div', { class: 'brain-box-row' }, h('div', { class: 'brain-box-title' }, title), h('div', { class: 'brain-box-items' }, ...kids));
  const sheet = h(
    'div',
    { class: 'brain-sheet' },
    h('div', { class: 'brain-box-head' }, h('span', { class: 'brain-box-icon' }, '🧰'), closeButton(ctx, 'xong', on.close)),
    row('Bé là', ...faces),
    row('Đồ nghề', ...things, ...(gems ? [h('span', { class: 'brain-thing' }, `💎×${gems}`)] : [])),
    row('Đảo', ...places),
    row('Trạm', ...stations),
  );
  const el = h('div', { class: 'brain-overlay' }, sheet);
  // A tap on the dim background closes it too.
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) on.close();
  });
  parent.append(el);
  return el;
}

/** "You found a …!" — big emoji, one tap to go on. */
export function showReward(ctx: GameContext, parent: HTMLElement, r: Reward, on: { close(): void }): HTMLElement {
  const big = h('div', { class: 'brain-reward-emoji' }, r.emoji);
  const ok = closeButton(ctx, 'tiếp', on.close);
  const el = h(
    'div',
    { class: 'brain-overlay reveal' },
    h('div', { class: 'brain-sheet reveal' }, h('div', { class: 'brain-reward-title' }, r.kind === 'gem' ? 'Bé tìm được!' : 'Mở được rồi!'), big, h('div', { class: 'brain-reward-name' }, r.name), ok),
  );
  parent.append(el);
  replay(big, 'anim-bounce');
  return el;
}

