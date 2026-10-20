/** What frames the farm: the sign, the sun, the level, the basket, the tabs and the rain. */
import { h } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import { decorCount } from '../../core/quality';
import { TABS, type Env, type Tab } from './env';
import { ITEMS } from './orders';
import { levelFor, levelProgress, MAX_LEVEL, stockOf, unlocksAt } from './progress';
import { pressOrDrag, setClass, setFrame, setText } from './ui';
import { skyBodyAt } from './world';

export interface Hud {
  el: HTMLElement;
  sync(): void;
}

/** The top strip: the farm's sign (with a family photo on it), where the sun is, and how far to the next prize. */
export function createHud(env: Env): Hud {
  const { state } = env;
  const photo = h('div', { class: 'hv-frame hv-frame-sign' });
  const sign = h('div', { class: 'hv-sign', 'aria-hidden': 'true' }, h('span', { class: 'hv-sign-e' }, '🌻'), photo);
  const body = h('span', { class: 'hv-body' }, '☀️');
  const weather = h('span', { class: 'hv-weather' });
  const sky = h('div', { class: 'hv-sky', 'aria-hidden': 'true' }, h('div', { class: 'hv-arc' }, body), weather);
  const lvl = h('b', { class: 'hv-lvl-n' });
  const fill = h('i');
  const next = h('span', { class: 'hv-next' });
  const level = h(
    'div',
    { class: 'hv-level', 'aria-hidden': 'true' },
    h('span', { class: 'hv-star' }, '⭐'),
    lvl,
    h('div', { class: 'hv-bar' }, fill),
    next,
  );
  const el = h('div', { class: 'hv-hud' }, sign, sky, level);

  return {
    el,
    sync() {
      setFrame(photo, env.photos[0], '');
      setClass(sign, 'has-photo', env.photos.length > 0);
      const b = skyBodyAt(state.clock);
      const glyph = b.moon ? '🌙' : '☀️';
      setText(body, glyph);
      body.style.left = `${(b.along * 100).toFixed(1)}%`;
      body.style.top = `${(100 - Math.sin(b.along * Math.PI) * 100).toFixed(1)}%`;
      setText(weather, env.weather.raining ? '🌧️' : b.moon ? '' : '');
      const lv = levelFor(state.xp);
      setText(lvl, String(lv));
      fill.style.width = `${Math.round(levelProgress(state.xp) * 100)}%`;
      const upcoming = lv < MAX_LEVEL ? unlocksAt(lv + 1)[0] : null;
      setText(next, upcoming ? upcoming.emoji : '🏆');
    },
  };
}

/** The basket: one big chip for everything picked, laid or milked. Tap, or drag it to where it goes. */
export function createBasket(env: Env): Hud {
  const { state, ctx } = env;
  const chips = new Map<string, HTMLElement>();
  const empty = h('div', { class: 'hv-empty', 'aria-hidden': 'true' }, '🧺');
  const el = h('div', { class: 'hv-basket' }, empty);

  const make = (id: string, emoji: string): HTMLElement => {
    const chip = h(
      'button',
      { class: 'hv-chip', type: 'button', 'aria-label': id, 'data-item': id },
      h('span', { class: 'hv-chip-e' }, emoji),
      h('b', { class: 'hv-chip-n' }, '0'),
    );
    pressOrDrag(env, chip, {
      ghost: emoji,
      onTap() {
        ctx.audio.pop(1);
        env.selected = id;
        env.views[env.tab]?.chipTap(id);
        env.stockChanged();
      },
      onDrop(p) {
        env.selected = id;
        env.views[env.tab]?.chipDrop(id, p);
        env.stockChanged();
      },
    });
    return chip;
  };

  return {
    el,
    sync() {
      let changed = false;
      for (const item of ITEMS) {
        const n = stockOf(state, item.id);
        let chip = chips.get(item.id);
        if (n > 0 && !chip) {
          chip = make(item.id, item.emoji);
          chips.set(item.id, chip);
          changed = true;
        } else if (n <= 0 && chip) {
          chip.remove();
          chips.delete(item.id);
          if (env.selected === item.id) env.selected = null;
        }
        if (chip) {
          setText(chip.querySelector('.hv-chip-n')!, String(n));
          setClass(chip, 'on', env.selected === item.id);
        }
      }
      if (changed) {
        // Keep the catalogue order whatever order things arrived in.
        const ordered = ITEMS.map((i) => chips.get(i.id)).filter((c): c is HTMLElement => !!c);
        el.replaceChildren(...ordered);
      }
      setClass(el, 'many', chips.size > 4);
      setClass(el, 'lots', chips.size > 8);
      if (chips.size === 0) {
        if (!empty.isConnected) el.replaceChildren(empty);
      } else if (empty.isConnected) {
        empty.remove();
      }
    },
  };
}

export interface Tabs extends Hud {
  setActive(tab: Tab): void;
  button(tab: Tab): HTMLElement;
}

const TAB_INFO: Record<Tab, { emoji: string; label: string }> = {
  garden: { emoji: '🌱', label: 'Vườn' },
  barn: { emoji: '🐔', label: 'Chuồng' },
  market: { emoji: '🏪', label: 'Chợ' },
};

export function createTabs(env: Env): Tabs {
  const buttons = new Map<Tab, HTMLElement>();
  for (const tab of TABS) {
    const info = TAB_INFO[tab];
    const b = h(
      'button',
      { class: 'hv-tab', type: 'button', 'aria-label': info.label, 'data-tab': tab },
      h('span', { class: 'hv-tab-e' }, info.emoji),
      h('span', { class: 'hv-tab-l' }, info.label),
      h('b', { class: 'hv-badge' }),
    );
    makeTappable(b, () => env.go(tab), { ctx: env.ctx, feedback: false });
    buttons.set(tab, b);
  }
  const el = h('nav', { class: 'hv-tabs' }, ...buttons.values());
  return {
    el,
    button: (tab) => buttons.get(tab)!,
    setActive(active) {
      for (const [tab, b] of buttons) setClass(b, 'on', tab === active);
    },
    sync() {
      for (const [tab, b] of buttons) {
        const n = env.views[tab]?.badge() ?? 0;
        const badge = b.querySelector('.hv-badge')!;
        setText(badge, n > 0 ? String(n) : '');
        setClass(b, 'has-badge', n > 0 && tab !== env.tab);
      }
    },
  };
}

/** Rain over the whole farm. Drops are made when the rain starts and removed when it stops. */
export function createRain(env: Env): { el: HTMLElement; sync(): void } {
  const el = h('div', { class: 'hv-rain', 'aria-hidden': 'true' });
  let on = false;
  return {
    el,
    sync() {
      const raining = env.weather.raining;
      if (raining === on) return;
      on = raining;
      if (!raining) {
        el.replaceChildren();
        return;
      }
      const n = decorCount(26, env.low(), 8);
      const drops = Array.from({ length: n }, (_, i) =>
        h('i', {
          style: `left:${((i + 0.5) / n) * 100}%;animation-delay:${((i * 37) % 100) / 100}s;animation-duration:${0.7 + ((i * 53) % 40) / 100}s`,
        }),
      );
      el.replaceChildren(...drops);
    },
  };
}
