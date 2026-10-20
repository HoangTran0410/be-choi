/** The vegetable patch: plant, water, watch it grow, pick. */
import { h } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import {
  actionFor,
  cropById,
  cropsAt,
  harvest,
  isRipe,
  isThirsty,
  plant,
  plotEmoji,
  STAGE_NAME,
  water,
  type Crop,
  type Plot,
} from './crops';
import { elementAt, type Env, type Pt, type View } from './env';
import { addStock, levelFor, XP_HARVEST } from './progress';
import { pop, pressOrDrag, setClass, wiggle } from './ui';

/** Milliseconds the "drinking" drops fall for. */
const DRINK_MS = 800;

export function createGarden(env: Env): View {
  const { ctx, state } = env;
  let seed: Crop = cropsAt(levelFor(state.xp))[0]!;
  let trayLevel = 0;
  let plotCount = 0;

  const grid = h('div', { class: 'hv-plots' });
  const tray = h('div', { class: 'hv-tray' });
  const el = h('div', { class: 'hv-view hv-garden' }, h('div', { class: 'hv-field' }, grid), tray);

  const plotEls: HTMLElement[] = [];
  const sig = new WeakMap<HTMLElement, string>();

  const drink = (i: number): void => {
    const node = plotEls[i];
    if (!node) return;
    node.classList.add('drink');
    env.later(() => node.classList.remove('drink'), DRINK_MS);
  };

  /** Give plot `i` its drink. True if it was thirsty. */
  const waterPlot = (i: number): boolean => {
    const plot = state.plots[i];
    if (!plot || !water(plot)) return false;
    ctx.audio.pop(1.3);
    drink(i);
    env.dirty();
    sync();
    return true;
  };

  const tapPlot = (i: number): void => {
    const plot = state.plots[i];
    const node = plotEls[i];
    if (!plot || !node) return;
    const act = actionFor(plot);
    if (act === 'plant') {
      plant(plot, seed);
      ctx.audio.pop(0.9);
      env.say(`Gieo hạt ${seed.name}.`);
      env.dirty();
    } else if (act === 'water') {
      waterPlot(i);
      const c = cropById(plot.crop!);
      env.say(`${c?.name ?? 'Cây'}, ${STAGE_NAME[plot.stage]}, uống nước nào.`);
    } else if (act === 'harvest') {
      const got = harvest(plot);
      if (got) {
        addStock(state, got.crop.id, got.n);
        ctx.audio.ding();
        for (let k = 0; k < got.n; k++) env.later(() => env.fly(got.crop.emoji, node, got.crop.id), k * 140);
        pop(env, node, '✨');
        env.say(`${got.crop.name}!`);
        env.stockChanged();
        env.gainXp(XP_HARVEST);
        env.dirty();
      }
    } else {
      // Growing happily: say what it is and how far along, which is the lesson.
      const c = cropById(plot.crop!);
      ctx.audio.tick();
      env.say(`${c?.name ?? 'Cây'}, ${STAGE_NAME[plot.stage]}.`);
      wiggle(node.querySelector('.hv-plant'));
    }
    sync();
  };

  const buildPlots = (): void => {
    plotEls.length = 0;
    const nodes = state.plots.map((_, i) => {
      const node = h(
        'button',
        { class: 'hv-plot', type: 'button', 'aria-label': 'ô đất' },
        h('span', { class: 'hv-soil' }),
        h('span', { class: 'hv-seedghost' }),
        h('span', { class: 'hv-plant' }),
        h('span', { class: 'hv-need' }),
        h('span', { class: 'hv-dots' }, h('i'), h('i'), h('i'), h('i')),
      );
      makeTappable(node, () => tapPlot(i), { ctx, feedback: false, cooldownMs: 90 });
      plotEls.push(node);
      return node;
    });
    grid.replaceChildren(...nodes);
    plotCount = state.plots.length;
  };

  const buildTray = (): void => {
    const level = levelFor(state.xp);
    trayLevel = level;
    const crops = cropsAt(level);
    if (!crops.includes(seed)) seed = crops[0]!;
    const seeds = crops.map((c) => {
      const b = h(
        'button',
        {
          class: `hv-seed${c === seed ? ' on' : ''}${c.level >= 4 ? ' rare' : ''}`,
          type: 'button',
          'aria-label': c.name,
          'data-crop': c.id,
        },
        h('span', { class: 'hv-seed-e' }, c.emoji),
        h('span', { class: 'hv-seed-s' }, '🌰'),
      );
      makeTappable(
        b,
        () => {
          seed = c;
          ctx.audio.pop(1.1);
          env.say(`Hạt ${c.name}.`);
          for (const o of tray.querySelectorAll('.hv-seed')) setClass(o, 'on', o === b);
          sync();
        },
        { ctx },
      );
      return b;
    });
    const can = h(
      'button',
      { class: 'hv-can', type: 'button', 'aria-label': 'tưới nước' },
      h('span', {}, '💧'),
      h('span', { class: 'hv-can-hand' }, '👆'),
    );
    pressOrDrag(env, can, {
      ghost: '🚿',
      onTap() {
        const i = state.plots.findIndex((p) => isThirsty(p));
        if (i >= 0) {
          waterPlot(i);
          env.say('Tưới nước nào.');
        } else {
          ctx.audio.tick();
          env.say('Cây no nước rồi.');
        }
        wiggle(can);
      },
      onMove(p) {
        // Wherever the can passes, every thirsty plot it touches gets a drink.
        const node = elementAt(p, plotEls, 0);
        if (!node) return;
        const i = plotEls.indexOf(node);
        if (i >= 0 && waterPlot(i)) env.say('Tưới nước.', false);
      },
    });
    tray.replaceChildren(can, h('div', { class: 'hv-seeds' }, ...seeds));
  };

  const layout = (): void => {
    const w = el.clientWidth;
    const hh = el.clientHeight;
    const landscape = w > hh;
    const n = state.plots.length;
    const cols = landscape ? Math.ceil(n / 2) : n > 8 ? 3 : 2;
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(Math.ceil(n / cols)));
  };

  const drawPlot = (node: HTMLElement, plot: Plot): void => {
    const key = `${plot.crop}|${plot.stage}|${plot.wet}|${Math.floor(plot.prog * 10)}|${seed.id}`;
    if (sig.get(node) === key) return;
    sig.set(node, key);
    const plantEl = node.querySelector<HTMLElement>('.hv-plant')!;
    const need = node.querySelector<HTMLElement>('.hv-need')!;
    const ghost = node.querySelector<HTMLElement>('.hv-seedghost')!;
    plantEl.textContent = plotEmoji(plot);
    plantEl.dataset.stage = String(plot.stage);
    plantEl.style.setProperty('--g', String(Math.floor(plot.prog * 10) / 10));
    ghost.textContent = plot.crop === null ? seed.emoji : '';
    need.textContent = isThirsty(plot) ? '💧' : isRipe(plot) ? '✨' : '';
    setClass(node, 'empty', plot.crop === null);
    setClass(node, 'thirsty', isThirsty(plot));
    setClass(node, 'wet', plot.wet);
    setClass(node, 'ripe', isRipe(plot));
    node.querySelectorAll('.hv-dots i').forEach((d, k) => {
      setClass(d, 'on', plot.crop !== null && k <= plot.stage);
      setClass(d, 'now', plot.wet && k === plot.stage + 1);
    });
  };

  function sync(): void {
    if (plotCount !== state.plots.length) buildPlots();
    if (trayLevel !== levelFor(state.xp)) buildTray();
    layout();
    state.plots.forEach((p, i) => drawPlot(plotEls[i]!, p));
  }

  buildPlots();
  buildTray();

  return {
    el,
    sync,
    badge: () => Math.min(9, state.plots.filter((p) => isRipe(p) || isThirsty(p)).length),
    hint() {
      const ripe = state.plots.findIndex(isRipe);
      if (ripe >= 0) return plotEls[ripe]!;
      const dry = state.plots.findIndex((p) => isThirsty(p));
      if (dry >= 0) return plotEls[dry]!;
      const bare = state.plots.findIndex((p) => p.crop === null);
      return bare >= 0 ? plotEls[bare]! : null;
    },
    chipTap(id) {
      const c = cropById(id);
      env.say(c ? `${c.name}.` : '');
    },
    chipDrop(_id: string, _p: Pt) {
      return false;
    },
  };
}
