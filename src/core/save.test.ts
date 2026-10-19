import { describe, expect, it } from 'vitest';
import { readSave as readTank } from '../games/aquarium/logic';
import { readSave as readDrive } from '../games/drive/logic';
import { readSave as readViv } from '../games/terrarium/logic';
import {
  loadVersioned,
  parseVersioned,
  readJson,
  readRaw,
  removeRaw,
  saveVersioned,
  writeJson,
  writeRaw,
  type Backend,
} from './save';

function memory(seed: Record<string, string> = {}): Backend & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const broken: Backend = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new DOMException('full', 'QuotaExceededError');
  },
  removeItem() {
    throw new Error('blocked');
  },
};

describe('safe storage access', () => {
  it('round-trips raw and json values', () => {
    const s = memory();
    expect(writeRaw('a', 'x', s)).toBe(true);
    expect(readRaw('a', s)).toBe('x');
    expect(writeJson('b', { n: 1 }, s)).toBe(true);
    expect(readJson('b', null, s)).toEqual({ n: 1 });
    expect(removeRaw('a', s)).toBe(true);
    expect(readRaw('a', s)).toBeNull();
  });

  it('never throws when storage throws, is full or is missing', () => {
    expect(readRaw('a', broken)).toBeNull();
    expect(writeRaw('a', 'x', broken)).toBe(false);
    expect(removeRaw('a', broken)).toBe(false);
    expect(readJson('a', 7, broken)).toBe(7);
    expect(writeRaw('a', 'x', null)).toBe(false);
    expect(readRaw('a', null)).toBeNull();
  });

  it('gives the fallback for corrupt JSON and false for unserialisable values', () => {
    expect(readJson('a', 'fb', memory({ a: '{oops' }))).toBe('fb');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(writeJson('a', cyclic, memory())).toBe(false);
  });
});

describe('versioned saves', () => {
  const spec = {
    current: 2,
    migrations: {
      0: (o: Record<string, unknown>) => ({ ...o, items: o.things ?? [] }),
      1: (o: Record<string, unknown>) => ({ ...o, extra: true }),
    },
    validate: (d: Record<string, unknown>) =>
      Array.isArray(d.items) ? { items: d.items as string[], extra: d.extra === true, v: d.v } : null,
  };

  it('migrates version 0 (no v) and version 1 up to current', () => {
    expect(parseVersioned(JSON.stringify({ things: ['a'] }), spec)).toEqual({ items: ['a'], extra: true, v: 2 });
    expect(parseVersioned(JSON.stringify({ v: 1, items: ['b'] }), spec)).toEqual({ items: ['b'], extra: true, v: 2 });
    expect(parseVersioned(JSON.stringify({ v: 2, items: ['c'] }), spec)).toEqual({ items: ['c'], extra: false, v: 2 });
  });

  it('refuses newer, malformed and non-object saves', () => {
    expect(parseVersioned(JSON.stringify({ v: 3, items: [] }), spec)).toBeNull();
    expect(parseVersioned(JSON.stringify({ v: 'x', items: [] }), spec)).toBeNull();
    expect(parseVersioned('[1]', spec)).toBeNull();
    expect(parseVersioned('null', spec)).toBeNull();
    expect(parseVersioned('{oops', spec)).toBeNull();
    expect(parseVersioned('', spec)).toBeNull();
    expect(parseVersioned(null, spec)).toBeNull();
  });

  it('saves with the current version and loads it back', () => {
    const s = memory();
    expect(saveVersioned('k', { items: ['z'] }, spec, s)).toBe(true);
    expect(JSON.parse(s.data.k!).v).toBe(2);
    expect(loadVersioned('k', spec, s)?.items).toEqual(['z']);
    expect(loadVersioned('k', spec, broken)).toBeNull();
  });
});

describe('saves written by earlier versions still load', () => {
  it('tank: version 1 and version 0 (no v)', () => {
    const v1 = readTank(JSON.stringify({ v: 1, fish: ['koi'], decor: [0.5], plants: [0.25], night: true }));
    expect(v1).toMatchObject({ v: 1, fish: ['koi'], decor: [0.5], plants: [0.25], night: true });
    const v0 = readTank(JSON.stringify({ fish: ['koi'], decor: [0.5], plants: [] }));
    expect(v0).toMatchObject({ v: 1, fish: ['koi'], decor: [0.5], night: false });
    expect(readTank(JSON.stringify({ v: 99, fish: ['koi'] }))).toBeNull();
    expect(readTank('{oops')).toBeNull();
  });

  it('terrarium: version 1 and version 0 (no v)', () => {
    const v1 = readViv(JSON.stringify({ v: 1, pets: ['gecko'], decor: [], plants: [0.5], night: true }));
    expect(v1).toMatchObject({ v: 1, pets: ['gecko'], plants: [0.5], night: true });
    const v0 = readViv(JSON.stringify({ pets: ['gecko'], decor: [], plants: [] }));
    expect(v0?.pets).toEqual(['gecko']);
    expect(readViv(JSON.stringify({ v: 99, pets: ['gecko'] }))).toBeNull();
  });

  it('drive: version 1 and version 0 (no v)', () => {
    expect(readDrive(JSON.stringify({ v: 1, vehicle: 'tractor', night: true }))).toEqual({ v: 1, vehicle: 'tractor', night: true });
    expect(readDrive(JSON.stringify({ vehicle: 'tractor' }))).toEqual({ v: 1, vehicle: 'tractor', night: false });
    expect(readDrive(JSON.stringify({ v: 1, vehicle: 'nope' }))).toBeNull();
  });
});
