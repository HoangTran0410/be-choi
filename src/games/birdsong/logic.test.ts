import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { BIRD_X, CATCH_R, CEILING, GROUND, makeWorld, NOTES_PER_ROUND, roundDone, spawnY, step } from './logic';

/** Run `seconds` of frames at 60 fps with a steady voice. */
function fly(w: ReturnType<typeof makeWorld>, level: number, seconds: number, rng = mulberry32(7)): void {
  for (let t = 0; t < seconds * 60; t++) step(w, level, 1 / 60, rng);
}

describe('flying', () => {
  it('climbs while the child sings', () => {
    const w = makeWorld(mulberry32(1));
    const before = w.y;
    fly(w, 1, 1);
    expect(w.y).toBeLessThan(before);
  });

  it('glides down in silence', () => {
    const w = makeWorld(mulberry32(1));
    const before = w.y;
    fly(w, 0, 1);
    expect(w.y).toBeGreaterThan(before);
  });

  it('stays on screen, and the grass bounces it back instead of ending the game', () => {
    const w = makeWorld(mulberry32(2));
    fly(w, 0, 12);
    // It keeps bouncing along the grass instead of falling through it.
    expect(w.y).toBeLessThanOrEqual(GROUND);
    expect(w.y).toBeGreaterThan(GROUND - 0.2);
    fly(w, 1, 12);
    expect(w.y).toBeGreaterThanOrEqual(CEILING);
  });

  it('reports the bump only when it lands with some speed', () => {
    const w = makeWorld(mulberry32(3));
    let bumps = 0;
    for (let i = 0; i < 600; i++) if (step(w, 0, 1 / 60, mulberry32(3)).bumped) bumps++;
    expect(bumps).toBeGreaterThan(0);
  });

  it('moves the world along', () => {
    const w = makeWorld(mulberry32(4));
    fly(w, 0.5, 2);
    expect(w.distance).toBeGreaterThan(0.5);
  });
});

describe('things to fly through', () => {
  it('always has some ahead of the bird', () => {
    const w = makeWorld(mulberry32(5));
    expect(w.items.length).toBeGreaterThan(0);
    fly(w, 0.5, 5);
    expect(w.items.some((i) => i.x > w.distance + BIRD_X)).toBe(true);
  });

  it('appears within reach of the bird and on screen', () => {
    const rng = mulberry32(6);
    for (let i = 0; i < 50; i++) {
      const bird = 0.1 + rng() * 0.7;
      const y = spawnY(bird, rng);
      expect(y).toBeGreaterThanOrEqual(CEILING);
      expect(y).toBeLessThanOrEqual(GROUND);
      expect(Math.abs(y - bird)).toBeLessThanOrEqual(0.35);
    }
  });

  it('is caught when the bird flies into it, and only notes count', () => {
    const w = makeWorld(mulberry32(7));
    w.items = [
      { id: 100, x: w.distance + BIRD_X, y: w.y, kind: 'note' },
      { id: 101, x: w.distance + BIRD_X, y: w.y, kind: 'ring' },
    ];
    const out = step(w, 0.5, 1 / 60, mulberry32(7));
    expect(out.caught.map((i) => i.id)).toEqual([100, 101]);
    expect(w.caught).toBe(1);
  });

  it('is missed when it passes too far above', () => {
    const w = makeWorld(mulberry32(8));
    w.items = [{ id: 200, x: w.distance + BIRD_X, y: w.y - CATCH_R * 2, kind: 'note' }];
    expect(step(w, 0.5, 1 / 60, mulberry32(8)).caught).toEqual([]);
    expect(w.caught).toBe(0);
  });

  it('drops things once they are behind the bird', () => {
    const w = makeWorld(mulberry32(9));
    const first = w.items[0];
    fly(w, 0.5, 6);
    expect(w.items.find((i) => i.id === first?.id)).toBeUndefined();
  });
});

describe('a round', () => {
  it('is done after eight notes', () => {
    const w = makeWorld(mulberry32(10));
    expect(roundDone(w)).toBe(false);
    w.caught = NOTES_PER_ROUND;
    expect(roundDone(w)).toBe(true);
  });
});
