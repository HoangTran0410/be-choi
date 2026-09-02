import { describe, it, expect } from 'vitest';
import { parseHash, hrefFor } from './router';

describe('router', () => {
  it('parses', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/g/shapes')).toEqual({ name: 'game', id: 'shapes' });
    expect(parseHash('#/g/shapes/')).toEqual({ name: 'game', id: 'shapes' });
    expect(parseHash('#/nope')).toEqual({ name: 'home' });
    expect(parseHash('#/g/')).toEqual({ name: 'home' });
  });
  it('builds hrefs', () => {
    expect(hrefFor({ name: 'home' })).toBe('#/');
    expect(hrefFor({ name: 'game', id: 'a' })).toBe('#/g/a');
  });
});
