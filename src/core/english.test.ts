import { describe, expect, it } from 'vitest';
import { englishFor, englishVoice, numberWord } from './english';

describe('english', () => {
  it('maps Vietnamese words, with or without classifiers', () => {
    expect(englishFor('Con mèo')).toBe('cat');
    expect(englishFor('mèo')).toBe('cat');
    expect(englishFor('quả táo')).toBe('apple');
    expect(englishFor('màu đỏ')).toBe('red');
    expect(englishFor('số 15')).toBe('fifteen');
    expect(englishFor('cái gì đó')).toBeNull();
    expect(englishFor('')).toBeNull();
  });

  it('number words 0-20 only', () => {
    expect(numberWord(20)).toBe('twenty');
    expect(numberWord(21)).toBeNull();
  });

  it('picks an English voice, never a Vietnamese one', () => {
    const v = (lang: string, localService = true) => ({ lang, localService, name: lang }) as SpeechSynthesisVoice;
    expect(englishVoice([v('vi-VN'), v('en-GB'), v('en-US', false)])?.lang).toBe('en-GB');
    expect(englishVoice([v('vi-VN'), v('en-US'), v('en-GB')])?.lang).toBe('en-US');
    expect(englishVoice([v('vi-VN')])).toBeNull();
  });
});
