import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_ON, SHELVES, allAmbients, mixLevel, skyOf, toggle } from './logic';
import { LOOP_IDS } from './files';

describe('the shelves', () => {
  it('hold every loop once, and every loop has been built', () => {
    const all = allAmbients();
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
    for (const a of all) expect(LOOP_IDS.has(a.id), `${a.id} has no loop`).toBe(true);
  });

  it('fit on one row of switches each', () => {
    for (const s of SHELVES) expect(s.items.length).toBeLessThanOrEqual(7);
  });

  it('are all known to the build script', () => {
    const script = readFileSync('scripts/ambience.mjs', 'utf8');
    for (const a of allAmbients()) {
      const key = a.id.includes('-') ? `'${a.id}'` : a.id;
      // An iFocus file or a Freesound search, either way under its own id.
      expect(script, `${a.id} is not in scripts/ambience.mjs`).toMatch(new RegExp(`${key}: \\{\\s*(file|freesound):`));
    }
  });
});

describe('toggle', () => {
  it('switches on and off', () => {
    expect(toggle([], 'rain').on).toEqual(['rain']);
    expect(toggle(['rain', 'owl'], 'rain').on).toEqual(['owl']);
  });

  it('lets the oldest go when too many are on', () => {
    const on = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, MAX_ON);
    const r = toggle(on, 'z');
    expect(r.on.length).toBe(MAX_ON);
    expect(r.dropped).toEqual([on[0]]);
    expect(r.on.at(-1)).toBe('z');
  });
});

describe('mixLevel', () => {
  it('turns each loop down as more join, but never to nothing', () => {
    const rain = allAmbients().find((a) => a.id === 'rain')!;
    expect(mixLevel(rain, 1)).toBe(1);
    expect(mixLevel(rain, 4)).toBeCloseTo(0.5);
    expect(mixLevel(rain, MAX_ON)).toBeGreaterThan(0.3);
  });
});

describe('skyOf', () => {
  it('goes dark for the night creatures', () => {
    expect(skyOf(['cricket']).night).toBe(1);
    expect(skyOf(['rain']).night).toBe(0);
  });

  it('lets the sea replace every other sky', () => {
    expect(skyOf(['owl', 'thunder', 'underwater'])).toEqual({ night: 0, storm: 0, dawn: 0, deep: 1, space: 0, winter: 0 });
  });

  it('makes space dark with no weather, and snow wintry unless it storms', () => {
    expect(skyOf(['space', 'rain', 'owl'])).toMatchObject({ space: 1, night: 0, storm: 0 });
    expect(skyOf(['snow']).winter).toBe(1);
    expect(skyOf(['snow', 'thunder']).winter).toBe(0);
  });

  it('has no dawn in a storm', () => {
    expect(skyOf(['morning-bird', 'thunder']).dawn).toBe(0);
  });
});
