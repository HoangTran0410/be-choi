/** The little worlds a child can keep, and what it takes to open each one. */

export type WorldId = 'fresh' | 'sea' | 'forest' | 'pond';
/** Where an animal lives. The pond is a place to fish, not a home. */
export type Realm = 'fresh' | 'sea' | 'forest';
export type Engine = 'water' | 'forest' | 'pond';

export interface WorldDef {
  id: WorldId;
  icon: string;
  /** Spoken when the child arrives. */
  name: string;
  engine: Engine;
  /** The home that goes with it (the pond fills the fresh-water tank). */
  realm: Realm;
  /** Quest stars needed to open it. */
  stars: number;
  color: string;
}

export const WORLDS: readonly WorldDef[] = [
  { id: 'fresh', icon: '🐠', name: 'Bể cá nước ngọt', engine: 'water', realm: 'fresh', stars: 0, color: '#7dd3fc' },
  { id: 'pond', icon: '🎣', name: 'Ao câu cá', engine: 'pond', realm: 'fresh', stars: 0, color: '#86efac' },
  { id: 'sea', icon: '🌊', name: 'Biển xanh', engine: 'water', realm: 'sea', stars: 2, color: '#38bdf8' },
  { id: 'forest', icon: '🦎', name: 'Khu rừng nhỏ', engine: 'forest', realm: 'forest', stars: 4, color: '#fdba74' },
];

export function worldById(id: string): WorldDef | undefined {
  return WORLDS.find((w) => w.id === id);
}

export function isWorldId(id: unknown): id is WorldId {
  return typeof id === 'string' && WORLDS.some((w) => w.id === id);
}

/** Worlds open to someone with `stars`, plus any that were opened by other means (an older save). */
export function worldsFor(stars: number, extra: readonly WorldId[] = []): WorldId[] {
  return WORLDS.filter((w) => w.stars <= stars || extra.includes(w.id)).map((w) => w.id);
}

/** Realms that have a home the child can visit. */
export const REALMS: readonly Realm[] = ['fresh', 'sea', 'forest'];

export function isRealm(id: unknown): id is Realm {
  return id === 'fresh' || id === 'sea' || id === 'forest';
}
