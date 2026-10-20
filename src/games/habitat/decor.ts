/** The things a child can put in a tank, and which ones are open yet. */
import type { DecorKind } from '../aquarium/scenery';
import type { Realm } from './worlds';

export type DecorId = 'plant' | DecorKind;

export const DECOR_EMOJI: Record<DecorId, string> = {
  plant: '🌿',
  weed: '🎋',
  boulder: '🪨',
  anemone: '🪸',
  castle: '🏰',
  arch: '🌈',
  chest: '🧰',
  hoop: '⭕',
};

/** Open from the first minute. */
export const DECOR_START: readonly DecorId[] = ['plant', 'weed', 'boulder', 'anemone'];

/** Opened by quests, in this order. */
export const DECOR_REWARDS: readonly DecorId[] = ['castle', 'chest', 'arch', 'hoop'];

/** What each home can hold. (The forest keeps its own furniture.) */
export const DECOR_BY_REALM: Record<Realm, readonly DecorId[]> = {
  fresh: ['plant', 'weed', 'boulder', 'castle', 'arch', 'chest', 'hoop'],
  sea: ['anemone', 'boulder', 'castle', 'arch', 'chest', 'hoop'],
  forest: [],
};

/** Size in tank units, and which layer it stands on, for the ornaments the child adds. */
export const DECOR_LOOK: Record<DecorKind, { size: number; layer: 'far' | 'mid' | 'near' }> = {
  boulder: { size: 1.2, layer: 'far' },
  castle: { size: 2.2, layer: 'far' },
  arch: { size: 1.8, layer: 'far' },
  anemone: { size: 0.8, layer: 'mid' },
  chest: { size: 0.95, layer: 'mid' },
  hoop: { size: 1.3, layer: 'mid' },
  weed: { size: 2.2, layer: 'mid' },
};

/** Most pieces of added furniture a tank keeps; a new one then replaces the oldest. */
export const MAX_EXTRAS = 8;

export function isDecorId(id: unknown): id is DecorId {
  return typeof id === 'string' && id in DECOR_EMOJI;
}
