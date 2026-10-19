import { readRaw, writeJson } from '../../core/save';
import { SAVE_KEY, makeSave } from './logic';
import type { State } from './state';

export function load(): string | null {
  return readRaw(SAVE_KEY);
}

/**
 * Keep who lives here and where the furniture ended up. Called after anything
 * the child did on purpose, never every frame: this is their tank, not a replay.
 */
export function save(s: State): void {
  if (!s.tank.w) return;
  // Blocked or full storage: the tank still plays, it just forgets.
  writeJson(SAVE_KEY, makeSave(s.creatures, s.decor, s.plants, s.tank, s.night));
}
