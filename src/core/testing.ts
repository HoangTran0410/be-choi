/**
 * Test doubles for game modules (jsdom). Lets a smoke test call `start(ctx)`
 * and assert on the DOM without audio, speech, or a real shell.
 */
import type { AudioEngine } from './audio';
import { createHint } from './hint';
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
    cleanup() {
      ctx.hint.clear();
      for (const fn of cleanups.reverse()) fn();
      stage.remove();
    },
  };
  return ctx;
}
