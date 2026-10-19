import { h, replay } from '../../core/dom';
import { SLOT_UNITS, forkAt, legAt, nextFork, slotX, takeFork, type LegPlan } from './logic';
import type { Drive } from './state';

export function takeWay(d: Drive, slot: number, plan: LegPlan, tapped: boolean): void {
  if (d.chosen.has(slot)) return;
  d.chosen.set(slot, plan.up);
  takeFork(d.road, slot, plan);
  d.el.root.dataset.way = plan.name;
  if (tapped) {
    d.ctx.audio.ding();
    d.ctx.speak(`Đi ${plan.name} nhé!`);
  }
}

/** Where the road has got to, so the tray and the trees agree on the place. */
export function showPlace(d: Drive): void {
  const here = legAt(d.road, d.car.x).biome;
  if (d.el.root.dataset.place === here) return;
  d.el.root.dataset.place = here;
  if (here !== 'meadow' || d.chosen.size > 0) d.ctx.audio.fx('sparkle');
}

/** Put the two ways on screen as buttons, or take them away again. */
export function offerWays(d: Drive, slot: number | null): void {
  if (d.asking === slot) return;
  d.asking = slot;
  const panel = d.el.forkPanel;
  panel.textContent = '';
  if (slot === null) {
    panel.hidden = true;
    return;
  }
  for (const plan of forkAt(slot)) {
    const btn = h(
      'button',
      {
        class: `drive-way ${plan.up ? 'up' : 'down'}`,
        type: 'button',
        'data-way': plan.biome,
        'aria-label': plan.name,
      },
      h('span', { class: 'drive-way-sign' }, plan.emoji),
      h('span', { class: 'drive-way-arrow' }, plan.up ? '⬆️' : '⬇️'),
    );
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      d.ctx.hint.touch();
      takeWay(d, slot, plan, true);
      offerWays(d, null);
    });
    panel.append(btn);
  }
  panel.hidden = false;
  replay(panel, 'anim-bounce');
}

/** Ask as the fork comes into view, and pick for the child if they do not. */
export function forks(d: Drive): void {
  const { road, car } = d;
  const slot = nextFork(Math.floor(car.x / (road.unit * SLOT_UNITS)) - 1);
  const x = slotX(road, slot);
  if (d.chosen.has(slot)) {
    offerWays(d, null);
    return;
  }
  if (x - car.x < road.unit * 9) {
    if (!d.asked.has(slot)) {
      d.asked.add(slot);
      d.ctx.audio.fx('sparkle');
      d.ctx.speak('Bé chọn đường nào?');
    }
    offerWays(d, slot);
  }
  // Reaching the fork with no choice made: the road picks one so it never stalls.
  if (car.x >= x - road.unit * 0.6) {
    const ways = forkAt(slot);
    takeWay(d, slot, ways[d.rng() < 0.5 ? 0 : 1]!, false);
    offerWays(d, null);
  }
}
