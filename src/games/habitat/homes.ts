/**
 * Putting an animal into a home that is not on screen: a fish caught at the
 * pond goes to the tank it belongs in, an egg that hatched far away still hatches
 * somewhere. Works on the homes' own saves, in the shape the engines read.
 */
import { readRaw, writeJson } from '../../core/save';
import { readSave as readTank, trimStock as trimFish } from '../aquarium/logic';
import { readSave as readBox, trimStock as trimPets } from '../terrarium/logic';
import { kindByKey } from './catalog';
import { seedBox } from './forest';
import { WORLD_KEY } from './save';
import { seedTank } from './water';

/** True when the animal was written into its home. */
export function addToHome(key: string): boolean {
  const kind = kindByKey(key);
  if (!kind) return false;
  if (kind.realm === 'forest') {
    seedBox();
    const box = readBox(readRaw(WORLD_KEY.forest)) ?? { v: 1 as const, pets: [], decor: [], plants: [] };
    return writeJson(WORLD_KEY.forest, { ...box, pets: trimPets([...box.pets, kind.id]) });
  }
  seedTank(kind.realm);
  const tank = readTank(readRaw(WORLD_KEY[kind.realm])) ?? { v: 1 as const, fish: [], decor: [], plants: [] };
  return writeJson(WORLD_KEY[kind.realm], { ...tank, fish: trimFish([...tank.fish, kind.id]) });
}
