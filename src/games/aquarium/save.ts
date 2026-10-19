/** The tank the child built, and how it is kept between visits. */
import type { Tank } from './logic';
import { trimStock } from './logic';
import type { Decor, Plant } from './scenery';
import { speciesById } from './species';
import type { Species } from './species';

// ---- the tank the child built ----

/** The key the tank is kept under. */
export const SAVE_KEY = 'be-choi:aquarium';

/**
 * What is worth remembering between visits: who lives here, and where the child
 * put the furniture. Positions are fractions of the tank's width, so the castle
 * stays where it was put when the tablet is turned on its side.
 */
export interface TankSave {
  v: 1;
  /** Species ids, one per animal. */
  fish: string[];
  /** Fraction of the tank width, one per ornament, in `makeDecor` order. */
  decor: number[];
  /** Fraction of the tank width, one per plant, in `makePlants` order. */
  plants: number[];
  /** Lights out: the child left the tank on its night setting. */
  night?: boolean;
}

const EMPTY_SAVE: TankSave = { v: 1, fish: [], decor: [], plants: [], night: false };

/** Anything unreadable, from an older version or another app, is simply ignored. */
export function readSave(raw: string | null): TankSave | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const save = parsed as Partial<TankSave>;
    if (save.v !== 1) return null;
    const fractions = (list: unknown): number[] =>
      Array.isArray(list) ? list.filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 1) : [];
    const fish = Array.isArray(save.fish)
      ? save.fish.filter((id): id is string => typeof id === 'string' && speciesById(id) !== undefined)
      : [];
    return {
      v: 1,
      fish: trimStock(fish),
      decor: fractions(save.decor),
      plants: fractions(save.plants),
      night: save.night === true,
    };
  } catch {
    return null;
  }
}

export function makeSave(
  creatures: readonly { species: Species }[],
  decor: readonly Decor[],
  plants: readonly Plant[],
  tank: Tank,
  night = false,
): TankSave {
  const across = (x: number): number => Math.min(1, Math.max(0, tank.w > 0 ? x / tank.w : 0));
  return {
    v: 1,
    fish: trimStock(creatures, (cr) => cr.species.id).map((cr) => cr.species.id),
    decor: decor.map((d) => across(d.x)),
    plants: plants.map((plant) => across(plant.x)),
    night,
  };
}

/**
 * Put the saved positions back. A different screen can hold a different number
 * of plants, so anything the save does not cover keeps where it was generated.
 */
export function applySave(save: TankSave, decor: Decor[], plants: Plant[], tank: Tank): void {
  save.decor.forEach((fraction, i) => {
    const d = decor[i];
    if (d) d.x = fraction * tank.w;
  });
  save.plants.forEach((fraction, i) => {
    const plant = plants[i];
    if (plant) plant.x = fraction * tank.w;
  });
}

/** The animals a saved tank asks for, or `null` when there is no usable save. */
export function savedStock(save: TankSave | null): Species[] | null {
  if (!save || save.fish.length === 0) return null;
  const out: Species[] = [];
  for (const id of save.fish) {
    const species = speciesById(id);
    if (species) out.push(species);
  }
  return out.length > 0 ? out : null;
}

export { EMPTY_SAVE };
