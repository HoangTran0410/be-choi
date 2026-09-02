import { ANIMALS, type Item } from '../../core/content';

export interface Key {
  /** Scientific pitch name, e.g. `C4`. */
  note: string;
  /** Frequency in Hz. */
  freq: number;
  /** Key colour (hex). */
  color: string;
  /** Animal shown on the key. Bigger animals sit on lower notes. */
  animal: Item;
}

function animal(emoji: string): Item {
  const found = ANIMALS.find((a) => a.emoji === emoji);
  if (!found) throw new Error(`piano: missing animal ${emoji}`);
  return found;
}

/** One octave, C4 … C5, coloured like a rainbow. */
export const KEYS: readonly Key[] = [
  { note: 'C4', freq: 261.63, color: '#ef4444', animal: animal('🐘') },
  { note: 'D4', freq: 293.66, color: '#f97316', animal: animal('🦁') },
  { note: 'E4', freq: 329.63, color: '#facc15', animal: animal('🐻') },
  { note: 'F4', freq: 349.23, color: '#22c55e', animal: animal('🐶') },
  { note: 'G4', freq: 392.0, color: '#3b82f6', animal: animal('🐱') },
  { note: 'A4', freq: 440.0, color: '#a855f7', animal: animal('🐸') },
  { note: 'B4', freq: 493.88, color: '#ec4899', animal: animal('🐔') },
  { note: 'C5', freq: 523.25, color: '#f87171', animal: animal('🐭') },
];

export function keyAt(index: number): Key | undefined {
  return KEYS[index];
}
