import { describe, it, expect, vi } from 'vitest';
import { ROBOTS, findRobot } from './robots';
import { FACTS, countWord, createNarrator, fullLines, hintLines, lineMs, newRobotLines, placedLines } from './voice';

describe('voice lines', () => {
  it('counts out loud in Vietnamese', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(countWord)).toEqual(['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám']);
    expect(countWord(0)).toBe('không');
    expect(countWord(99)).toBe('tám');
  });

  it('says the name slowly on its own first, then one more thing, a bit faster', () => {
    const kick = findRobot('kick')!;
    for (let nth = 0; nth < FACTS.length; nth++) {
      const lines = placedLines(kick, 2, nth);
      expect(lines.length).toBe(2);
      expect(lines[0]!.text).toBe('Trống cái.');
      expect(lines[0]!.rate).toBeLessThanOrEqual(0.65);
      expect(lines[0]!.gap).toBeGreaterThanOrEqual(700);
      expect(lines[1]!.rate).toBeLessThan(0.9);
    }
  });

  it('rotates through the count, the colour and how it is played', () => {
    const bass = findRobot('bass')!;
    const texts = FACTS.map((_, nth) => placedLines(bass, 3, nth)[1]!.text);
    expect(texts).toEqual(['Ba bạn robot rồi.', 'Bạn đàn bass màu xanh dương.', 'Đàn bass là nhạc cụ gảy.']);
    expect(placedLines(bass, 1, 0)[1]!.text).toBe('Bé có một bạn robot rồi.');
    expect(placedLines(bass, 8, 0)[1]!.text).toBe('Tám bạn robot rồi.');
    // Never throws for odd counters.
    expect(() => placedLines(bass, 3, -4)).not.toThrow();
  });

  it('speaks about every robot without holes: name, colour and group words are all Vietnamese words', () => {
    for (const r of ROBOTS) {
      for (let nth = 0; nth < FACTS.length; nth++) {
        for (const l of placedLines(r, 4, nth)) {
          expect(l.text.length).toBeGreaterThan(3);
          expect(l.text).not.toMatch(/undefined|NaN/);
        }
      }
    }
    expect(placedLines(findRobot('piano')!, 2, 2)[1]!.text).toBe('Đàn piano là nhạc cụ bấm phím.');
    expect(placedLines(findRobot('flute')!, 2, 2)[1]!.text).toBe('Sáo là nhạc cụ thổi.');
    expect(placedLines(findRobot('violin')!, 2, 2)[1]!.text).toBe('Đàn vi-ô-lông là nhạc cụ kéo.');
  });

  it('has hints that name what is missing, with no wrong answer', () => {
    expect(hintLines('bass')[0]!.text).toBe('Thiếu tiếng bass nè!');
    expect(hintLines('beat')[0]!.text).toContain('nhịp');
    expect(hintLines('chord')[0]!.text).toContain('đệm');
    expect(hintLines('melody')[0]!.text).toContain('giai điệu');
    expect(hintLines('empty')[0]!.text).toContain('Kéo');
    expect(fullLines()[0]!.text).toContain('cả ban');
    expect(newRobotLines()[0]!.text).toContain('mới');
  });
});

describe('narrator', () => {
  function setup() {
    const spoken: Array<{ text: string; interrupt?: boolean; rate?: number }> = [];
    const timers: Array<{ fn: () => void; ms: number; id: number }> = [];
    let id = 0;
    const n = createNarrator({
      speak: (text, opts) => spoken.push({ text, ...opts }),
      setTimer: (fn, ms) => {
        timers.push({ fn, ms, id: ++id });
        return id;
      },
      clearTimer: (h) => {
        const i = timers.findIndex((t) => t.id === h);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    return { n, spoken, timers };
  }

  it('speaks the first line at once (cutting off the last thing), and the rest after a breath', () => {
    const { n, spoken, timers } = setup();
    n.say(placedLines(findRobot('kick')!, 1, 0));
    expect(spoken).toEqual([{ text: 'Trống cái.', interrupt: true, rate: 0.6 }]);
    expect(timers.length).toBe(1);
    expect(timers[0]!.ms).toBeGreaterThanOrEqual(lineMs({ text: 'Trống cái.', rate: 0.6, gap: 0 }) + 900);
    timers[0]!.fn();
    expect(spoken[1]).toEqual({ text: 'Bé có một bạn robot rồi.', interrupt: false, rate: 0.7 });
  });

  it('a new sentence replaces the waiting one', () => {
    const { n, spoken, timers } = setup();
    n.say(placedLines(findRobot('kick')!, 1, 0));
    n.say(placedLines(findRobot('bass')!, 2, 0));
    expect(timers.length).toBe(1);
    expect(spoken.map((s) => s.text)).toEqual(['Trống cái.', 'Đàn bass.']);
  });

  it('stop cancels what is still to come', () => {
    const { n, timers } = setup();
    n.say(placedLines(findRobot('kick')!, 1, 0));
    n.stop();
    expect(timers.length).toBe(0);
    const fn = vi.fn();
    n.say([]);
    expect(fn).not.toHaveBeenCalled();
  });
});
