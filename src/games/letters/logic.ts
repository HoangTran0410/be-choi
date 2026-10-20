export interface Word {
  /** A common Vietnamese word a toddler knows ("bóng"). */
  word: string;
  emoji: string;
}

export interface Glyph {
  /** What is drawn on the tile ("A", "7"). */
  label: string;
  kind: 'letter' | 'digit';
  /** How the name is read aloud ("bê", "bảy"). */
  name: string;
  /** The sound the letter makes at the start of a word ("bờ"). For digits, same as name. */
  sound: string;
  /** Three picture words starting with the letter (empty for digits). */
  words: readonly Word[];
  /** Digits: the emoji that is counted. */
  emoji: string;
}

const w = (word: string, emoji: string): Word => ({ word, emoji });

const letter = (label: string, name: string, sound: string, words: [Word, Word, Word]): Glyph => ({
  label,
  kind: 'letter',
  name,
  sound,
  words,
  emoji: words[0].emoji,
});

/**
 * The 29 letters of the Vietnamese alphabet, each with three picture words that
 * begin with it.
 *
 * Names are the ones taught to Vietnamese pre-schoolers: a, á (Ă), ớ (Â), bê,
 * xê, dê, đê, e, ê, giê, hát (H), i, ca (K), e-lờ, em-mờ, en-nờ, o, ô, ơ, pê,
 * quy (Q), e-rờ, ét-xì, tê, u, ư, vê, ích-xì, i dài (Y). This is the usual
 * classroom reading; a Vietnamese adult should still give it an ear. The
 * `sound` field is the beginning of the word, said on its own ("bờ… bóng").
 */
export const LETTERS: readonly Glyph[] = [
  letter('A', 'a', 'a', [w('áo', '👕'), w('anh trai', '👦'), w('ao', '🏞️')]),
  letter('Ă', 'á', 'á', [w('ăn cơm', '🍚'), w('ăn kem', '🍦'), w('ăng ten', '📡')]),
  letter('Â', 'ớ', 'ớ', [w('ấm trà', '🫖'), w('âm nhạc', '🎵'), w('ấm áp', '🧣')]),
  letter('B', 'bê', 'bờ', [w('bóng', '⚽'), w('bò', '🐄'), w('bánh', '🍰')]),
  letter('C', 'xê', 'cờ', [w('cá', '🐟'), w('cà rốt', '🥕'), w('cua', '🦀')]),
  letter('D', 'dê', 'dờ', [w('dê', '🐐'), w('dưa hấu', '🍉'), w('dép', '🩴')]),
  letter('Đ', 'đê', 'đờ', [w('đèn', '💡'), w('đồng hồ', '⏰'), w('đu quay', '🎡')]),
  letter('E', 'e', 'e', [w('em bé', '👶'), w('em gái', '👧'), w('em trai', '🧒')]),
  letter('Ê', 'ê', 'ê', [w('ếch', '🐸'), w('ê ke', '📐'), w('êm ái', '🛋️')]),
  letter('G', 'giê', 'gờ', [w('gà', '🐔'), w('gấu', '🐻'), w('gối', '🛏️')]),
  letter('H', 'hát', 'hờ', [w('hoa', '🌸'), w('hổ', '🐯'), w('hộp', '📦')]),
  letter('I', 'i', 'i', [w('ỉn', '🐷'), w('im lặng', '🤫'), w('in', '🖨️')]),
  letter('K', 'ca', 'cờ', [w('kẹo', '🍬'), w('kéo', '✂️'), w('kiến', '🐜')]),
  letter('L', 'e lờ', 'lờ', [w('lá', '🍃'), w('lửa', '🔥'), w('lạc đà', '🐪')]),
  letter('M', 'em mờ', 'mờ', [w('mèo', '🐱'), w('mưa', '🌧️'), w('mũ', '🧢')]),
  letter('N', 'en nờ', 'nờ', [w('nơ', '🎀'), w('nến', '🕯️'), w('nho', '🍇')]),
  letter('O', 'o', 'o', [w('ong', '🐝'), w('oẳn tù tì', '✌️'), w('ong mật', '🍯')]),
  letter('Ô', 'ô', 'ô', [w('ô tô', '🚗'), w('ốc sên', '🐌'), w('ô che mưa', '☂️')]),
  letter('Ơ', 'ơ', 'ơ', [w('ớt', '🌶️'), w('ớt chuông', '🫑'), w('ơ kìa', '😮')]),
  letter('P', 'pê', 'pờ', [w('pin', '🔋'), w('pizza', '🍕'), w('pi a nô', '🎹')]),
  letter('Q', 'quy', 'quờ', [w('quả cam', '🍊'), w('quần', '👖'), w('quà', '🎁')]),
  letter('R', 'e rờ', 'rờ', [w('rùa', '🐢'), w('rau', '🥬'), w('rồng', '🐉')]),
  letter('S', 'ét xì', 'sờ', [w('sao', '⭐'), w('sư tử', '🦁'), w('sữa', '🥛')]),
  letter('T', 'tê', 'tờ', [w('táo', '🍎'), w('tàu hoả', '🚂'), w('ti vi', '📺')]),
  letter('U', 'u', 'u', [w('ú oà', '🙈'), w('ủng', '👢'), w('uống nước', '🥤')]),
  letter('Ư', 'ư', 'ư', [w('ức gà', '🍗'), w('ước mơ', '🌠'), w('ưng', '🦅')]),
  letter('V', 'vê', 'vờ', [w('vịt', '🦆'), w('voi', '🐘'), w('vẹt', '🦜')]),
  letter('X', 'ích xì', 'xờ', [w('xe đạp', '🚲'), w('xô', '🪣'), w('xúc xích', '🌭')]),
  letter('Y', 'i dài', 'i', [w('yến', '🐦'), w('yêu', '❤️'), w('yoga', '🧘')]),
];

const NUMBER_NAMES = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/** What is counted on the number pages, with the word children say for it ("quả táo"). */
export interface Countable {
  emoji: string;
  /** "quả táo" — goes after "Có mấy". */
  noun: string;
}

export const COUNTABLES: readonly Countable[] = [
  { emoji: '🍎', noun: 'quả táo' },
  { emoji: '🐱', noun: 'con mèo' },
  { emoji: '🐟', noun: 'con cá' },
  { emoji: '🌸', noun: 'bông hoa' },
  { emoji: '🎈', noun: 'quả bóng bay' },
  { emoji: '🐝', noun: 'con ong' },
  { emoji: '⭐', noun: 'ngôi sao' },
  { emoji: '🍓', noun: 'quả dâu' },
  { emoji: '🦆', noun: 'con vịt' },
  { emoji: '🍪', noun: 'cái bánh quy' },
];

/** The digits 0 … 9; each page shows that many emoji of its own kind. */
export const DIGITS: readonly Glyph[] = NUMBER_NAMES.map((name, n) => ({
  label: String(n),
  kind: 'digit' as const,
  name,
  sound: name,
  words: [],
  emoji: COUNTABLES[n]!.emoji,
}));

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
  return glyph.kind === 'digit';
}

/** Lower-case form shown next to the capital ("Bb"). */
export function lowerOf(glyph: Glyph): string {
  return glyph.label.toLowerCase();
}

/**
 * The letter a word starts with. Tone marks are ignored (ấ is Â) but the vowel
 * shapes are kept (Ă, Â, Ê, Ô, Ơ, Ư, Đ stay themselves).
 */
export function initialOf(word: string): string {
  const base = word
    .normalize('NFD')
    .replace(/[̣̀́̃̉]/g, '')
    .normalize('NFC');
  return Array.from(base)[0]?.toUpperCase() ?? '';
}

/** A word split into its first letter (to colour in) and the rest. */
export function splitWord(word: string): { first: string; rest: string } {
  const chars = Array.from(word.normalize('NFC'));
  return { first: chars[0] ?? '', rest: chars.slice(1).join('') };
}

/** Reading of a picture tapped on its own: the opening sound, a beat, then the word. */
export function soundThenWord(glyph: Glyph, word: Word): [string, string] {
  return [glyph.sound, word.word];
}

/** A page is finished once every tile has been touched at least once, in any order. */
export function pageDone(touched: ReadonlySet<number>, size: number): boolean {
  if (size <= 0) return false;
  for (let i = 0; i < size; i++) if (!touched.has(i)) return false;
  return true;
}
