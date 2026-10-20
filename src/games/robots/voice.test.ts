import { describe, it, expect } from 'vitest';
import type { SpeechPart } from '../../core/speech';
import { QUIET_MS, createNarrator, createSparseVoice, fullLines, newRobotLines, welcomeLines } from './voice';

describe('voice lines', () => {
  it('has only three short lines, one for each big moment', () => {
    for (const lines of [welcomeLines(), fullLines(), newRobotLines()]) {
      expect(lines).toHaveLength(1);
      expect(lines[0]!.text.split(' ').length).toBeLessThanOrEqual(6);
      expect(lines[0]!.rate).toBeLessThanOrEqual(0.85);
    }
    expect(welcomeLines()[0]!.text).toContain('Kéo');
    expect(fullLines()[0]!.text).toContain('cả ban');
    expect(newRobotLines()[0]!.text).toContain('mới');
  });
});

describe('sparse voice', () => {
  it('lets one moment speak, then keeps quiet for a while', () => {
    let t = 1000;
    const v = createSparseVoice(() => t);
    expect(v.allow('full')).toBe(true);
    t += 1000;
    expect(v.allow('unlock')).toBe(false);
    t += QUIET_MS;
    expect(v.allow('unlock')).toBe(true);
  });

  it('says hello at most once', () => {
    let t = 0;
    const v = createSparseVoice(() => t);
    expect(v.allow('welcome')).toBe(true);
    t += QUIET_MS * 3;
    expect(v.allow('welcome')).toBe(false);
    expect(v.allow('full')).toBe(true);
  });

  it('a refused moment does not restart the quiet time', () => {
    let t = 0;
    const v = createSparseVoice(() => t);
    expect(v.allow('full')).toBe(true);
    t = QUIET_MS - 1;
    expect(v.allow('unlock')).toBe(false);
    t = QUIET_MS;
    expect(v.allow('unlock')).toBe(true);
  });
});

describe('narrator', () => {
  function setup() {
    const said: SpeechPart[][] = [];
    let stopped = 0;
    const n = createNarrator({
      speakSeq: (parts) => {
        said.push(parts);
        return Promise.resolve(true);
      },
      stopSpeech: () => stopped++,
    });
    return { n, said, stopped: () => stopped };
  }

  it('says a line slowly as one sequence', () => {
    const { n, said } = setup();
    n.say(fullLines());
    expect(said).toHaveLength(1);
    expect(said[0]!.map((p) => p.text)).toEqual(['Đủ cả ban nhạc rồi!']);
    expect(said[0]![0]!.rate).toBeLessThanOrEqual(0.85);
  });

  it('stop silences the voice; nothing to say says nothing', () => {
    const { n, said, stopped } = setup();
    n.stop();
    expect(stopped()).toBe(1);
    n.say([]);
    expect(said).toHaveLength(0);
  });
});
