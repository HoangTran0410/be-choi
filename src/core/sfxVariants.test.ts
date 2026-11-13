import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAudio } from './audio';
import { SFX_TAKES } from './sfx';

/** Which recorded take each tap actually played, as the engine sees it. */
describe('recorded voices never repeat a take back to back', () => {
  const played: unknown[] = [];

  function fakeContext() {
    const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect: (n: unknown) => n, gain: param(), frequency: param(), Q: param(), detune: param() });
    let n = 0;
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
      createBuffer = (_ch: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
      createBufferSource = () => ({
        ...node(),
        buffer: null as unknown,
        start() {
          played.push(this.buffer);
        },
      });
      resume = () => Promise.resolve();
      decodeAudioData = () => Promise.resolve({ duration: 1, id: n++ } as unknown as AudioBuffer);
    };
  }

  beforeEach(() => {
    played.length = 0;
    vi.stubGlobal('AudioContext', fakeContext());
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays a different recording on every tap, and uses all of them', async () => {
    const takes = SFX_TAKES.bark ?? 0;
    expect(takes).toBeGreaterThanOrEqual(4);
    const a = createAudio();
    a.unlock();
    a.fx('bark');
    await a.ready();
    await Promise.resolve();
    for (let i = 0; i < 300; i++) a.fx('bark');
    expect(played.length).toBeGreaterThan(300);
    for (let i = 1; i < played.length; i++) expect(played[i], `tap ${i}`).not.toBe(played[i - 1]);
    expect(new Set(played).size).toBe(takes);
  });
});
