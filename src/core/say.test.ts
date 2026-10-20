import { describe, expect, it } from 'vitest';
import { fakeContext } from './testing';
import { phraseParts, sayCount, sayLines, sayText, sayWord, TALK_RATE, WORD_PAUSE_MS, WORD_RATE } from './say';
import type { SpeechPart } from './speech';

function recorder(): { calls: SpeechPart[][]; ctx: { speakSeq(p: SpeechPart[]): Promise<boolean> } } {
  const calls: SpeechPart[][] = [];
  return {
    calls,
    ctx: {
      speakSeq(p) {
        calls.push(p);
        return Promise.resolve(true);
      },
    },
  };
}

describe('phraseParts', () => {
  it('splits sentences and gives short names the slow rate', () => {
    const p = phraseParts('Trống. Bé có một bạn trống rồi.');
    expect(p.map((x) => x.text)).toEqual(['Trống.', 'Bé có một bạn trống rồi.']);
    expect(p[0]).toMatchObject({ rate: WORD_RATE, pauseAfterMs: WORD_PAUSE_MS });
    expect(p[1]).toMatchObject({ rate: TALK_RATE, pauseAfterMs: 0 });
  });
  it('splits at the comma after a name and in long sentences', () => {
    expect(phraseParts('Cà rốt, uống nước nào.').map((x) => x.text)).toEqual(['Cà rốt', 'uống nước nào.']);
    expect(phraseParts('Chọn ánh sáng và một bài hát, cả dàn thú sẽ chơi nhạc cho bé.')).toHaveLength(2);
    expect(phraseParts('Ngon quá nè, bé ơi')).toHaveLength(1);
  });
  it('handles ellipses and empty text', () => {
    expect(phraseParts('Hoan hô!… Bánh ngon quá!').map((x) => x.text)).toEqual(['Hoan hô!', 'Bánh ngon quá!']);
    expect(phraseParts('  ')).toEqual([]);
    expect(phraseParts('…')).toEqual([]);
  });
});

describe('say helpers', () => {
  it('sayText does nothing for empty text', () => {
    const r = recorder();
    void sayText(r.ctx, '');
    expect(r.calls).toEqual([]);
  });
  it('sayWord says the name slowly, a gap, then the rest', () => {
    const r = recorder();
    void sayWord(r.ctx, 'Trống.', 'Bé có một bạn trống rồi');
    const p = r.calls[0]!;
    expect(p[0]).toMatchObject({ text: 'Trống', rate: WORD_RATE, pauseAfterMs: WORD_PAUSE_MS });
    expect(p[1]!.text).toBe('Bé có một bạn trống rồi');
    expect(p[1]!.pauseAfterMs).toBe(0);
  });
  it('sayWord alone has no trailing gap', () => {
    const r = recorder();
    void sayWord(r.ctx, 'mèo');
    expect(r.calls[0]).toHaveLength(1);
    expect(r.calls[0]![0]!.pauseAfterMs).toBe(0);
  });
  it('sayLines joins phrases with gaps', () => {
    const r = recorder();
    void sayLines(r.ctx, ['Chào bé!', 'Mình cùng học nhé']);
    expect(r.calls[0]!.map((x) => x.text)).toEqual(['Chào bé!', 'Mình cùng học nhé']);
    expect(r.calls[0]![0]!.pauseAfterMs).toBeGreaterThan(0);
  });
  it('sayCount fires onEach as each number starts, 700 ms apart', () => {
    const ctx = fakeContext();
    const seen: number[] = [];
    void sayCount(ctx, ['một', 'hai', 'ba', 'bốn'], 3, (i) => seen.push(i), 'Ba quả');
    expect(ctx.sequenced).toEqual(['một', 'hai', 'ba', 'Ba quả']);
    expect(seen).toEqual([0, 1, 2]);
    const r = recorder();
    void sayCount(r.ctx, ['một', 'hai'], 2);
    expect(r.calls[0]!.map((x) => x.pauseAfterMs)).toEqual([700, 0]);
    ctx.cleanup();
  });
});
