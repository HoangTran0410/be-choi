import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SFX_TAKES } from './sfx';
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
  it('lists every timbre, drum and effect', () => {
    expect(TIMBRES.length).toBe(9);
    expect(DRUMS.length).toBe(11);
    expect(FX.length).toBe(33);
  });
});

describe('recorded voices load lazily', () => {
  let played = 0;
  const urls: string[] = [];

  function fakeContext() {
    const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect: (n: unknown) => n, gain: param(), frequency: param(), Q: param(), detune: param() });
    return class {
      state = 'running';
      currentTime = 0;
      sampleRate = 44100;
      destination = {};
      createGain = node;
      createBiquadFilter = node;
      createDynamicsCompressor = node;
      createWaveShaper = node;
      createOscillator = () => ({ ...node(), type: '', start() {}, stop() {} });
      createBuffer = () => ({ getChannelData: () => new Float32Array(1) });
      createBufferSource = () => ({
        ...node(),
        buffer: null,
        start: () => {
          played += 1;
        },
      });
      resume = () => Promise.resolve();
      decodeAudioData = () => Promise.resolve({ duration: 1 } as AudioBuffer);
    };
  }

  beforeEach(() => {
    played = 0;
    urls.length = 0;
    vi.stubGlobal('AudioContext', fakeContext());
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url);
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches nothing at startup', async () => {
    const a = createAudio();
    a.unlock();
    a.pop();
    await a.ready();
    expect(urls).toEqual([]);
  });

  it('first tap plays the synth and fetches only that voice; the next tap plays the recording', async () => {
    const a = createAudio();
    a.unlock();
    a.fx('meow');
    expect(urls.length).toBe(SFX_TAKES.meow);
    expect(urls.every((u) => u.includes('sfx/meow-'))).toBe(true);
    expect(played).toBe(0); // the synth uses oscillators, not a decoded buffer
    await a.ready();
    a.fx('meow');
    expect(played).toBe(1);
    a.fx('meow');
    expect(urls.length).toBe(SFX_TAKES.meow); // never fetched twice
  });

  it('preloadFx loads each named voice once', async () => {
    const a = createAudio();
    a.unlock();
    a.preloadFx(['moo', 'pig', 'moo']);
    await a.ready();
    expect(urls.length).toBe((SFX_TAKES.moo ?? 0) + (SFX_TAKES.pig ?? 0));
  });

  it('a failed fetch keeps the synth voice and does not throw', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const a = createAudio();
    a.unlock();
    a.fx('bark');
    await a.ready();
    expect(() => a.fx('bark')).not.toThrow();
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

describe('scheduling ahead with delay', () => {
  const starts: number[] = [];
  function clockContext() {
    const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect: (n: unknown) => n, gain: param(), frequency: param(), Q: param(), detune: param() });
    return class {
      state = 'running';
      currentTime = 10;
      sampleRate = 8000;
      destination = {};
      createGain = node;
      createBiquadFilter = node;
      createDynamicsCompressor = node;
      createWaveShaper = node;
      createOscillator = () => ({ ...node(), type: '', start: (t: number) => starts.push(t), stop() {} });
      createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
      createBufferSource = () => ({ ...node(), buffer: null, start: (t: number) => starts.push(t) });
      resume = () => Promise.resolve();
    };
  }
  beforeEach(() => {
    starts.length = 0;
    vi.stubGlobal('AudioContext', clockContext());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('note and drum start `delay` seconds from now, and without it start now (backwards compatible)', () => {
    const a = createAudio();
    a.unlock();
    a.note(440, 0.2, 'piano');
    expect(starts.length).toBeGreaterThan(0);
    expect(Math.max(...starts)).toBe(10);
    starts.length = 0;
    a.note(440, 0.2, 'piano', 0.5);
    expect(starts.length).toBeGreaterThan(0);
    expect(Math.min(...starts)).toBe(10.5);
    starts.length = 0;
    a.note(220, 0.2, 'guitar', 0.25);
    expect(starts).toEqual([10.25]);
    starts.length = 0;
    a.drum('snare', 0.1);
    expect(Math.min(...starts)).toBeCloseTo(10.1, 6);
    starts.length = 0;
    a.drum('hat');
    expect(Math.max(...starts)).toBe(10);
  });

  it('a delay does not leak into the next call, and bad delays count as 0', () => {
    const a = createAudio();
    a.unlock();
    a.note(440, 0.2, 'piano', 1);
    starts.length = 0;
    a.note(440, 0.2, 'piano');
    expect(Math.max(...starts)).toBe(10);
    starts.length = 0;
    a.note(440, 0.2, 'piano', -3);
    a.note(440, 0.2, 'piano', Number.NaN);
    expect(Math.max(...starts)).toBe(10);
  });
});
