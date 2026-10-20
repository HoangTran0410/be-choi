/**
 * What stays on top of every world: the same round buttons in the same places
 * whichever world it is. Pictures only — nothing here needs reading.
 */
import { h, replay } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import { questById, type QuestDef } from './quests';
import type { QuestSlot } from './save';
import type { WorldDef } from './worlds';

export type Tool = 'add' | 'decor' | 'feed' | 'night' | 'special';

export interface HudHandlers {
  onWorld(): void;
  onBook(): void;
  onTool(tool: Tool): void;
  onChip(q: QuestDef): void;
  onEgg(): void;
  onBack(): void;
}

export interface Hud {
  el: HTMLElement;
  setWorld(world: WorldDef): void;
  /** `tank`: the full toolbar. `pond`: only the way back (the rod has its own buttons). */
  setMode(mode: 'tank' | 'pond'): void;
  setNight(night: boolean): void;
  /** Icons that depend on the kind of world: the friend, food and special buttons. */
  setIcons(add: string, feed: string, special: string): void;
  /** The way home from the pond looks like the home it goes to. */
  setBackIcon(icon: string): void;
  setChips(slots: readonly QuestSlot[]): void;
  setBook(have: number, total: number): void;
  showEgg(on: boolean): void;
  /** Point at one button (the hint). */
  nudge(target: Tool | 'egg' | 'world' | 'book'): void;
  /** Flash a quest chip as done. */
  cheer(id: string): void;
  button(tool: Tool): HTMLElement;
}

const TOOLS: { tool: Tool; icon: string; label: string }[] = [
  { tool: 'add', icon: '🐟', label: 'thêm bạn' },
  { tool: 'decor', icon: '🌿', label: 'trang trí' },
  { tool: 'feed', icon: '🍤', label: 'cho ăn' },
  { tool: 'night', icon: '🌙', label: 'bật tắt đèn' },
  { tool: 'special', icon: '🎣', label: 'câu cá' },
];

export function createHud(onCleanup: (fn: () => void) => void, on: HudHandlers): Hud {
  const tap = (el: HTMLElement, fn: () => void): void => {
    makeTappable(el, fn, { ctx: { onCleanup } });
  };

  const worldBtn = h('button', { class: 'hb-btn hb-world-btn', type: 'button', 'aria-label': 'đổi thế giới' }, '🐠');
  const bookBtn = h(
    'button',
    { class: 'hb-btn hb-book-btn', type: 'button', 'aria-label': 'sổ bạn bè' },
    h('span', { class: 'hb-btn-icon' }, '📖'),
    h('span', { class: 'hb-badge' }),
  );
  tap(worldBtn, on.onWorld);
  tap(bookBtn, on.onBook);
  const top = h('div', { class: 'hb-top' }, worldBtn, bookBtn);

  const chipBox = h('div', { class: 'hb-quests', 'aria-label': 'nhiệm vụ' });

  const buttons = new Map<Tool, HTMLElement>();
  const bar = h('div', { class: 'hb-toolbar' });
  for (const t of TOOLS) {
    const btn = h('button', { class: `hb-btn hb-tool hb-tool-${t.tool}`, type: 'button', 'aria-label': t.label, 'data-tool': t.tool }, t.icon);
    tap(btn, () => on.onTool(t.tool));
    buttons.set(t.tool, btn);
    bar.append(btn);
  }

  const egg = h('button', { class: 'hb-egg', type: 'button', 'aria-label': 'quả trứng', hidden: true }, '🥚');
  tap(egg, on.onEgg);

  const back = h('button', { class: 'hb-btn hb-back', type: 'button', 'aria-label': 'về bể của bé', hidden: true }, '🐠');
  tap(back, on.onBack);

  const el = h('div', { class: 'hb-hud' }, top, chipBox, bar, egg, back);

  return {
    el,
    setWorld(world) {
      worldBtn.textContent = world.icon;
      el.dataset.world = world.id;
    },
    setMode(mode) {
      el.classList.toggle('hb-pond', mode === 'pond');
      back.hidden = mode !== 'pond';
    },
    setNight(night) {
      buttons.get('night')!.textContent = night ? '☀️' : '🌙';
      el.classList.toggle('hb-night', night);
    },
    setIcons(add, feed, special) {
      buttons.get('add')!.textContent = add;
      buttons.get('feed')!.textContent = feed;
      buttons.get('special')!.textContent = special;
    },
    setBackIcon(icon) {
      back.textContent = icon;
    },
    setChips(slots) {
      chipBox.replaceChildren();
      for (const slot of slots) {
        const q = questById(slot.id);
        if (!q) continue;
        const pips = h('span', { class: 'hb-pips', 'aria-hidden': 'true' });
        for (let i = 0; i < q.n; i++) pips.append(h('i', { class: i < slot.got ? 'on' : '' }));
        const chip = h(
          'button',
          { class: 'hb-btn hb-chip', type: 'button', 'aria-label': 'nhiệm vụ', 'data-quest': q.id },
          h('span', { class: 'hb-chip-icon', 'aria-hidden': 'true' }, q.icon),
          pips,
        );
        tap(chip, () => on.onChip(q));
        chipBox.append(chip);
      }
    },
    setBook(have, total) {
      const badge = bookBtn.querySelector('.hb-badge');
      if (badge) badge.textContent = `${have}/${total}`;
    },
    showEgg(on) {
      egg.hidden = !on;
      if (on) replay(egg, 'hb-egg-drop');
    },
    nudge(target) {
      const node =
        target === 'egg' ? egg : target === 'world' ? worldBtn : target === 'book' ? bookBtn : buttons.get(target);
      if (node && !node.hidden) replay(node, 'anim-wiggle');
    },
    cheer(id) {
      const chip = chipBox.querySelector<HTMLElement>(`[data-quest="${id}"]`);
      if (chip) replay(chip, 'anim-pop');
    },
    button: (tool) => buttons.get(tool)!,
  };
}
