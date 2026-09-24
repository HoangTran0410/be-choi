import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAGES, allThings, pageDone, scatter } from './logic';
import { SOUND_IDS } from './sounds';

describe('the sound book', () => {
  it('has a page per kind of thing, each with plenty to press', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(5);
    for (const page of PAGES) expect(page.things.length).toBeGreaterThanOrEqual(6);
  });

  it('never uses one recording or one picture twice', () => {
    const things = allThings();
    expect(new Set(things.map((t) => t.id)).size).toBe(things.length);
    expect(new Set(things.map((t) => t.emoji)).size).toBe(things.length);
  });

  it('has a recording for everything in it, and the script knows how to find each one', () => {
    const script = readFileSync('scripts/soundbook.mjs', 'utf8');
    for (const t of allThings()) {
      expect(SOUND_IDS.has(t.id), `${t.id} has no recording`).toBe(true);
      expect(script, `${t.id} is not in scripts/soundbook.mjs`).toMatch(new RegExp(`\\n\\s+${t.id}: \\{`));
    }
  });
});

describe('scatter', () => {
  it('nudges each slot a little, the same way every time', () => {
    for (let i = 0; i < 12; i++) {
      const s = scatter(i);
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(8);
      expect(Math.abs(s.dy)).toBeLessThanOrEqual(10);
      expect(Math.abs(s.tilt)).toBeLessThanOrEqual(5);
      expect(scatter(i)).toEqual(s);
    }
  });
});

describe('pageDone', () => {
  it('waits until every thing on the page has been heard', () => {
    const page = PAGES[0]!;
    const heard = new Set(page.things.slice(1).map((t) => t.id));
    expect(pageDone(page, heard)).toBe(false);
    heard.add(page.things[0]!.id);
    expect(pageDone(page, heard)).toBe(true);
  });
});
