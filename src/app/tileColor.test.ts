import { describe, expect, it } from 'vitest';
import { tilePaint, tileStyle } from './tileColor';

describe('tilePaint', () => {
  it('keeps the hue of a pastel and deepens it', () => {
    const p = tilePaint('#bae6fd'); // sky blue
    expect(p.top).toMatch(/^hsl\(20\d 78% 66%\)$/);
    expect(p.edge).toMatch(/ 40%\)$/);
  });

  it('pulls yellows towards amber and darker, for white words', () => {
    const p = tilePaint('#fde68a');
    expect(p.top).toBe('hsl(40 92% 58%)');
  });

  it('falls back to a soft blue for a bad colour', () => {
    expect(tilePaint('nope').top).toContain('hsl(210');
  });

  it('writes CSS variables', () => {
    expect(tileStyle('#fde68a')).toContain('--tile-top:hsl(40');
  });
});
