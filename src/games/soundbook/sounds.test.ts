import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { PAGES } from './logic';
import { SOUND_IDS, SOUND_TAKES, soundUrl } from './sounds';

describe('the recordings behind Bấm nghe tiếng', () => {
  it('has every take it names, and no stray files', () => {
    for (const [id, n] of Object.entries(SOUND_TAKES)) {
      for (let i = 0; i < n; i++) expect(existsSync(`public/${soundUrl(id, i)}`), `${id}-${i}`).toBe(true);
    }
    const files = readdirSync('public/sounds').filter((f) => f.endsWith('.m4a'));
    const named = Object.entries(SOUND_TAKES).reduce((a, [, n]) => a + n, 0);
    expect(files.length).toBe(named);
  });

  // Freesound holds too few clean CC0 recordings of these to make four different ones.
  const SCARCE = ['bear', 'motorbike', 'balloon', 'scissors', 'keys'];

  it('gives every animal, vehicle and thing several different recordings', () => {
    for (const page of PAGES.filter((p) => ['farm', 'wild', 'vehicles'].includes(p.id))) {
      for (const t of page.things) {
        if (!SOUND_IDS.has(t.id)) continue;
        expect(SOUND_TAKES[t.id], `${t.id} takes`).toBeGreaterThanOrEqual(SCARCE.includes(t.id) ? 1 : 3);
      }
    }
  });

  it('keeps each recording short enough to precache', () => {
    for (const [id, n] of Object.entries(SOUND_TAKES)) {
      for (let i = 0; i < n; i++) expect(statSync(`public/${soundUrl(id, i)}`).size, `${id}-${i}`).toBeLessThan(40_000);
    }
  });

  it('keeps public/sfx and public/sounds inside the 4 MB budget', () => {
    const size = (dir: string) => readdirSync(dir).reduce((a, f) => a + statSync(`${dir}/${f}`).size, 0);
    expect(size('public/sfx') + size('public/sounds')).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});
