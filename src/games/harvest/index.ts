import { h } from '../../core/dom';
import { perf, startLoop } from '../../core/frame';
import type { Photo } from '../../core/photos';
import type { GameContext, GameModule } from '../../core/types';
import { SPECIES, tickPen } from './animals';
import { rain, tickPlot, growthRate } from './crops';
import { centerOf, TABS, type Env, type Pt, type Tab } from './env';
import { createBarn } from './barn';
import { createGarden } from './garden';
import { createBasket, createHud, createRain, createTabs } from './hud';
import { createMarket } from './market';
import { meta } from './meta';
import { gainXp, loadFarm, saveFarm, unlocksAt } from './progress';
import { setClass, wiggle } from './ui';
import { daylight, newWeather, skyGradient, stepWeather } from './world';
import './style.css';

/** A save is written this long after the last change, and at least this often otherwise (ms). */
const SAVE_SOON_MS = 1500;
const SAVE_EVERY_MS = 20_000;
/** How long the "new!" card stays if nobody taps it. */
const NEW_CARD_MS = 4500;
/** Minimum gap between two chatty lines, such as the one said as a finger drags over plots (ms). */
const SAY_GAP_MS = 1400;

function start(ctx: GameContext): void {
  const state = loadFarm();
  const weather = newWeather();
  let alive = true;
  let photos: Photo[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const layer = h('div', { class: 'hv-layer' });
  const root = h('div', { class: 'hv' });
  ctx.stage.append(root);
  ctx.onCleanup(() => {
    alive = false;
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    saveFarm(state);
    root.remove();
  });

  let lastSay = -Infinity;
  let dirtyAt = -1;
  let lastSave = 0;
  let newCard: HTMLElement | null = null;

  const later = (fn: () => void, ms: number): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  };

  // The env object is filled in below; views only use it after start() returns.
  const env: Env = {
    ctx,
    state,
    weather,
    layer,
    get photos() {
      return photos;
    },
    selected: null,
    tab: 'garden',
    views: {},
    low: () => perf.low,
    say(text, force = true) {
      const now = performance.now();
      // Answers to a touch are always spoken; only the stream of drag-by-drag chatter is thinned out.
      if (!text || (!force && now - lastSay < SAY_GAP_MS)) return;
      lastSay = now;
      ctx.speak(text);
    },
    dirty() {
      if (dirtyAt < 0) dirtyAt = performance.now();
    },
    gainXp(amount) {
      const up = gainXp(state, amount);
      if (up && up > state.seen) {
        state.seen = up;
        showNew(up);
      }
    },
    later,
    fly(emoji, from, to) {
      const a = place(from);
      const b = place(to) ?? a;
      if (!a || !b) return;
      const node = h('div', { class: 'hv-fly', style: `transform:translate(${a.x}px,${a.y}px) translate(-50%,-50%)` }, emoji);
      layer.append(node);
      later(() => {
        node.style.transform = `translate(${b.x}px,${b.y}px) translate(-50%,-50%) scale(0.7)`;
      }, 30);
      later(() => node.remove(), 800);
    },
    stockChanged() {
      basket.sync();
    },
    go(tab) {
      goTo(tab);
    },
    sparkle(at, glyph = '✨') {
      const c = centerOf(at);
      const n = h('div', { class: 'hv-pop', style: `left:${c.x}px;top:${c.y}px` }, glyph);
      layer.append(n);
      later(() => n.remove(), 1000);
    },
  };

  function place(x: Element | Pt | string): Pt | null {
    if (typeof x !== 'string') return centerOf(x);
    const chip = basket.el.querySelector(`[data-item="${x}"]`);
    return centerOf(chip ?? basket.el);
  }

  const hud = createHud(env);
  const basket = createBasket(env);
  const tabs = createTabs(env);
  const rainFx = createRain(env);
  const garden = createGarden(env);
  const barn = createBarn(env);
  const market = createMarket(env);
  env.views = { garden, barn, market };
  const views: Record<Tab, typeof garden> = { garden, barn, market };

  const main = h('div', { class: 'hv-main' }, garden.el, barn.el, market.el);
  root.append(hud.el, main, basket.el, tabs.el, rainFx.el, layer);
  ctx.audio.preloadFx(SPECIES.map((s) => s.voice));

  function goTo(tab: Tab): void {
    const changed = tab !== env.tab;
    env.tab = tab;
    root.dataset.tab = tab;
    for (const t of TABS) setClass(views[t].el, 'on', t === tab);
    tabs.setActive(tab);
    views[tab].sync();
    basket.sync();
    if (changed) {
      ctx.audio.pop(1.2);
      views[tab].enter?.();
    }
    ctx.hint.touch();
  }

  function showNew(level: number): void {
    const gifts = unlocksAt(level);
    newCard?.remove();
    const card = h(
      'div',
      { class: 'hv-new' },
      h('div', { class: 'hv-new-t' }, '⭐ Mới! ⭐'),
      h('div', { class: 'hv-new-gifts' }, ...gifts.map((g) => h('div', { class: 'hv-gift' }, h('span', {}, g.emoji)))),
    );
    newCard = card;
    layer.append(card);
    const close = (): void => {
      card.remove();
      if (newCard === card) newCard = null;
    };
    card.addEventListener('pointerdown', close);
    later(close, NEW_CARD_MS);
    ctx.audio.jingle();
    ctx.addStar();
    env.say(`Mới rồi! ${gifts.map((g) => g.name).join(', ')}.`, true);
    void ctx.celebrate();
    for (const t of TABS) views[t].sync();
  }

  // Family photos: on the sign, the barn wall and as customers.
  const photosChanged = (list: Photo[]): void => {
    if (!alive) return;
    photos = list;
    hud.sync();
    views[env.tab].sync();
  };
  void ctx.photos.list().then(photosChanged);
  const offPhotos = ctx.photos.onChange(photosChanged);
  ctx.onCleanup(offPhotos);

  // ---- the clock ----
  let acc = { view: 0, hud: 0, tabs: 0, sky: 0, rain: 0 };
  startLoop(
    ctx,
    (_now, dtMs) => {
      const dt = dtMs / 1000;
      if (dt <= 0) return;
      state.clock += dt;
      const ev = stepWeather(weather, dt);
      if (ev === 'start') env.say('Trời mưa rồi! Cây được uống nước.', true);
      acc.rain += dt;
      if (weather.raining && (ev === 'start' || acc.rain > 2.5)) {
        acc.rain = 0;
        if (rain(state.plots) > 0) env.dirty();
      }
      const rate = growthRate(daylight(state.clock), weather.raining);
      let grew = false;
      for (const p of state.plots) if (tickPlot(p, dt, rate)) grew = true;
      if (grew) {
        env.dirty();
        if (env.tab === 'garden') ctx.audio.pop(1.5);
      }
      let ready = false;
      for (const pen of state.pens) if (tickPen(pen, dt)) ready = true;
      if (ready) {
        env.dirty();
        ctx.audio.pop(1.8);
      }

      acc.view += dt;
      acc.hud += dt;
      acc.tabs += dt;
      acc.sky += dt;
      if (acc.view > 0.15 || grew || ready) {
        acc.view = 0;
        views[env.tab].sync();
      }
      if (acc.hud > 0.5) {
        acc.hud = 0;
        hud.sync();
        rainFx.sync();
      }
      if (acc.tabs > 0.4) {
        acc.tabs = 0;
        tabs.sync();
        basket.sync();
      }
      if (acc.sky > 1) {
        acc.sky = 0;
        root.style.background = skyGradient(state.clock, weather.raining);
        root.style.setProperty('--dark', (1 - daylight(state.clock)).toFixed(2));
        setClass(root, 'lite', perf.low);
        setClass(root, 'rainy', weather.raining);
      }
      const now = performance.now();
      if ((dirtyAt >= 0 && now - dirtyAt > SAVE_SOON_MS) || now - lastSave > SAVE_EVERY_MS) {
        saveFarm(state);
        dirtyAt = -1;
        lastSave = now;
      }
    },
    { maxFps: 15 },
  );

  // ---- nudges when nothing has happened for a while ----
  root.addEventListener('pointerdown', () => ctx.hint.touch());
  ctx.hint.arm(() => {
    const target = views[env.tab].hint();
    if (target) {
      wiggle(target, 'hv-hint');
      return;
    }
    const other = TABS.find((t) => t !== env.tab && views[t].badge() > 0);
    if (other) wiggle(tabs.button(other), 'hv-hint');
  }, 7000);

  hud.sync();
  rainFx.sync();
  root.style.background = skyGradient(state.clock, false);
  goTo('garden');
  tabs.sync();
  lastSave = performance.now();
}

const game: GameModule = { ...meta, start };
export default game;
