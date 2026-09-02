import { describe, it, expect } from 'vitest';
import { fakeContext } from '../../core/testing';
import game from './index';

describe('shapes game', () => {
  it('mounts holes and pieces, cleans up', () => {
    const ctx = fakeContext();
    game.start(ctx);
    expect(ctx.stage.querySelectorAll('.hole').length).toBe(3);
    expect(ctx.stage.querySelectorAll('.piece').length).toBe(3);
    ctx.cleanup();
    expect(document.body.contains(ctx.stage)).toBe(false);
  });
});
