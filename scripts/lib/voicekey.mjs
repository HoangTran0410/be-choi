// Same as src/core/voiceKey.ts and clipHash in src/core/voiceClips.ts, for Node scripts.
// src/core/voiceClips.test.ts checks the two stay identical.

export function voiceKey(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[\s.,;:!?…。！？]+$/u, '');
}

export function clipHash(key) {
  let h = 0x811c9dc5;
  for (const ch of key) {
    const cp = ch.codePointAt(0);
    for (const b of cp > 0xffff ? [cp >> 16, (cp >> 8) & 0xff, cp & 0xff] : cp > 0xff ? [cp >> 8, cp & 0xff] : [cp]) {
      h ^= b;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}
