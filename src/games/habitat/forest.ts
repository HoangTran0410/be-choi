/**
 * The little forest: the whole terrarium game, running on this home's own copy of
 * the box. Its four round buttons are hidden and pressed from this game's toolbar
 * instead, so the child has one set of buttons in every world. Letting a new
 * friend in is done by rewriting the box and opening it again, because the
 * terrarium keeps its animals to itself.
 */
import { h } from '../../core/dom';
import { aliasKey, readRaw, writeJson } from '../../core/save';
import terrarium from '../terrarium/index';
import { readSave as readBox } from '../terrarium/logic';
import { STARTER_FOREST, kindByKey } from './catalog';
import { LEGACY_BOX_KEY, WORLD_KEY } from './save';
import type { ChildContext, Scene } from './scene';

export interface ForestOptions {
  /** Open the box again: a ChildContext for the embedded game, made fresh each time. */
  make(stage: HTMLElement): ChildContext;
}

/** A box that has never been opened starts with a snail and a ladybird. */
export function seedBox(): void {
  if (readRaw(WORLD_KEY.forest) !== null) return;
  writeJson(WORLD_KEY.forest, { v: 1, pets: [...STARTER_FOREST], decor: [], plants: [], night: false });
}

export function createForest(host: HTMLElement, opts: ForestOptions): Scene {
  seedBox();
  const release = aliasKey(LEGACY_BOX_KEY, WORLD_KEY.forest);
  const stage = h('div', { class: 'hb-embed hb-forest' });
  host.append(stage);
  let ctx: ChildContext | null = null;
  let gone = false;

  function open(): void {
    ctx = opts.make(stage);
    terrarium.start(ctx);
  }
  function close(): void {
    ctx?.dispose();
    ctx = null;
    stage.replaceChildren();
  }
  /** Press one of the box's own (hidden) buttons. */
  function press(cls: string): void {
    const btn = stage.querySelector<HTMLElement>(cls);
    btn?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  }

  /** Let `key` in. The box is read, the newcomer written in, and the box opened again. */
  function letIn(key: string): void {
    const kind = kindByKey(key);
    if (!kind || kind.family !== 'tr') return;
    const saved = readBox(readRaw(LEGACY_BOX_KEY));
    const base = saved ?? { v: 1 as const, pets: [], decor: [], plants: [] };
    writeJson(LEGACY_BOX_KEY, { ...base, pets: [...base.pets, kind.id] });
    close();
    open();
  }
  open();

  return {
    world: 'forest',
    canDecor: false,
    hasTank: true,
    stage,
    destroy() {
      if (gone) return;
      gone = true;
      close();
      release();
      stage.remove();
    },
    feed: () => press('.terrarium-feed'),
    toggleNight() {
      press('.terrarium-lamp');
      return stage.querySelector('.terrarium-night') !== null;
    },
    isNight: () => stage.querySelector('.terrarium-night') !== null,
    special: () => press('.terrarium-mist'),
    addFriend: letIn,
    addDecor: () => false,
    clearExtras() {
      /* the forest keeps its own furniture */
    },
    flush() {
      /* the box saves itself after everything the child does */
    },
    living: () => (readBox(readRaw(LEGACY_BOX_KEY))?.pets ?? []).map((id) => `tr:${id}`),
  };
}
