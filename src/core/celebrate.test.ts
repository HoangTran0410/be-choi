import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { celebrate } from './celebrate';
import { fakeAudio } from './testing';

function stage(): HTMLElement {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

describe('celebrate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no 2d context; celebrate falls back to a plain timer, which is
    // all these tests are about.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('showers the stage with confetti, then clears up after itself', async () => {
    const el = stage();
    const audio = fakeAudio();
    const jingle = vi.spyOn(audio, 'jingle');
    const spoken: string[] = [];

    const done = celebrate(el, audio, (t) => spoken.push(t));
    expect(el.querySelector('canvas.confetti')).not.toBeNull();
    expect(jingle).toHaveBeenCalled();
    expect(spoken).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2000);
    await done;
    expect(el.querySelector('canvas.confetti')).toBeNull();
  });

  it('with the confetti turned off, still cheers out loud and still takes the same beat', async () => {
    const el = stage();
    const audio = fakeAudio();
    const jingle = vi.spyOn(audio, 'jingle');
    const spoken: string[] = [];

    let settled = false;
    const done = celebrate(el, audio, (t) => spoken.push(t), { confetti: false });
    void done.then(() => (settled = true));

    // Nothing is drawn over the game the child is playing.
    expect(el.querySelector('canvas')).toBeNull();
    // But the win is still announced: the jingle and the praise have their own switches.
    expect(jingle).toHaveBeenCalled();
    expect(spoken).toHaveLength(1);

    // The game waits the same beat before the next round, so nothing is rushed.
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(settled).toBe(true);
    expect(el.querySelector('canvas')).toBeNull();
  });
});
