/**
 * The pond: the fishing game, whole. It was already written to put each catch
 * into the aquarium's save; here that save is a bridge this game reads after
 * every catch, so the fish can be sorted into the tank they belong in (and into
 * the book) the moment they are landed.
 */
import { h } from '../../core/dom';
import { aliasKey, writeJson } from '../../core/save';
import { readSave as readTank } from '../aquarium/logic';
import fishing from '../fishing/index';
import { BRIDGE_KEY, LEGACY_TANK_KEY } from './save';
import type { ChildContext, Scene } from './scene';

export interface PondOptions {
  /** A fish was landed. `id` is the aquarium species id. */
  onCatch(id: string): void;
}

const EMPTY = { v: 1, fish: [] as string[], decor: [] as number[], plants: [] as number[] };

export function createPond(host: HTMLElement, make: (stage: HTMLElement) => ChildContext, opts: PondOptions): Scene {
  // Every catch is written alone: the bridge is emptied again as soon as it is read.
  writeJson(BRIDGE_KEY, EMPTY);
  const release = aliasKey(LEGACY_TANK_KEY, BRIDGE_KEY, (raw) => {
    const fish = readTank(raw)?.fish ?? [];
    const newest = fish[fish.length - 1];
    writeJson(BRIDGE_KEY, EMPTY);
    if (newest) opts.onCatch(newest);
  });
  const stage = h('div', { class: 'hb-embed hb-pond' });
  host.append(stage);
  const ctx = make(stage);
  fishing.start(ctx);
  let gone = false;

  return {
    world: 'pond',
    canDecor: false,
    hasTank: false,
    stage,
    destroy() {
      if (gone) return;
      gone = true;
      ctx.dispose();
      release();
      stage.remove();
    },
    feed() {},
    toggleNight: () => false,
    isNight: () => false,
    special() {},
    addFriend() {},
    addDecor: () => false,
    clearExtras() {},
    flush() {},
    living: () => [],
  };
}
