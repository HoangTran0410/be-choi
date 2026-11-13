import { describe, expect, it } from 'vitest';
import { voiceKey } from './voiceKey';

describe('voiceKey', () => {
  it('lower-cases, trims and collapses spaces', () => {
    expect(voiceKey('  Con   Mèo  ')).toBe('con mèo');
  });

  it('strips trailing punctuation but keeps inner punctuation', () => {
    expect(voiceKey('Giỏi quá!')).toBe('giỏi quá');
    expect(voiceKey('Cà rốt, đã lớn…')).toBe('cà rốt, đã lớn');
    expect(voiceKey('Ú oà! ...?')).toBe('ú oà');
    expect(voiceKey('Con gì kêu ?')).toBe('con gì kêu');
  });

  it('treats composed and decomposed Vietnamese as the same key', () => {
    expect(voiceKey('Mèo'.normalize('NFD'))).toBe(voiceKey('Mèo'.normalize('NFC')));
    expect(voiceKey('ĐỎ')).toBe('đỏ');
  });

  it('is idempotent and gives an empty key for punctuation only', () => {
    const k = voiceKey('  Chào bé! ');
    expect(voiceKey(k)).toBe(k);
    expect(voiceKey(' ... ')).toBe('');
  });
});
