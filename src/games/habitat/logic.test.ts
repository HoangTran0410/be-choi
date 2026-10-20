import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SPECIES as TANK } from '../aquarium/species';
import { SPECIES as BOX } from '../terrarium/species';
import { BOOK, CATALOG, STARTERS, STARTER_TANK, inRealm, kindByKey } from './catalog';
import { DECOR_BY_REALM, DECOR_REWARDS, DECOR_START } from './decor';
import {
  FEEDS_PER_EGG,
  QUESTS,
  claim,
  complete,
  feedEgg,
  hatchKey,
  possible,
  progress,
  questById,
  refill,
} from './quests';
import {
  BRIDGE_KEY,
  LEGACY_BOX_KEY,
  LEGACY_TANK_KEY,
  SAVE_KEY,
  WORLD_KEY,
  collect,
  defaultSave,
  importLegacy,
  legacyOwned,
  load,
  readHabitat,
  store,
} from './save';
import { WORLDS, isWorldId, worldById, worldsFor } from './worlds';

describe('catalog', () => {
  it('lists every fish and every box animal exactly once, with a home', () => {
    expect(CATALOG.length).toBe(TANK.length + BOX.length);
    expect(new Set(CATALOG.map((k) => k.key)).size).toBe(CATALOG.length);
    expect(BOOK.length).toBe(CATALOG.length);
    for (const k of CATALOG) expect(k.name.length).toBeGreaterThan(0);
  });
  it('puts fish in the water they live in, and the box animals in the forest', () => {
    expect(kindByKey('aq:goldfish')?.realm).toBe('fresh');
    expect(kindByKey('aq:clown')?.realm).toBe('sea');
    expect(kindByKey('tr:snail')?.realm).toBe('forest');
    expect(inRealm('forest').every((k) => k.family === 'tr')).toBe(true);
    expect(inRealm('fresh').length).toBeGreaterThan(2);
    expect(inRealm('sea').length).toBeGreaterThan(2);
  });
  it('starts the child with friends that live in the first tank', () => {
    for (const key of STARTERS) expect(kindByKey(key)?.realm).toBe('fresh');
    for (const id of STARTER_TANK.fresh) expect(kindByKey(`aq:${id}`)?.realm).toBe('fresh');
    for (const id of STARTER_TANK.sea) expect(kindByKey(`aq:${id}`)?.realm).toBe('sea');
  });
  it('never offers a jellyfish or a shark to the fishing line', () => {
    expect(kindByKey('aq:jelly')?.fishable).toBe(false);
    expect(kindByKey('aq:shark')?.fishable).toBe(false);
    expect(kindByKey('aq:koi')?.fishable).toBe(true);
  });
});

describe('worlds', () => {
  it('opens by stars, and an older save can open one early', () => {
    expect(worldsFor(0)).toEqual(['fresh', 'pond']);
    expect(worldsFor(2)).toContain('sea');
    expect(worldsFor(0)).not.toContain('forest');
    expect(worldsFor(0, ['forest'])).toContain('forest');
    expect(worldsFor(4)).toEqual(['fresh', 'pond', 'sea', 'forest']);
  });
  it('knows its ids', () => {
    expect(isWorldId('sea')).toBe(true);
    expect(isWorldId('moon')).toBe(false);
    expect(worldById('pond')?.engine).toBe('pond');
    expect(WORLDS.length).toBe(4);
  });
  it('has furniture for every home that can hold some, all of it either open or a reward', () => {
    const known = new Set([...DECOR_START, ...DECOR_REWARDS]);
    for (const list of Object.values(DECOR_BY_REALM)) for (const id of list) expect(known.has(id)).toBe(true);
    expect(DECOR_BY_REALM.forest).toEqual([]);
  });
});

describe('save', () => {
  it('reads back what it wrote and ignores nonsense', () => {
    const s = defaultSave();
    collect(s, 'aq:koi');
    s.stars = 3;
    s.photos.fresh.frames.push({ photo: 'p1', x: 0.3, y: 0.2 });
    s.extras.sea.decor.push({ k: 'castle', x: 0.4 });
    const back = readHabitat(JSON.stringify(s));
    expect(back?.owned).toContain('aq:koi');
    expect(back?.stars).toBe(3);
    expect(back?.photos.fresh.frames).toEqual([{ photo: 'p1', x: 0.3, y: 0.2 }]);
    expect(back?.extras.sea.decor).toEqual([{ k: 'castle', x: 0.4 }]);
    expect(back?.worlds).toContain('sea');
    expect(readHabitat('not json')).toBeNull();
    expect(readHabitat('[]')).toBeNull();
    expect(readHabitat(JSON.stringify({ v: 99 }))).toBeNull();
  });
  it('drops unknown animals, bad numbers and too many photos', () => {
    const back = readHabitat(
      JSON.stringify({
        v: 1,
        owned: ['aq:koi', 'aq:koi', 'nope:thing', 7],
        stars: -5,
        world: 'forest',
        photos: { fresh: { frames: [1, 2, 3, 4, 5].map((n) => ({ photo: `p${n}`, x: 9, y: -9 })), visitors: ['a', 'b', 'c', 'd'] } },
        extras: { fresh: { plants: [0.1, 2, 'x'], decor: [{ k: 'castle', x: 0.5 }, { k: 'plant', x: 0.5 }, { k: 'zzz' }] } },
      }),
    );
    expect(back?.owned).toEqual(['aq:koi']);
    expect(back?.stars).toBe(0);
    // A world that is not open is not where the child is put.
    expect(back?.world).toBe('fresh');
    expect(back?.photos.fresh.frames.length).toBe(3);
    expect(back?.photos.fresh.frames[0]).toMatchObject({ x: 0.92, y: 0.1 });
    expect(back?.photos.fresh.visitors.length).toBe(3);
    expect(back?.extras.fresh.plants).toEqual([0.1, 1]);
    expect(back?.extras.fresh.decor).toEqual([{ k: 'castle', x: 0.5 }]);
  });
  it('collects an animal once', () => {
    const s = defaultSave();
    expect(collect(s, 'aq:koi')).toBe(true);
    expect(collect(s, 'aq:koi')).toBe(false);
    expect(collect(s, 'aq:unicorn')).toBe(false);
  });
});

describe('older games', () => {
  const tank = JSON.stringify({ v: 1, fish: ['koi', 'clown', 'koi', 'ghost'], decor: [0.2], plants: [0.3], night: true });
  const box = JSON.stringify({ v: 1, pets: ['gecko', 'frog'], decor: [], plants: [] });

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('lists who lives in the old tank and box', () => {
    expect(legacyOwned(tank, box).sort()).toEqual(['aq:clown', 'aq:koi', 'tr:frog', 'tr:gecko']);
    expect(legacyOwned(null, 'garbage')).toEqual([]);
  });

  it('copies the old saves into the new homes and never touches the old keys', () => {
    localStorage.setItem(LEGACY_TANK_KEY, tank);
    localStorage.setItem(LEGACY_BOX_KEY, box);
    const s = defaultSave();
    expect(importLegacy(s)).toBe(true);
    expect(localStorage.getItem(WORLD_KEY.fresh)).toBe(tank);
    expect(localStorage.getItem(WORLD_KEY.forest)).toBe(box);
    expect(localStorage.getItem(LEGACY_TANK_KEY)).toBe(tank);
    expect(localStorage.getItem(LEGACY_BOX_KEY)).toBe(box);
    expect(s.owned).toEqual(expect.arrayContaining(['aq:koi', 'aq:clown', 'tr:gecko', 'tr:frog']));
    // A child who already had a box does not have to earn the forest.
    expect(s.worlds).toContain('forest');
    expect(s.imported).toBe(true);
  });

  it('does not overwrite a home the child has since kept, but still counts newcomers', () => {
    localStorage.setItem(WORLD_KEY.fresh, JSON.stringify({ v: 1, fish: ['goldfish'], decor: [], plants: [] }));
    localStorage.setItem(LEGACY_TANK_KEY, tank);
    const s = defaultSave();
    importLegacy(s);
    expect(JSON.parse(localStorage.getItem(WORLD_KEY.fresh)!).fish).toEqual(['goldfish']);
    expect(s.owned).toContain('aq:koi');
  });

  it('ignores an unusable old save and does nothing when there is none', () => {
    localStorage.setItem(LEGACY_TANK_KEY, '{"hello":1}');
    const s = defaultSave();
    importLegacy(s);
    expect(localStorage.getItem(WORLD_KEY.fresh)).toBeNull();
    expect(s.worlds).not.toContain('forest');
  });

  it('keeps the book under its own key and loads it back', () => {
    const s = defaultSave();
    collect(s, 'aq:angel');
    store(s);
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
    expect(load().owned).toContain('aq:angel');
    localStorage.setItem(SAVE_KEY, 'broken');
    expect(load().owned).toEqual([...STARTERS]);
    expect(BRIDGE_KEY).not.toBe(LEGACY_TANK_KEY);
  });
});

describe('quests', () => {
  const ctx = { hasPhotos: false };
  const withPhotos = { hasPhotos: true };

  it('has unique ids and something to do for each kind', () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expect(q.n).toBeGreaterThan(0);
      expect(q.say.length).toBeGreaterThan(0);
    }
  });

  it('keeps three open at a time, of different kinds, and skips what cannot be done yet', () => {
    const s = defaultSave();
    refill(s, ctx);
    expect(s.quests.active.length).toBe(3);
    const kinds = s.quests.active.map((a) => questById(a.id)!.kind);
    expect(new Set(kinds).size).toBe(3);
    for (const a of s.quests.active) expect(possible(questById(a.id)!, s, ctx)).toBe(true);
    // Without photos or the sea, none of those errands are handed out.
    const all = new Set<string>();
    for (let i = 0; i < 30; i++) {
      for (const a of [...s.quests.active]) complete(s, a.id, ctx, () => 0);
      s.quests.active.forEach((a) => all.add(a.id));
    }
    expect(all.has('frame1')).toBe(false);
    expect(all.has('visitors1')).toBe(false);
  });

  it('hands out photo errands once there are photos', () => {
    const s = defaultSave();
    refill(s, withPhotos);
    let seen = false;
    for (let i = 0; i < 20 && !seen; i++) {
      seen = s.quests.active.some((a) => questById(a.id)?.photos === true);
      for (const a of [...s.quests.active]) complete(s, a.id, withPhotos, () => 0);
    }
    expect(seen).toBe(true);
  });

  it('counts progress and reports the errand that just finished, once', () => {
    const s = defaultSave();
    s.quests.active = [{ id: 'feed3', got: 0 }];
    expect(progress(s, { kind: 'feed' })).toEqual([]);
    expect(progress(s, { kind: 'hello' })).toEqual([]);
    expect(progress(s, { kind: 'feed' })).toEqual([]);
    expect(s.quests.active[0]!.got).toBe(2);
    expect(progress(s, { kind: 'feed' }).map((q) => q.id)).toEqual(['feed3']);
    // Already full: more feeding is not a second finish.
    expect(progress(s, { kind: 'feed' })).toEqual([]);
    expect(s.quests.active[0]!.got).toBe(3);
  });

  it('a visit counts only for the world it asks for', () => {
    const s = defaultSave();
    s.worlds.push('sea');
    s.quests.active = [{ id: 'visit-sea', got: 0 }];
    expect(progress(s, { kind: 'visit', world: 'forest' })).toEqual([]);
    expect(progress(s, { kind: 'visit', world: 'sea' }).length).toBe(1);
  });

  it('a finished errand gives a star, a gift, and a new errand', () => {
    const s = defaultSave();
    refill(s, ctx);
    const first = s.quests.active[0]!.id;
    const rewards = complete(s, first, ctx, () => 0);
    expect(s.stars).toBe(1);
    expect(s.quests.done).toBe(1);
    expect(rewards.length).toBe(1);
    expect(s.quests.active.length).toBe(3);
    expect(s.quests.active.some((a) => a.id === first)).toBe(false);
  });

  it('opens the sea at two stars and the forest at four, with a gift inside', () => {
    const s = defaultSave();
    claim(s);
    const second = claim(s);
    expect(second[0]).toMatchObject({ type: 'world', id: 'sea' });
    expect(s.worlds).toContain('sea');
    expect(s.owned).toContain('aq:clown');
    claim(s);
    const fourth = claim(s);
    expect(fourth[0]).toMatchObject({ type: 'world', id: 'forest' });
    expect(s.owned).toContain('tr:snail');
  });

  it('only gives friends from worlds that are open, and opens furniture in turn', () => {
    const s = defaultSave();
    const got: string[] = [];
    for (let i = 0; i < 12; i++) {
      for (const r of claim(s, () => 0)) {
        if (r.type === 'species') got.push(r.key);
      }
    }
    for (const key of s.owned) expect(s.worlds).toContain(kindByKey(key)!.realm);
    expect(DECOR_REWARDS.every((d) => s.decor.includes(d))).toBe(true);
    expect(new Set(got).size).toBe(got.length);
  });

  it('keeps giving stars when there is nothing left to open', () => {
    const s = defaultSave();
    for (const k of CATALOG) collect(s, k.key);
    for (let i = 0; i < 20; i++) claim(s);
    const last = claim(s);
    expect(last[0]).toEqual({ type: 'star' });
    expect(s.stars).toBe(21);
  });

  it('an egg appears after a few helpings and hatches something new from that home', () => {
    const s = defaultSave();
    let appeared = 0;
    for (let i = 0; i < FEEDS_PER_EGG - 1; i++) appeared += feedEgg(s) ? 1 : 0;
    expect(appeared).toBe(0);
    expect(feedEgg(s)).toBe(true);
    expect(s.egg).toBe(true);
    // While one waits, feeding does not pile up another.
    expect(feedEgg(s)).toBe(false);
    expect(s.eggFeeds).toBe(0);
    const key = hatchKey(s, 'fresh', () => 0);
    expect(kindByKey(key)?.realm).toBe('fresh');
    expect(s.owned).not.toContain(key);
    for (const k of inRealm('fresh')) collect(s, k.key);
    const another = hatchKey(s, 'fresh', () => 0);
    // Home is full: a friend from somewhere else that is open, else a repeat.
    expect(kindByKey(another)).toBeDefined();
  });
});
