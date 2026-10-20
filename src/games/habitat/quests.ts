/**
 * Little errands with no words on them: a picture and a few dots. Doing one earns
 * a star, and a star opens something — a new friend, a new ornament, a new world.
 * Three are open at a time, in no order; finishing one brings the next. Nothing
 * runs out, nothing is lost, and an errand that is not done just waits.
 */
import { BOOK, WORLD_GIFT } from './catalog';
import { DECOR_REWARDS, type DecorId } from './decor';
import { collect, type HabitatSave } from './save';
import { WORLDS, worldsFor, type Realm, type WorldId } from './worlds';

export type QuestKind = 'feed' | 'hello' | 'decor' | 'night' | 'add' | 'catch' | 'frame' | 'visit' | 'hatch' | 'visitors';

export interface QuestDef {
  id: string;
  kind: QuestKind;
  n: number;
  icon: string;
  /** Spoken, slowly, when the child taps the picture. */
  say: string;
  /** For `visit`: where to go. */
  world?: WorldId;
  /** Needs family photos to be possible. */
  photos?: boolean;
}

export const QUESTS: readonly QuestDef[] = [
  { id: 'feed3', kind: 'feed', n: 3, icon: '🍤', say: 'Cho các bạn ăn. Ba lần nhé!' },
  { id: 'hello3', kind: 'hello', n: 3, icon: '👆', say: 'Chạm vào các bạn để chào. Ba bạn nhé!' },
  { id: 'decor2', kind: 'decor', n: 2, icon: '🌿', say: 'Đặt hai món trang trí vào nhà bạn nhé!' },
  { id: 'night1', kind: 'night', n: 1, icon: '🌙', say: 'Bật đèn đêm lên nào!' },
  { id: 'add2', kind: 'add', n: 2, icon: '🐟', say: 'Mời hai bạn mới vào nhà nhé!' },
  { id: 'catch1', kind: 'catch', n: 1, icon: '🎣', say: 'Đi câu cá nào. Một chú cá thôi!' },
  { id: 'frame1', kind: 'frame', n: 1, icon: '🖼️', say: 'Treo một bức ảnh lên nhé!', photos: true },
  { id: 'visit-sea', kind: 'visit', n: 1, icon: '🌊', say: 'Sang biển xanh chơi nhé!', world: 'sea' },
  { id: 'hatch1', kind: 'hatch', n: 1, icon: '🥚', say: 'Cho ăn nhiều, quả trứng sẽ nở ra bạn mới!' },
  { id: 'feed6', kind: 'feed', n: 6, icon: '🍤', say: 'Cho các bạn ăn. Sáu lần nhé!' },
  { id: 'decor3', kind: 'decor', n: 3, icon: '🏝️', say: 'Đặt ba món trang trí nhé!' },
  { id: 'catch3', kind: 'catch', n: 3, icon: '🎣', say: 'Câu ba chú cá nhé!' },
  { id: 'visit-forest', kind: 'visit', n: 1, icon: '🌳', say: 'Vào khu rừng nhỏ chơi nhé!', world: 'forest' },
  { id: 'hello6', kind: 'hello', n: 6, icon: '👆', say: 'Chào sáu bạn nhé!' },
  { id: 'visitors1', kind: 'visitors', n: 1, icon: '👨‍👩‍👧', say: 'Mời người thân đến xem nhà bạn nhé!', photos: true },
  { id: 'add3', kind: 'add', n: 3, icon: '🐠', say: 'Mời ba bạn mới nhé!' },
  { id: 'frame2', kind: 'frame', n: 2, icon: '🖼️', say: 'Treo hai bức ảnh nhé!', photos: true },
  { id: 'hatch2', kind: 'hatch', n: 2, icon: '🐣', say: 'Cho trứng nở thêm hai lần nhé!' },
];

export const ACTIVE_QUESTS = 3;

export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

export interface QuestWorld {
  /** Are there family photos to hang? */
  hasPhotos: boolean;
}

export function possible(q: QuestDef, save: HabitatSave, ctx: QuestWorld): boolean {
  if (q.photos && !ctx.hasPhotos) return false;
  if (q.world && !save.worlds.includes(q.world)) return false;
  return true;
}

/** Keep three errands open: the next ones in the line, skipping what cannot be done and doubles. */
export function refill(save: HabitatSave, ctx: QuestWorld): void {
  const qs = save.quests;
  // An errand that no longer makes sense (the photos were taken away) goes back in the line.
  qs.active = qs.active.filter((slot) => {
    const q = questById(slot.id);
    return q !== undefined && possible(q, save, ctx);
  });
  let guard = 0;
  while (qs.active.length < ACTIVE_QUESTS && guard++ < QUESTS.length * 2) {
    const q = QUESTS[qs.next % QUESTS.length]!;
    qs.next = (qs.next + 1) % QUESTS.length;
    if (qs.active.some((s) => s.id === q.id)) continue;
    if (!possible(q, save, ctx)) continue;
    // Three of the same kind in a row is one errand with three faces.
    const sameKind = qs.active.some((s) => questById(s.id)?.kind === q.kind);
    if (sameKind && guard < QUESTS.length) continue;
    qs.active.push({ id: q.id, got: 0 });
  }
}

export interface QuestEvent {
  kind: QuestKind;
  /** For `visit`. */
  world?: WorldId;
  n?: number;
}

/** Count one thing the child did. Returns the errands it finished (not yet claimed). */
export function progress(save: HabitatSave, ev: QuestEvent): QuestDef[] {
  const finished: QuestDef[] = [];
  for (const slot of save.quests.active) {
    const q = questById(slot.id);
    if (!q || q.kind !== ev.kind) continue;
    if (q.world && q.world !== ev.world) continue;
    if (slot.got >= q.n) continue;
    slot.got = Math.min(q.n, slot.got + (ev.n ?? 1));
    if (slot.got >= q.n) finished.push(q);
  }
  return finished;
}

// ---- rewards ----

export type Reward =
  | { type: 'species'; key: string }
  | { type: 'decor'; id: DecorId }
  | { type: 'world'; id: WorldId; gift: string[] }
  | { type: 'star' };

/** Which animals can turn up as a gift: anyone from a world that is open. */
function giftable(save: HabitatSave): string[] {
  const realms = new Set<Realm>(save.worlds.map((w) => WORLDS.find((d) => d.id === w)!.realm));
  return BOOK.filter((k) => realms.has(k.realm) && !save.owned.includes(k.key)).map((k) => k.key);
}

/** The next new ornament in the line, if any is left. */
export function nextDecor(save: HabitatSave): DecorId | null {
  return DECOR_REWARDS.find((d) => !save.decor.includes(d)) ?? null;
}

/**
 * Give a star and what it opens. Worlds first (they are the big ones), then
 * friends and ornaments in turn, so a child who keeps going gets a bit of
 * everything. The gift is added to the book / the shelf here, so claiming twice
 * cannot double it.
 */
export function claim(save: HabitatSave, rng: () => number = Math.random): Reward[] {
  const out: Reward[] = [];
  save.stars++;
  save.quests.done++;
  const opened = worldsFor(save.stars).filter((w) => !save.worlds.includes(w));
  for (const id of opened) {
    save.worlds.push(id);
    const gift = id === 'sea' || id === 'forest' ? WORLD_GIFT[id] : [];
    const fresh = gift.filter((k) => collect(save, k));
    out.push({ type: 'world', id, gift: fresh });
  }
  if (opened.length) return out;
  const wantDecor = save.quests.done % 2 === 0;
  const decor = nextDecor(save);
  const pool = giftable(save);
  if (wantDecor && decor) {
    save.decor.push(decor);
    out.push({ type: 'decor', id: decor });
  } else if (pool.length) {
    const key = pool[Math.floor(rng() * pool.length)]!;
    collect(save, key);
    out.push({ type: 'species', key });
  } else if (decor) {
    save.decor.push(decor);
    out.push({ type: 'decor', id: decor });
  } else {
    out.push({ type: 'star' });
  }
  return out;
}

/** Finish an errand: take it off the list and claim its star. */
export function complete(save: HabitatSave, id: string, ctx: QuestWorld, rng?: () => number): Reward[] {
  save.quests.active = save.quests.active.filter((s) => s.id !== id);
  const rewards = claim(save, rng);
  refill(save, ctx);
  return rewards;
}

/** A new animal for an egg: from this home first, then any open home, then a repeat. */
export function hatchKey(save: HabitatSave, realm: Realm, rng: () => number = Math.random): string {
  const fromHome = BOOK.filter((k) => k.realm === realm && !save.owned.includes(k.key));
  const fromAny = giftable(save);
  const pool = fromHome.length ? fromHome.map((k) => k.key) : fromAny;
  if (pool.length) return pool[Math.floor(rng() * pool.length)]!;
  const mine = BOOK.filter((k) => k.realm === realm);
  return mine[Math.floor(rng() * mine.length)]!.key;
}

/** Feeds between eggs. */
export const FEEDS_PER_EGG = 4;

/** Count a feeding towards the next egg. True when the egg has just appeared. */
export function feedEgg(save: HabitatSave): boolean {
  if (save.egg) return false;
  save.eggFeeds++;
  if (save.eggFeeds >= FEEDS_PER_EGG) {
    save.eggFeeds = 0;
    save.egg = true;
    return true;
  }
  return false;
}
