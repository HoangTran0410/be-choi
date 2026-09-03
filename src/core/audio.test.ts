import { describe, it, expect } from 'vitest';
import { createAudio, DRUMS, FX, TIMBRES, type SoundId } from './audio';
import { LOUDNESS } from './loudness';

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
    for (const f of FX) a.fx(f);
    a.puff();
    expect(a.enabled).toBe(true);
    a.setEnabled(false);
    expect(a.enabled).toBe(false);
    a.note(440, 0.3, 'guitar');
  });
  it('lists 8 timbres and 6 drums', () => {
    expect(TIMBRES.length).toBe(9);
    expect(DRUMS.length).toBe(11);
    expect(FX.length).toBe(22);
  });
});

describe('the loudness table', () => {
  const ids: SoundId[] = [
    'pop',
    'ding',
    'boing',
    'chomp',
    'tick',
    'jingle',
    'puff',
    ...TIMBRES.map((t): SoundId => `note:${t}`),
    ...DRUMS.map((d): SoundId => `drum:${d}`),
    ...FX.map((f): SoundId => `fx:${f}`),
    // The recorded animal voices are levelled as one group.
    'sample',
  ];

  it('gives every sound a level, and has no entries for sounds that no longer exist', () => {
    for (const id of ids) expect(LOUDNESS[id], `no level for ${id}`).toBeTypeOf('number');
    expect(Object.keys(LOUDNESS).sort()).toEqual([...ids].sort());
  });

  it('keeps every trim in a range a sound can actually take', () => {
    // Outside this a sound is not being levelled, it is being rescued: fix the
    // sound itself and re-run `node scripts/loudness.mjs`.
    for (const [id, trim] of Object.entries(LOUDNESS)) {
      expect(trim, `${id} trim`).toBeGreaterThan(0.1);
      expect(trim, `${id} trim`).toBeLessThanOrEqual(12);
    }
  });
});
