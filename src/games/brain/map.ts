/**
 * The island: five stations on a winding path. Every open station can be tapped in
 * any order; the explorer just stands by the one that has had the least play.
 * Locked stations show how many stars they still need — and wiggle, never scold.
 */
import { h, replay } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import { ISLANDS, islandsOpen, starsToUnlock, STATION_IDS, unlockedStations, type StationId } from './levels';
import type { Progress } from './progress';
import { STATIONS } from './stations';

/** Node centres in % of the map: one set for tall screens, one for wide. */
const POS: Record<'tall' | 'wide', Record<StationId, [number, number]>> = {
  tall: { cards: [22, 16], missing: [72, 30], sequence: [28, 48], tubes: [72, 65], diff: [30, 83] },
  wide: { cards: [10, 58], missing: [27, 37], sequence: [50, 66], tubes: [73, 37], diff: [90, 60] },
};

const DECOR: readonly (readonly [string, number, number])[][] = [
  [['🌴', 6, 6], ['🥥', 88, 10], ['🐚', 52, 93], ['🦀', 90, 88], ['⛵', 8, 90]],
  [['🌲', 7, 8], ['🍄', 90, 8], ['🐿️', 50, 94], ['🌳', 91, 90], ['🦊', 7, 91]],
  [['🐠', 8, 8], ['🐙', 90, 9], ['🐚', 49, 94], ['⚓', 91, 90], ['🌊', 7, 91]],
];

export interface MapView {
  el: HTMLElement;
  /** Nodes by station, so a locked one can wiggle. */
  node(id: StationId): HTMLElement | undefined;
}

export function renderMap(
  ctx: GameContext,
  p: Progress,
  suggested: StationId,
  on: { station(id: StationId): void; locked(id: StationId, need: number): void; island(i: number): void },
): MapView {
  const open = unlockedStations(p.stars);
  const nodes = new Map<StationId, HTMLElement>();

  const paths = (['tall', 'wide'] as const).map((kind) => {
    const pts = STATION_IDS.map((id) => POS[kind][id].join(',')).join(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', `brain-path brain-path-${kind}`);
    svg.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', pts);
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(line);
    return svg;
  });

  const decor = (DECOR[p.island] ?? DECOR[0]!).map(([e, x, y]) =>
    h('span', { class: 'brain-decor', style: `left:${x}%;top:${y}%`, 'aria-hidden': 'true' }, e),
  );

  for (const id of STATION_IDS) {
    const st = STATIONS[id];
    const isOpen = open.includes(id);
    const need = starsToUnlock(id, p.stars);
    const [tx, ty] = POS.tall[id];
    const [wx, wy] = POS.wide[id];
    const lvl = p.skills[id].level;
    const el = h(
      'button',
      {
        class: `brain-node${isOpen ? '' : ' locked'}${id === suggested && isOpen ? ' suggested' : ''}`,
        type: 'button',
        'data-station': id,
        'aria-label': st.title,
        style: `--tx:${tx}%;--ty:${ty}%;--wx:${wx}%;--wy:${wy}%;--node-c:${st.color}`,
      },
      h('span', { class: 'brain-node-icon' }, isOpen ? st.icon : '🔒'),
      h('span', { class: 'brain-node-name' }, isOpen ? st.title : `còn ${need} ⭐`),
      isOpen && id === suggested ? h('span', { class: 'brain-explorer' }, p.avatar) : null,
      isOpen && lvl > 0 ? h('span', { class: 'brain-node-lvl', 'aria-hidden': 'true' }, '●'.repeat(Math.min(lvl, 5))) : null,
    );
    makeTappable(
      el,
      () => {
        if (isOpen) on.station(id);
        else {
          replay(el, 'anim-wiggle');
          on.locked(id, need);
        }
      },
      { ctx },
    );
    nodes.set(id, el);
  }

  const islands = islandsOpen(p.stars);
  const tabs =
    islands > 1
      ? h(
          'div',
          { class: 'brain-islands' },
          ...Array.from({ length: islands }, (_, i) => {
            const b = h('button', { class: `brain-isle-tab${i === p.island ? ' on' : ''}`, type: 'button', 'aria-label': ISLANDS[i]?.name ?? 'đảo' }, ISLANDS[i]?.emoji ?? '🏝️');
            makeTappable(b, () => on.island(i), { ctx });
            return b;
          }),
        )
      : null;

  const el = h('div', { class: `brain-map brain-isle-${p.island}` }, ...paths, ...decor, ...nodes.values(), tabs);
  return { el, node: (id) => nodes.get(id) };
}
