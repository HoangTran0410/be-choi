/**
 * Test doubles for game modules (jsdom). Lets a smoke test call `start(ctx)`
 * and assert on the DOM without audio, speech, or a real shell.
 */
import type { AudioEngine } from './audio';
import { createHint } from './hint';
import { createPhotoStore } from './photos';
import type { GameContext } from './types';

export function fakeAudio(): AudioEngine {
  const noop = () => undefined;
  return {
    enabled: true,
    unlock: noop,
    setEnabled: noop,
    pop: noop,
    ding: noop,
    boing: noop,
    chomp: noop,
    tick: noop,
    jingle: noop,
    note: noop,
    drum: noop,
    fx: noop,
    puff: noop,
    ready: () => Promise.resolve(),
  };
}

export interface FakeContext extends GameContext {
  spoken: string[];
  stars: number;
  celebrations: number;
  /** Run the game's cleanups and remove the stage from the document. */
  cleanup(): void;
}

export function fakeContext(): FakeContext {
  const stage = document.createElement('div');
  stage.className = 'stage';
  document.body.append(stage);
  const cleanups: Array<() => void> = [];
  const ctx: FakeContext = {
    stage,
    audio: fakeAudio(),
    hint: createHint(),
    spoken: [],
    stars: 0,
    celebrations: 0,
    speak(text) {
      ctx.spoken.push(text);
    },
    celebrate() {
      ctx.celebrations++;
      return Promise.resolve();
    },
    addStar() {
      ctx.stars++;
    },
    onCleanup(fn) {
      cleanups.push(fn);
    },
    photos: createPhotoStore(async () => 'data:image/jpeg;base64,'),
    stickers: () => [],
    cleanup() {
      ctx.hint.clear();
      for (const fn of cleanups.reverse()) fn();
      stage.remove();
    },
  };
  return ctx;
}

export interface FakePlayback {
  /** Playback speed the game asked for (the animal's voice). */
  rate: number;
  /** Fire the game's `onEnd` callback. */
  end(): void;
}

export interface FakeMic {
  /** Loudness the fake microphone reports, 0 … 1. Keep it 0 for the first ~0.5 s of frames: that is when `createMic` learns the room's noise floor. */
  level: number;
  /** Pitch reported while the level is above silence. */
  pitchHz: number;
  /** Set to false to play a parent refusing the permission. */
  granted: boolean;
  /** Playbacks the game started, oldest first. */
  played: FakePlayback[];
  /** Push `chunks` of voice into a recording that is running. */
  feed(chunks?: number): void;
  restore(): void;
}

interface FakeProcessor {
  onaudioprocess: ((e: { inputBuffer: { getChannelData(ch: number): Float32Array } }) => void) | null;
}

/**
 * A microphone that answers whatever a test wants, by standing in for
 * `getUserMedia` and `AudioContext`. Call `restore()` when the test is done.
 */
export function fakeMic(sampleRate = 44100): FakeMic {
  const fake: FakeMic = {
    level: 0,
    pitchHz: 300,
    granted: true,
    played: [],
    feed(chunks = 4) {
      const proc = processor;
      if (!proc?.onaudioprocess) return;
      const data = new Float32Array(4096);
      for (let i = 0; i < data.length; i++) data[i] = Math.max(0.05, fake.level) * Math.sin((2 * Math.PI * fake.pitchHz * i) / sampleRate);
      for (let i = 0; i < chunks; i++) proc.onaudioprocess({ inputBuffer: { getChannelData: () => data } });
    },
    restore() {
      globals.AudioContext = prevAudioCtx;
      if (prevMediaDevices === undefined) delete (navigator as { mediaDevices?: unknown }).mediaDevices;
      else Object.defineProperty(navigator, 'mediaDevices', { value: prevMediaDevices, configurable: true });
    },
  };

  let processor: FakeProcessor | null = null;
  const noop = () => undefined;
  const analyser = {
    fftSize: 1024,
    getByteTimeDomainData(buf: Uint8Array) {
      // A square wave whose RMS is exactly `level`.
      const amp = Math.round(Math.max(0, Math.min(1, fake.level)) * 127);
      for (let i = 0; i < buf.length; i++) buf[i] = 128 + (i % 2 === 0 ? amp : -amp);
    },
    getFloatTimeDomainData(buf: Float32Array) {
      for (let i = 0; i < buf.length; i++) buf[i] = fake.level * Math.sin((2 * Math.PI * fake.pitchHz * i) / sampleRate);
    },
  };
  const audioContext = {
    sampleRate,
    state: 'running',
    destination: {},
    createAnalyser: () => analyser,
    createMediaStreamSource: () => ({ connect: noop, disconnect: noop }),
    createScriptProcessor: () => {
      const proc = { onaudioprocess: null as FakeProcessor['onaudioprocess'], connect: noop, disconnect: noop };
      processor = proc;
      return proc;
    },
    createGain: () => ({ gain: { value: 1 }, connect: noop, disconnect: noop }),
    createBuffer: (_channels: number, length: number, rate: number) => {
      const data = new Float32Array(length);
      return { length, sampleRate: rate, duration: length / rate, numberOfChannels: 1, getChannelData: () => data };
    },
    createBufferSource: () => {
      const src = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        onended: null as (() => void) | null,
        connect: noop,
        disconnect: noop,
        start() {
          fake.played.push({
            rate: src.playbackRate.value,
            end: () => src.onended?.(),
          });
        },
        stop: noop,
      };
      return src;
    },
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };

  const globals = globalThis as { AudioContext?: unknown };
  const prevAudioCtx = globals.AudioContext;
  const prevMediaDevices = (navigator as { mediaDevices?: unknown }).mediaDevices;
  globals.AudioContext = function FakeAudioContext() {
    return audioContext;
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => {
        if (!fake.granted) throw new Error('NotAllowedError');
        return { getTracks: () => [{ stop: noop }] };
      },
    },
  });
  return fake;
}
