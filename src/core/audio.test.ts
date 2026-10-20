import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SFX_TAKES } from './sfx';
import { createAudio, DRUMS, FX, INSTRUMENTS, TIMBRES, type SoundId } from './audio';
import { LOUDNESS } from './loudness';
import { VOICE_HZ, pitchRate } from './voicepitch';

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
    for (const i of INSTRUMENTS) expect(a.inst(i, 440, 0.7)).toBeNull();
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
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
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
    ...INSTRUMENTS.map((i): SoundId => `inst:${i}`),
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
      createBufferSource = () => ({ ...node(), buffer: null, playbackRate: { value: 1 }, start: (t: number) => starts.push(t), stop() {} });
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

  it('a world instrument starts `delay` seconds from now, and a damped one is stopped when its length is up', () => {
    const a = createAudio();
    a.unlock();
    a.inst('marimba', 440, 0.8);
    expect(starts).toEqual([10]);
    starts.length = 0;
    a.inst('marimba', 440, 0.8, 0.6, 0.25, true, 0.5);
    expect(starts).toEqual([10.25]);
    starts.length = 0;
    a.inst('kalimba', 330, 0.8, undefined, Number.NaN);
    expect(starts).toEqual([10]);
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

describe('pitched voices', () => {
  const rates: number[] = [];
  const oscillators: number[] = [];
  const stops: number[] = [];

  function fakeContext() {
    const param = (v = 1) => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
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
      createOscillator = () => {
        oscillators.push(1);
        return { ...node(), type: '', start() {}, stop() {} };
      };
      createBuffer = () => ({ getChannelData: () => new Float32Array(1) });
      createBufferSource = () => {
        const playbackRate = param();
        return {
          ...node(),
          buffer: null,
          playbackRate,
          start: () => {
            rates.push(playbackRate.value);
          },
          stop: (t: number) => {
            stops.push(t);
          },
        };
      };
      resume = () => Promise.resolve();
      decodeAudioData = () => Promise.resolve({ duration: 1.8 } as AudioBuffer);
    };
  }

  beforeEach(() => {
    rates.length = 0;
    oscillators.length = 0;
    stops.length = 0;
    vi.stubGlobal('AudioContext', fakeContext());
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sings a synthesized meow at once, before the recording has loaded', () => {
    const a = createAudio();
    a.unlock();
    a.pitched('meow', 700);
    expect(rates).toEqual([]);
    expect(oscillators.length).toBeGreaterThan(0);
  });

  it('retunes a loaded take by playing it faster or slower: an octave up is twice as fast', async () => {
    const a = createAudio();
    a.unlock();
    a.pitched('meow', 700);
    await a.ready();
    const hz = VOICE_HZ.meow ?? [];
    expect(hz.length).toBe(SFX_TAKES.meow);
    for (let i = 0; i < 30; i++) a.pitched('meow', 500);
    for (let i = 0; i < 30; i++) a.pitched('meow', 1000);
    const low = rates.slice(0, 30);
    const high = rates.slice(30);
    expect(low.length).toBe(30);
    // Each take lands on its own measured pitch: rate × take pitch = the pitch asked for.
    for (const r of low) expect(hz.some((base) => Math.abs(r * base - 500) < 0.01)).toBe(true);
    for (const r of high) expect(hz.some((base) => Math.abs(r * base - 1000) < 0.01)).toBe(true);
    expect(Math.min(...high)).toBeGreaterThan(Math.max(...low) * 0.99);
  });

  it('cuts a stretched low voice short, and does nothing for silly input', async () => {
    const a = createAudio();
    a.unlock();
    a.pitched('meow', 700);
    await a.ready();
    rates.length = 0;
    stops.length = 0;
    a.pitched('meow', 200, { maxDur: 0.8 });
    expect(rates.length).toBe(1);
    expect(stops[0]).toBeLessThan(0.9);
    a.pitched('meow', 0);
    a.pitched('meow', Number.NaN);
    expect(rates.length).toBe(1);
  });

  it('is silent when sound is off and never throws without AudioContext', () => {
    const a = createAudio();
    expect(() => a.pitched('meow', 600)).not.toThrow();
    a.unlock();
    a.setEnabled(false);
    a.pitched('meow', 600);
    expect(rates).toEqual([]);
    expect(oscillators).toEqual([]);
  });

  it('a voice with no measured pitch plays untuned instead of guessing', async () => {
    const a = createAudio();
    a.unlock();
    a.fx('bark');
    await a.ready();
    rates.length = 0;
    expect(() => a.pitched('bark', 300)).not.toThrow();
    expect(rates).toEqual([1]);
  });

  it('knows the pitch rate of every take', () => {
    expect(pitchRate('meow', 0, VOICE_HZ.meow![0]! * 2)).toBeCloseTo(2, 5);
    expect(pitchRate('bark', 0, 300)).toBe(1);
    expect(pitchRate('meow', 99, 300)).toBe(1);
  });
});
