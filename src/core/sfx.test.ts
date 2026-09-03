import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { FX } from './audio';
import { SFX_TAKES, sfxUrl } from './sfx';

describe('the recorded animal voices', () => {
  const kinds = Object.keys(SFX_TAKES);

  it('only names voices the engine actually has', () => {
    for (const kind of kinds) expect(FX).toContain(kind);
  });

  it('gives every recorded animal more than one take where it can', () => {
    expect(kinds.length).toBeGreaterThan(0);
    for (const [kind, takes] of Object.entries(SFX_TAKES)) {
      expect(takes, `${kind} takes`).toBeGreaterThan(0);
    }
  });

  it('points at a file that exists, and is small enough to precache', () => {
    for (const [kind, takes] of Object.entries(SFX_TAKES)) {
      for (let i = 0; i < (takes ?? 0); i++) {
        const path = `public/${sfxUrl(kind as (typeof FX)[number], i)}`;
        expect(existsSync(path), `missing ${path}`).toBe(true);
        // A one-shot animal call. Much bigger than this and something went wrong
        // with the cut: the app is meant to stay installable over a phone connection.
        expect(statSync(path).size, path).toBeLessThan(40_000);
        expect(statSync(path).size, path).toBeGreaterThan(1_000);
      }
    }
  });

  it('builds the url the service worker precaches', () => {
    expect(sfxUrl('meow', 0)).toBe('sfx/meow-0.m4a');
    expect(sfxUrl('cricket', 2)).toBe('sfx/cricket-2.m4a');
  });
});
