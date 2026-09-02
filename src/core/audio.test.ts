import { describe, it, expect } from 'vitest';
import { createAudio, DRUMS, TIMBRES } from './audio';

describe('audio', () => {
  it('never throws without AudioContext', () => {
    const a = createAudio();
    a.unlock();
    a.pop();
    a.pop(2);
    a.ding();
    a.boing();
    a.chomp();
    a.tick();
    a.jingle();
    a.note(440);
    for (const t of TIMBRES) a.note(440, 0.5, t);
    for (const d of DRUMS) a.drum(d);
    a.puff();
    expect(a.enabled).toBe(true);
    a.setEnabled(false);
    expect(a.enabled).toBe(false);
    a.note(440, 0.3, 'guitar');
  });
  it('lists 8 timbres and 6 drums', () => {
    expect(TIMBRES.length).toBe(9);
    expect(DRUMS.length).toBe(6);
  });
});
