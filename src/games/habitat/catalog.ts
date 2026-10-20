/**
 * Everyone who can live here, across all the worlds: the fish of the two tanks
 * (Bể cá) and the animals of the forest (Bể cạn). The collection book is this list.
 */
import { SPECIES as TANK_SPECIES } from '../aquarium/species';
import { SPECIES as BOX_SPECIES } from '../terrarium/species';
import type { Realm } from './worlds';

export type Family = 'aq' | 'tr';

export interface Kind {
  /** `aq:goldfish`, `tr:snail`: unique across both families. */
  key: string;
  family: Family;
  /** The id inside its own family's table. */
  id: string;
  realm: Realm;
  /** Vietnamese name, spoken. */
  name: string;
  /** Can be caught on a line. */
  fishable: boolean;
}

/** Which tank each fish belongs in. */
const TANK_REALM: Record<string, Realm> = {
  goldfish: 'fresh',
  guppy: 'fresh',
  zebra: 'fresh',
  koi: 'fresh',
  angel: 'fresh',
  clown: 'sea',
  tang: 'sea',
  puffer: 'sea',
  jelly: 'sea',
  ray: 'sea',
  crab: 'sea',
  shark: 'sea',
};

/** Not catchable: a jellyfish cannot steer to a bait, and a shark is a visitor, not a catch. */
const NOT_FISHABLE = new Set(['jelly', 'shark']);

export const CATALOG: readonly Kind[] = [
  ...TANK_SPECIES.map(
    (s): Kind => ({
      key: `aq:${s.id}`,
      family: 'aq',
      id: s.id,
      realm: TANK_REALM[s.id] ?? 'sea',
      name: s.name,
      fishable: !NOT_FISHABLE.has(s.id),
    }),
  ),
  ...BOX_SPECIES.map((s): Kind => ({ key: `tr:${s.id}`, family: 'tr', id: s.id, realm: 'forest', name: s.name, fishable: false })),
];

/** Shown in this order in the book: the easy, friendly ones first. */
const ORDER = [
  'aq:goldfish',
  'aq:guppy',
  'aq:zebra',
  'aq:koi',
  'aq:angel',
  'aq:clown',
  'aq:tang',
  'aq:puffer',
  'aq:crab',
  'aq:ray',
  'aq:jelly',
  'aq:shark',
  'tr:snail',
  'tr:ladybug',
  'tr:butterfly',
  'tr:frog',
  'tr:turtle',
  'tr:ant',
  'tr:cricket',
  'tr:gecko',
  'tr:lizard',
  'tr:chameleon',
  'tr:snake',
  'tr:beetle',
  'tr:roach',
];

const rank = (k: Kind): number => {
  const i = ORDER.indexOf(k.key);
  return i < 0 ? ORDER.length : i;
};

export const BOOK: readonly Kind[] = [...CATALOG].sort((a, b) => rank(a) - rank(b));

const BY_KEY = new Map(CATALOG.map((k) => [k.key, k]));

export function kindByKey(key: string): Kind | undefined {
  return BY_KEY.get(key);
}

export function kindOf(family: Family, id: string): Kind | undefined {
  return BY_KEY.get(`${family}:${id}`);
}

export function inRealm(realm: Realm): Kind[] {
  return BOOK.filter((k) => k.realm === realm);
}

/** What a brand-new child already has: two friendly fish. */
export const STARTERS: readonly string[] = ['aq:goldfish', 'aq:guppy'];

/** What swims in a tank the first time it is opened (ids inside the family). */
export const STARTER_TANK: Record<'fresh' | 'sea', readonly string[]> = {
  fresh: ['goldfish', 'goldfish', 'guppy', 'guppy', 'guppy'],
  sea: ['clown', 'clown', 'tang'],
};

/** …and in the forest. */
export const STARTER_FOREST: readonly string[] = ['snail', 'ladybug'];

/** What a world gives when it opens, so it is never empty on arrival. */
export const WORLD_GIFT: Record<'sea' | 'forest', readonly string[]> = {
  sea: ['aq:clown', 'aq:tang'],
  forest: ['tr:snail', 'tr:ladybug'],
};
