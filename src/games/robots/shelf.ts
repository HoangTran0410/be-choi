/**
 * The shelf under the stage: every robot the child has so far, in a row that scrolls sideways.
 * A robot that is on stage leaves its place on the shelf empty (a ghost outline), and comes back
 * to the same place when it steps off, so the shelf always looks the same.
 */
import { h } from '../../core/dom';
import { createRig, setPose } from './art';
import type { RobotDef } from './robots';

export interface Shelf {
  readonly el: HTMLElement;
  /** Show these robots (in order). `fresh` ones get a sparkle until they are first touched. */
  setRobots(defs: readonly RobotDef[], fresh?: ReadonlySet<string>): void;
  /** Which robots are on the stage right now (their shelf place shows a ghost). */
  setOnStage(ids: ReadonlySet<string>): void;
  /** The robot a child has picked, waiting for a seat. */
  select(id: string | null): void;
  /** Make a robot wobble to get noticed (the gentle hint). */
  nudge(id: string | null): void;
  itemEl(id: string): HTMLElement | null;
  /** Clear the "new" sparkle. */
  seen(id: string): void;
  /** A copy of a robot's picture, for carrying. */
  ghost(id: string): HTMLElement | null;
  dispose(): void;
}

export function createShelf(): Shelf {
  const track = h('div', { class: 'rb-track' });
  const el = h('div', { class: 'rb-shelf', role: 'list' }, track);
  const items = new Map<string, HTMLElement>();
  const defs = new Map<string, RobotDef>();
  let nudged: string | null = null;

  const onWheel = (e: WheelEvent): void => {
    // A mouse wheel scrolls sideways here: the shelf only goes that way.
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };
  el.addEventListener('wheel', onWheel, { passive: false });

  function picture(def: RobotDef): HTMLElement {
    const rig = createRig(def.color, def.look);
    setPose(rig, null);
    return h('div', { class: 'rb-shelf-art' }, rig.svg);
  }

  return {
    el,
    setRobots(list, fresh) {
      track.replaceChildren();
      items.clear();
      defs.clear();
      for (const def of list) {
        defs.set(def.id, def);
        const item = h(
          'div',
          { class: 'rb-item', role: 'listitem', 'data-robot': def.id, 'aria-label': def.name, style: `--c:${def.color}` },
          picture(def),
          h('div', { class: 'rb-new', 'aria-hidden': 'true' }, '✨'),
        );
        if (fresh?.has(def.id)) item.classList.add('fresh');
        items.set(def.id, item);
        track.append(item);
      }
    },
    setOnStage(ids) {
      for (const [id, item] of items) item.classList.toggle('on-stage', ids.has(id));
    },
    select(id) {
      for (const [k, item] of items) item.classList.toggle('picked', k === id);
    },
    nudge(id) {
      if (nudged) items.get(nudged)?.classList.remove('nudge');
      nudged = id;
      const item = id ? items.get(id) : null;
      if (!item) return;
      void item.offsetWidth;
      item.classList.add('nudge');
      // Bring it into view when the shelf has been scrolled away from it.
      const left = item.offsetLeft - (el.clientWidth - item.offsetWidth) / 2;
      if (Number.isFinite(left)) el.scrollLeft = Math.max(0, left);
    },
    itemEl: (id) => items.get(id) ?? null,
    seen(id) {
      items.get(id)?.classList.remove('fresh');
    },
    ghost(id) {
      const def = defs.get(id);
      if (!def) return null;
      const g = h('div', { class: 'rb-carry', style: `--c:${def.color}` }, picture(def));
      return g;
    },
    dispose() {
      el.removeEventListener('wheel', onWheel);
      el.remove();
    },
  };
}
