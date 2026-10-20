/** The barn: feed the animals what grew in the garden and collect what they give. */
import { h } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import { collect, feed, pickFood, speciesAt, speciesById, SPECIES, wantedCrop, type Pen } from './animals';
import { cropById } from './crops';
import { elementAt, type Env, type Pt, type View } from './env';
import { itemById } from './orders';
import { addStock, levelFor, stockOf, takeStock, XP_COLLECT } from './progress';
import { pop, setClass, setFrame, setText, wiggle } from './ui';

export function createBarn(env: Env): View {
  const { ctx, state } = env;
  const grid = h('div', { class: 'hv-pens' });
  const frame = h('div', { class: 'hv-frame hv-frame-barn' });
  const el = h('div', { class: 'hv-view hv-barn' }, h('div', { class: 'hv-wall' }, frame, h('span', { class: 'hv-hay' }, '🌾')), grid);

  const penEls = new Map<string, HTMLElement>();
  let built = '';
  let lockedEl: HTMLElement | null = null;

  const penOf = (id: string): Pen | undefined => state.pens.find((p) => p.id === id);

  /** Give animal `id` one helping of `cropId`. Returns true if it ate. */
  const feedPen = (id: string, cropId: string | null): boolean => {
    const pen = penOf(id);
    const sp = speciesById(id);
    const node = penEls.get(id);
    if (!pen || !sp || !node) return false;
    if (pen.phase === 'ready') {
      takeProduct(id);
      return false;
    }
    ctx.audio.fx(sp.voice);
    if (pen.phase === 'chewing') {
      env.say(`${sp.name} kêu, ${sp.says}.`);
      wiggle(node.querySelector('.hv-animal'));
      return false;
    }
    const sel = env.selected && cropById(env.selected) && stockOf(state, env.selected) > 0 ? env.selected : null;
    const crop = cropId ?? sel ?? pickFood(sp, state.stock);
    if (!crop || stockOf(state, crop) <= 0) {
      const want = cropById(wantedCrop(sp, levelFor(state.xp)));
      env.say(`${sp.name} đói, muốn ăn ${want?.name ?? 'rau'}.`);
      wiggle(node.querySelector('.hv-bubble'));
      env.go('garden');
      return false;
    }
    takeStock(state, crop);
    const result = feed(pen, sp, crop);
    const c = cropById(crop)!;
    env.fly(c.emoji, crop, node);
    ctx.audio.chomp();
    pop(env, node, result === 'liked' ? '😋' : '🙂');
    env.say(result === 'liked' ? `${sp.name} thích ${c.name}!` : `${sp.name} ăn ${c.name}.`);
    wiggle(node.querySelector('.hv-animal'), 'hv-munch');
    env.stockChanged();
    env.dirty();
    sync();
    return true;
  };

  const takeProduct = (id: string): void => {
    const pen = penOf(id);
    const sp = speciesById(id);
    const node = penEls.get(id);
    if (!pen || !sp || !node) return;
    const got = collect(pen, sp);
    if (!got) return;
    if (got === 'love') {
      pop(env, node, '❤️');
      ctx.audio.ding();
      env.say(`${sp.name} yêu bé!`);
    } else {
      const item = itemById(got);
      addStock(state, got, 1);
      ctx.audio.ding();
      if (item) env.fly(item.emoji, node, got);
      env.say(`${item?.name ?? 'Quà'}!`);
      env.stockChanged();
    }
    env.gainXp(XP_COLLECT);
    env.dirty();
    sync();
  };

  const tapPen = (id: string): void => {
    const pen = penOf(id);
    if (pen?.phase === 'ready') takeProduct(id);
    else feedPen(id, null);
  };

  const build = (): void => {
    const level = levelFor(state.xp);
    const have = speciesAt(level);
    const key = have.map((s) => s.id).join(',');
    built = key;
    penEls.clear();
    const nodes: HTMLElement[] = have.map((sp) => {
      const node = h(
        'button',
        { class: 'hv-pen', type: 'button', 'aria-label': sp.name },
        h('span', { class: 'hv-animal' }, sp.emoji),
        h('span', { class: 'hv-bubble' }),
        h('span', { class: 'hv-give' }),
        h('span', { class: 'hv-chew' }, h('i'), h('i'), h('i')),
      );
      makeTappable(node, () => tapPen(sp.id), { ctx, feedback: false, cooldownMs: 160 });
      penEls.set(sp.id, node);
      return node;
    });
    // Whoever moves in next, as a dark shape: something to look forward to.
    const next = SPECIES.find((s) => s.level > level);
    lockedEl = null;
    if (next) {
      lockedEl = h(
        'div',
        { class: 'hv-pen locked', 'aria-hidden': 'true' },
        h('span', { class: 'hv-animal' }, next.emoji),
        h('span', { class: 'hv-lock' }, '🔒'),
      );
      nodes.push(lockedEl);
    }
    grid.replaceChildren(...nodes);
  };

  const layout = (): void => {
    const n = grid.children.length;
    const landscape = el.clientWidth > el.clientHeight;
    const cols = landscape ? Math.max(2, Math.ceil(n / 2)) : 2;
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(Math.ceil(n / cols)));
  };

  function sync(): void {
    const level = levelFor(state.xp);
    if (
      built !==
      speciesAt(level)
        .map((s) => s.id)
        .join(',')
    )
      build();
    layout();
    setFrame(frame, env.photos[1] ?? env.photos[0], '🖼️');
    for (const pen of state.pens) {
      const node = penEls.get(pen.id);
      const sp = speciesById(pen.id);
      if (!node || !sp) continue;
      const hungry = pen.phase === 'hungry';
      const bubble = node.querySelector('.hv-bubble')!;
      setText(bubble, hungry ? (cropById(wantedCrop(sp, level))?.emoji ?? '') : '');
      const give = node.querySelector('.hv-give')!;
      setText(give, pen.phase === 'ready' ? (sp.product ? (itemById(sp.product)?.emoji ?? '') : '❤️') : '');
      setClass(node, 'hungry', hungry);
      setClass(node, 'chewing', pen.phase === 'chewing');
      setClass(node, 'ready', pen.phase === 'ready');
    }
  }

  build();

  return {
    el,
    sync,
    badge: () => Math.min(9, state.pens.filter((p) => p.phase === 'ready').length),
    hint() {
      const ready = state.pens.find((p) => p.phase === 'ready');
      if (ready) return penEls.get(ready.id) ?? null;
      const hungry = state.pens.find((p) => p.phase === 'hungry');
      return hungry ? (penEls.get(hungry.id) ?? null) : null;
    },
    chipTap(id) {
      const item = itemById(id);
      if (!item) return;
      env.say(`${item.name}.`);
      if (item.kind === 'product') ctx.audio.tick();
    },
    chipDrop(id: string, p: Pt) {
      if (!cropById(id)) return false;
      const node = elementAt(p, penEls.values(), 10);
      if (!node) return false;
      const penId = [...penEls.entries()].find(([, n]) => n === node)?.[0];
      return penId ? feedPen(penId, id) : false;
    },
  };
}
