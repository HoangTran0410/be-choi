/**
 * The key a spoken line is looked up by in the pre-recorded voice clips. The runtime and
 * `scripts/voice-inventory.mjs` both use this, so a clip is found exactly when the inventory
 * listed it. Lower-case, Unicode NFC (Vietnamese letters can be typed composed or decomposed),
 * spaces collapsed, no leading or trailing space and no trailing punctuation.
 */
export function voiceKey(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[\s.,;:!?…。！？]+$/u, '');
}
