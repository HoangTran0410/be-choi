export interface Glyph {
  /** What is drawn on the tile ("A", "7"). */
  label: string;
  /** How the name is read aloud ("bê", "bảy"). */
  name: string;
  /** Illustrating word ("bóng"); for digits, that many emoji. */
  word: string;
  /** Illustrating emoji. */
  emoji: string;
}

const g = (label: string, name: string, word: string, emoji: string): Glyph => ({ label, name, word, emoji });

/** The 29 letters of the Vietnamese alphabet, each with a picture word starting with it. */
export const LETTERS: readonly Glyph[] = [
  g('A', 'a', 'áo', '👕'),
  g('Ă', 'á', 'ăn cơm', '🍚'),
  g('Â', 'ớ', 'ấm trà', '🫖'),
  g('B', 'bê', 'bóng', '⚽'),
  g('C', 'xê', 'cá', '🐟'),
  g('D', 'dê', 'dê', '🐐'),
  g('Đ', 'đê', 'đèn', '💡'),
  g('E', 'e', 'em bé', '👶'),
  g('Ê', 'ê', 'ếch', '🐸'),
  g('G', 'giê', 'gà', '🐔'),
  g('H', 'hát', 'hoa', '🌸'),
  g('I', 'i', 'ỉn', '🐷'),
  g('K', 'ca', 'kẹo', '🍬'),
  g('L', 'e lờ', 'lá', '🍃'),
  g('M', 'em mờ', 'mèo', '🐱'),
  g('N', 'en nờ', 'nơ', '🎀'),
  g('O', 'o', 'ong', '🐝'),
  g('Ô', 'ô', 'ô che mưa', '☂️'),
  g('Ơ', 'ơ', 'ớt', '🌶️'),
  g('P', 'pê', 'pin', '🔋'),
  g('Q', 'quy', 'quả cam', '🍊'),
  g('R', 'e rờ', 'rùa', '🐢'),
  g('S', 'ét xì', 'sao', '⭐'),
  g('T', 'tê', 'táo', '🍎'),
  g('U', 'u', 'ú oà', '🙈'),
  g('Ư', 'ư', 'chim ưng', '🦅'),
  g('V', 'vê', 'vịt', '🦆'),
  g('X', 'ích xì', 'xe', '🚗'),
  g('Y', 'i dài', 'yến', '🐦'),
];

const NUMBER_NAMES = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const NUMBER_EMOJI = ['⭕', '🍎', '🐱', '🐟', '🌸', '🎈', '🐝', '⭐', '🍓', '🦆'];

/** The digits 0 … 9, each shown with that many emoji (0 shows an empty circle). */
export const DIGITS: readonly Glyph[] = NUMBER_NAMES.map((name, n) =>
  g(String(n), name, NUMBER_EMOJI[n]!.repeat(Math.max(1, n)), NUMBER_EMOJI[n]!),
);

export const PAGE_SIZE = 10;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Letters in pages of ten, then the digits as the last page. No order is enforced. */
export function pages(): Glyph[][] {
  return [...chunk(LETTERS, PAGE_SIZE), [...DIGITS]];
}

export function isDigit(glyph: Glyph): boolean {
  return /^\d$/.test(glyph.label);
}

/** What the voice says for a tile: "bê. bóng" for letters, "một" for digits. */
export function sayFor(glyph: Glyph): string {
  return isDigit(glyph) ? glyph.name : `${glyph.name}. ${glyph.word}`;
}

/** Short caption under the glyph. */
export function captionFor(glyph: Glyph): string {
  return isDigit(glyph) ? glyph.name : glyph.word;
}

/** A page is finished once every tile has been touched at least once, in any order. */
export function pageDone(touched: ReadonlySet<number>, size: number): boolean {
  if (size <= 0) return false;
  for (let i = 0; i < size; i++) if (!touched.has(i)) return false;
  return true;
}
