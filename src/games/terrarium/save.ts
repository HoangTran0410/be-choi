/** The box the child built, and how it is kept between visits. */
import { bankAt, bankY, trimStock } from './logic';
import type { Vivarium } from './logic';
import type { Decor, Plant } from './scenery';
import { speciesById } from './species';
import type { Species } from './species';

// ---- the box the child built ----

/** The key the box is kept under. */
export const SAVE_KEY = 'be-choi:terrarium';

/**
 * What is worth remembering between visits: who lives here, and where the child
 * put the furniture. Positions are fractions of the box's width, so the log stays
 * where it was put when the tablet is turned on its side.
 */
export interface VivSave {
  v: 1;
  /** Species ids, one per animal. */
  pets: string[];
  /** Fraction of the box width, one per ornament, in `makeDecor` order. */
  decor: number[];
  /** Fraction of the box width, one per plant, in `makePlants` order. */
  plants: number[];
  /**
   * How far down the soil bank each one stands, 0 at the back and 1 against the
   * front glass. Written since the child could drag things back and forth as
   * well as side to side; a save without them just keeps the depth it was
   * generated with, so an older box still opens.
   */
  decorY?: number[];
  plantsY?: number[];
  /** Lights out: the child left the box on its night setting. */
  night?: boolean;
}

const EMPTY_SAVE: VivSave = { v: 1, pets: [], decor: [], plants: [], night: false };

/** Anything unreadable, from an older version or another app, is simply ignored. */
export function readSave(raw: string | null): VivSave | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const save = parsed as Partial<VivSave>;
    if (save.v !== 1) return null;
    const fractions = (list: unknown): number[] =>
      Array.isArray(list) ? list.filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 1) : [];
    const pets = Array.isArray(save.pets)
      ? save.pets.filter((id): id is string => typeof id === 'string' && speciesById(id) !== undefined)
      : [];
    return {
      v: 1,
      pets: trimStock(pets),
      decor: fractions(save.decor),
      plants: fractions(save.plants),
      decorY: fractions(save.decorY),
      plantsY: fractions(save.plantsY),
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
  viv: Vivarium,
  night = false,
): VivSave {
  const across = (x: number): number => Math.min(1, Math.max(0, viv.w > 0 ? x / viv.w : 0));
  return {
    v: 1,
    pets: trimStock(creatures, (cr) => cr.species.id).map((cr) => cr.species.id),
    decor: decor.map((d) => across(d.x)),
    plants: plants.map((plant) => across(plant.x)),
    decorY: decor.map((d) => bankAt(d.y, viv)),
    plantsY: plants.map((plant) => bankAt(plant.y, viv)),
    night,
  };
}

/**
 * Put the saved positions back. A different screen can hold a different number
 * of plants, so anything the save does not cover keeps where it was generated.
 */
export function applySave(save: VivSave, decor: Decor[], plants: Plant[], viv: Vivarium): void {
  save.decor.forEach((fraction, i) => {
    const d = decor[i];
    if (d) d.x = fraction * viv.w;
  });
  save.plants.forEach((fraction, i) => {
    const plant = plants[i];
    if (plant) plant.x = fraction * viv.w;
  });
  save.decorY?.forEach((at, i) => {
    const d = decor[i];
    if (d) d.y = bankY(at, viv);
  });
  save.plantsY?.forEach((at, i) => {
    const plant = plants[i];
    if (plant) plant.y = bankY(at, viv);
  });
}

/** The animals a saved box asks for, or `null` when there is no usable save. */
export function savedStock(save: VivSave | null): Species[] | null {
  if (!save || save.pets.length === 0) return null;
  const out: Species[] = [];
  for (const id of save.pets) {
    const species = speciesById(id);
    if (species) out.push(species);
  }
  return out.length > 0 ? out : null;
}

export { EMPTY_SAVE };
