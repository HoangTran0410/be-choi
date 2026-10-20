/** The things that go on cards, tables and tunes: emoji, colours, or a family photo. */
import type { AudioEngine, FxKind } from '../../core/audio';
import { ANIMALS, COLORS, FOODS, FRUITS, VEHICLES, VOICED_ANIMALS, voiceOf, type Item } from '../../core/content';
import { h, pick, shuffle } from '../../core/dom';
import type { Photo } from '../../core/photos';

export interface Piece {
  /** Same key = same picture (a pair, an answer). */
  key: string;
  emoji?: string;
  /** Hex colour: drawn as a round blob instead of an emoji. */
  color?: string;
  /** Family photo data URL. */
  photo?: string;
  /** Spoken aloud. */
  name: string;
  fx?: FxKind;
}

export const PHOTO_NAME = 'ảnh nhà mình';

export function fromItem(i: Item): Piece {
  return { key: i.emoji, emoji: i.emoji, name: i.name };
}

export function fromPhoto(p: Photo): Piece {
  return { key: `photo:${p.id}`, photo: p.url, name: PHOTO_NAME };
}

/** Things to look at, widening with the island. Duplicated emoji are dropped. */
export function thingsFor(island: number): Piece[] {
  const sets: readonly (readonly Item[])[] =
    island <= 0 ? [ANIMALS, FRUITS] : island === 1 ? [ANIMALS, VEHICLES, FOODS] : [ANIMALS, FRUITS, VEHICLES, FOODS];
  const seen = new Set<string>();
  const out: Piece[] = [];
  for (const set of sets) {
    for (const i of set) {
      if (seen.has(i.emoji)) continue;
      seen.add(i.emoji);
      out.push(fromItem(i));
    }
  }
  return out;
}

export function colorPieces(): Piece[] {
  return COLORS.map((c) => ({ key: `color:${c.id}`, color: c.hex, name: c.name }));
}

export function animalPieces(): Piece[] {
  return VOICED_ANIMALS.map((a) => ({ ...fromItem(a), fx: voiceOf(a) }));
}

export function fruitPieces(): Piece[] {
  return FRUITS.map(fromItem);
}

/** Look-alike families: swapping within one is a hard "spot the difference". */
export const FAMILIES: readonly (readonly string[])[] = [
  ['🐶', '🐱', '🐭', '🐰', '🐻', '🐼'],
  ['🍎', '🍅', '🍒', '🍓'],
  ['🚗', '🚕', '🚙', '🚌'],
  ['🌸', '🌼', '🌻', '🌷'],
  ['⭐', '🌟', '✨', '🌙'],
  ['🐟', '🐠', '🐬', '🐳'],
];

/** Name for any emoji we may show (falls back to a gentle word). */
const NAMES = new Map<string, string>();
for (const set of [ANIMALS, FRUITS, VEHICLES, FOODS]) for (const i of set) NAMES.set(i.emoji, i.name);
for (const [e, n] of Object.entries({
  '🍅': 'quả cà chua',
  '🚕': 'xe taxi',
  '🚙': 'xe địa hình',
  '🌸': 'bông hoa hồng nhạt',
  '🌼': 'bông hoa vàng',
  '🌻': 'hoa hướng dương',
  '🌷': 'hoa tulip',
  '⭐': 'ngôi sao',
  '🌟': 'ngôi sao sáng',
  '✨': 'ánh lấp lánh',
  '🌙': 'mặt trăng',
  '🐠': 'con cá nhiệt đới',
  '🐬': 'cá heo',
  '🐳': 'cá voi',
})) {
  NAMES.set(e, n);
}
export function nameOfEmoji(e: string): string {
  return NAMES.get(e) ?? 'một món đồ';
}

/** Distinct pieces, shuffled. */
export function draw(pool: readonly Piece[], n: number, rng: () => number): Piece[] {
  return pick(pool, Math.min(n, pool.length), rng);
}

export function mix<T>(arr: readonly T[], rng: () => number): T[] {
  return shuffle(arr, rng);
}

/** The picture itself: an emoji, a colour blob or a photo, sized by the parent's font-size. */
export function pieceEl(p: Piece): HTMLElement {
  if (p.photo) {
    const img = h('img', { class: 'brain-photo', alt: '', draggable: false, src: p.photo });
    return h('span', { class: 'brain-piece is-photo' }, img);
  }
  if (p.color) return h('span', { class: 'brain-piece is-color', style: `--brain-c:${p.color}` });
  return h('span', { class: 'brain-piece' }, p.emoji ?? '❔');
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

/** A sound for a piece: the animal's own voice, or a bell note picked by its position. */
export function soundOf(audio: AudioEngine, p: Piece, index: number): void {
  if (p.fx) audio.fx(p.fx);
  else audio.note(PENTA[index % PENTA.length]!, 0.5, p.color ? 'bell' : 'xylo');
}
