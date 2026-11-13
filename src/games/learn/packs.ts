/**
 * Content of the newer stations: Vần & dấu, Trái nghĩa, Thời gian, Trái/Phải, An toàn.
 * Plain data (emoji + Vietnamese words) so the question code stays small and the data can be
 * checked by tests. Nothing here imports the rest of the game.
 */

// ---- tones (dấu thanh) ----

export type Tone = 'ngang' | 'huyen' | 'sac' | 'hoi' | 'nga' | 'nang';

export const TONE_NAME: Readonly<Record<Tone, string>> = {
  ngang: 'không dấu',
  huyen: 'dấu huyền',
  sac: 'dấu sắc',
  hoi: 'dấu hỏi',
  nga: 'dấu ngã',
  nang: 'dấu nặng',
};

const TONE_MARK: Readonly<Record<string, Tone>> = {
  '̀': 'huyen',
  '́': 'sac',
  '̉': 'hoi',
  '̃': 'nga',
  '̣': 'nang',
};

/** Tone of one written syllable, read from its combining marks. */
export function toneOf(syllable: string): Tone {
  for (const ch of syllable.normalize('NFD')) {
    const t = TONE_MARK[ch];
    if (t) return t;
  }
  return 'ngang';
}

/** The syllable with its tone mark taken off ("bà" → "ba", "sáo" → "sao"). */
export function stripTone(syllable: string): string {
  return [...syllable.normalize('NFD')].filter((c) => !TONE_MARK[c]).join('').normalize('NFC');
}

/** The vowel that carries the tone mark ("cá" → "á"), or '' for a syllable with no mark. */
export function tonedVowel(syllable: string): string {
  const plain = stripTone(syllable);
  const w = syllable.normalize('NFC');
  for (let i = 0; i < w.length; i++) if (w[i] !== plain[i]) return w[i]!;
  return '';
}

/** The syllable with the toned vowel replaced by `_` ("cá" → "c_", "sáo" → "s_o"). */
export function blankTone(syllable: string): string {
  const w = syllable.normalize('NFC');
  const plain = stripTone(w);
  for (let i = 0; i < w.length; i++) if (w[i] !== plain[i]) return `${w.slice(0, i)}_${w.slice(i + 1)}`;
  return w;
}

export interface ToneWord {
  /** The written word. */
  w: string;
  emoji: string;
  /** Said when naming the picture: "con gà". */
  name: string;
}

export interface ToneFamily {
  base: string;
  /** Real Vietnamese syllables that differ only by tone (all of them mean something). */
  forms: readonly string[];
  /** The forms that have a clear picture. */
  pics: readonly ToneWord[];
}

const tw = (w: string, emoji: string, name: string): ToneWord => ({ w, emoji, name });

export const TONE_FAMILIES: readonly ToneFamily[] = [
  { base: 'ba', forms: ['ba', 'bà', 'bá', 'bả', 'bạ'], pics: [tw('ba', '👨', 'ba'), tw('bà', '👵', 'bà')] },
  { base: 'ma', forms: ['ma', 'mà', 'má', 'mả', 'mã', 'mạ'], pics: [tw('ma', '👻', 'con ma')] },
  { base: 'ga', forms: ['ga', 'gà', 'gá', 'gả', 'gạ'], pics: [tw('ga', '🚉', 'nhà ga'), tw('gà', '🐔', 'con gà')] },
  { base: 'ca', forms: ['ca', 'cà', 'cá', 'cả', 'cạ'], pics: [tw('cá', '🐟', 'con cá'), tw('cà', '🍆', 'quả cà')] },
  { base: 'bo', forms: ['bo', 'bò', 'bó', 'bỏ', 'bọ'], pics: [tw('bò', '🐄', 'con bò'), tw('bó', '💐', 'bó hoa'), tw('bọ', '🐞', 'con bọ')] },
  { base: 'sao', forms: ['sao', 'sào', 'sáo', 'sạo'], pics: [tw('sao', '⭐', 'ngôi sao'), tw('sáo', '🐦', 'chim sáo')] },
  { base: 'dua', forms: ['dưa', 'dừa', 'dứa', 'dựa'], pics: [tw('dưa', '🍉', 'quả dưa'), tw('dừa', '🥥', 'quả dừa'), tw('dứa', '🍍', 'quả dứa')] },
  { base: 'cho', forms: ['cho', 'chó', 'chỏ', 'chõ'], pics: [tw('chó', '🐶', 'con chó')] },
  { base: 'cho2', forms: ['chơ', 'chờ', 'chở', 'chợ'], pics: [tw('chợ', '🛒', 'cái chợ')] },
  { base: 'meo', forms: ['meo', 'mèo', 'méo', 'mẹo'], pics: [tw('mèo', '🐱', 'con mèo')] },
  { base: 'ho', forms: ['hô', 'hồ', 'hố', 'hổ', 'hộ'], pics: [tw('hồ', '🏞️', 'cái hồ'), tw('hổ', '🐯', 'con hổ'), tw('hố', '🕳️', 'cái hố')] },
  { base: 'la', forms: ['la', 'là', 'lá', 'lạ'], pics: [tw('lá', '🍃', 'chiếc lá')] },
  { base: 'me', forms: ['me', 'mè', 'mẻ', 'mẹ'], pics: [tw('mẹ', '👩', 'mẹ')] },
  { base: 'mu', forms: ['mu', 'mù', 'mú', 'mủ', 'mũ', 'mụ'], pics: [tw('mũ', '🧢', 'cái mũ')] },
  { base: 've', forms: ['ve', 'vé', 'vè', 'vẻ', 'vẽ', 'vẹ'], pics: [tw('vé', '🎫', 'cái vé'), tw('vẽ', '🖍️', 'vẽ tranh')] },
  { base: 'bo2', forms: ['bơ', 'bờ', 'bở', 'bợ', 'bớ'], pics: [tw('bơ', '🥑', 'quả bơ'), tw('bờ', '🏖️', 'bờ biển')] },
  { base: 'co', forms: ['cơ', 'cờ', 'cớ', 'cỡ', 'cợ'], pics: [tw('cờ', '🚩', 'lá cờ')] },
  { base: 'nho', forms: ['nho', 'nhỏ', 'nhọ'], pics: [tw('nho', '🍇', 'chùm nho')] },
];

/** Every picture word with the family it belongs to. */
export const TONE_WORDS: readonly (ToneWord & { family: ToneFamily; tone: Tone })[] = TONE_FAMILIES.flatMap((f) =>
  f.pics.map((p) => ({ ...p, family: f, tone: toneOf(p.w) })),
);

/** Words with a mark to find: the "missing tone" question needs a tone to be missing. */
export const TONE_MARKED_WORDS = TONE_WORDS.filter((w) => w.tone !== 'ngang');

export const TONE_IDS: readonly string[] = ['T:start', 'T:hear', 'T:mark'];

/** Consonant sounds as they are said aloud when a child learns to read ("mờ", "cờ"…). */
export const SOUND_NAMES: Readonly<Record<string, string>> = {
  B: 'bờ',
  C: 'cờ',
  G: 'gờ',
  H: 'hờ',
  L: 'lờ',
  M: 'mờ',
  N: 'nờ',
  S: 'sờ',
  T: 'tờ',
  V: 'vờ',
  X: 'xờ',
};
export const SOUND_LETTERS: readonly string[] = Object.keys(SOUND_NAMES);

// ---- opposites ----

export interface Side {
  /** "nóng", "to". */
  word: string;
  /** Pictures that clearly show it. */
  pics: readonly { emoji: string; name: string }[];
}
export interface OppositePair {
  id: string;
  a: Side;
  b: Side;
}
const sp = (emoji: string, name: string) => ({ emoji, name });

export const OPPOSITES: readonly OppositePair[] = [
  {
    id: 'temp',
    a: { word: 'nóng', pics: [sp('🔥', 'ngọn lửa'), sp('☕', 'cốc trà nóng'), sp('🌞', 'mặt trời')] },
    b: { word: 'lạnh', pics: [sp('🧊', 'viên đá'), sp('⛄', 'người tuyết'), sp('🥶', 'bạn bị lạnh')] },
  },
  {
    id: 'size',
    a: { word: 'to', pics: [sp('🐘', 'con voi'), sp('🐳', 'con cá voi'), sp('🦕', 'con khủng long')] },
    b: { word: 'nhỏ', pics: [sp('🐜', 'con kiến'), sp('🐭', 'con chuột'), sp('🐞', 'con bọ rùa')] },
  },
  {
    id: 'height',
    a: { word: 'cao', pics: [sp('🦒', 'con hươu cao cổ'), sp('🗼', 'cái tháp'), sp('🏢', 'toà nhà')] },
    b: { word: 'thấp', pics: [sp('🍄', 'cây nấm'), sp('🪑', 'cái ghế thấp'), sp('🛋️', 'ghế sofa')] },
  },
  {
    id: 'speed',
    a: { word: 'nhanh', pics: [sp('🚀', 'tên lửa'), sp('🐆', 'con báo'), sp('🏎️', 'xe đua')] },
    b: { word: 'chậm', pics: [sp('🐌', 'con ốc sên'), sp('🐢', 'con rùa'), sp('🦥', 'con lười')] },
  },
  {
    id: 'mood',
    a: { word: 'vui', pics: [sp('😄', 'bạn cười'), sp('🥳', 'bạn đang vui'), sp('😆', 'bạn cười to')] },
    b: { word: 'buồn', pics: [sp('😢', 'bạn khóc'), sp('😭', 'bạn đang buồn'), sp('🙁', 'bạn buồn')] },
  },
  {
    id: 'light',
    a: { word: 'sáng', pics: [sp('💡', 'bóng đèn'), sp('🔦', 'đèn pin'), sp('🌅', 'buổi sáng')] },
    b: { word: 'tối', pics: [sp('🌙', 'đêm tối'), sp('🌑', 'trăng tối'), sp('🌃', 'thành phố ban đêm')] },
  },
  {
    id: 'full',
    a: { word: 'đầy', pics: [sp('🥛', 'cốc sữa đầy'), sp('🍯', 'hũ mật đầy'), sp('🧺', 'giỏ đầy')] },
    b: { word: 'rỗng', pics: [sp('🪹', 'tổ chim trống'), sp('🍽️', 'cái đĩa trống'), sp('🫙', 'cái lọ rỗng')] },
  },
];
export const OPPOSITE_IDS: readonly string[] = OPPOSITES.map((o) => `O:${o.id}`);

// ---- time ----

export interface DayPart {
  id: string;
  /** "buổi sáng". */
  name: string;
  /** The sun (or moon) in the sky at that time. */
  sky: string;
  /** Things a child does then. */
  acts: readonly { emoji: string; name: string }[];
}

/** In order through the day; after the last one comes the first again. */
export const DAY_PARTS: readonly DayPart[] = [
  { id: 'morning', name: 'buổi sáng', sky: '🌅', acts: [sp('🥣', 'ăn sáng'), sp('🐓', 'gà gáy'), sp('🪥', 'đánh răng buổi sáng')] },
  { id: 'noon', name: 'buổi trưa', sky: '🌞', acts: [sp('🍚', 'ăn cơm trưa'), sp('🛏️', 'ngủ trưa'), sp('😎', 'nắng to')] },
  { id: 'afternoon', name: 'buổi chiều', sky: '🌇', acts: [sp('🛁', 'tắm chiều'), sp('🚲', 'đạp xe buổi chiều'), sp('🏡', 'về nhà')] },
  { id: 'night', name: 'buổi tối', sky: '🌙', acts: [sp('😴', 'đi ngủ'), sp('⭐', 'ngắm sao'), sp('📖', 'nghe kể chuyện')] },
];

export interface SeasonInfo {
  id: string;
  name: string;
  sky: string;
  clues: readonly { emoji: string; name: string }[];
}
export const SEASONS: readonly SeasonInfo[] = [
  { id: 'spring', name: 'mùa xuân', sky: '🌸', clues: [sp('🌷', 'hoa nở'), sp('🌱', 'cây nảy mầm'), sp('🧧', 'phong bao lì xì')] },
  { id: 'summer', name: 'mùa hè', sky: '🏖️', clues: [sp('🍉', 'dưa hấu'), sp('🍦', 'cây kem'), sp('🌞', 'trời nắng')] },
  { id: 'autumn', name: 'mùa thu', sky: '🍂', clues: [sp('🍁', 'lá vàng rơi'), sp('🏮', 'đèn trung thu'), sp('🥮', 'bánh trung thu')] },
  { id: 'winter', name: 'mùa đông', sky: '⛄', clues: [sp('🧣', 'khăn len'), sp('🧤', 'găng tay'), sp('❄️', 'bông tuyết')] },
];
export const TIME_IDS: readonly string[] = ['D:day', 'D:order', 'D:season'];

// ---- left and right (as the child sees them: the screen is not a mirror) ----

export const LR_IDS: readonly string[] = ['R:left', 'R:right'];
/** Things to put side by side. */
export const LR_THINGS: readonly { emoji: string; name: string }[] = [
  sp('🐱', 'con mèo'),
  sp('🐶', 'con chó'),
  sp('🐰', 'con thỏ'),
  sp('🍎', 'quả táo'),
  sp('⚽', 'quả bóng'),
  sp('🚗', 'chiếc xe'),
  sp('🌳', 'cái cây'),
  sp('🦆', 'con vịt'),
];

// ---- safety and hygiene ----

export interface SafetyScene {
  id: string;
  /** Picture in the bubble. */
  stim: string;
  say: string[];
  bubble: string;
  right: { emoji: string; name: string };
  /** Things that are not the answer (at least three). */
  wrong: readonly { emoji: string; name: string }[];
  reveal: string[];
}

export const SAFETY_SCENES: readonly SafetyScene[] = [
  {
    id: 'wash',
    stim: '🍽️',
    say: ['Sắp ăn cơm rồi', 'bé cần làm gì?'],
    bubble: 'Trước khi ăn, bé làm gì?',
    right: sp('🧼', 'rửa tay bằng xà phòng'),
    wrong: [sp('📱', 'chơi điện thoại'), sp('🧸', 'chơi gấu bông'), sp('📺', 'xem ti vi')],
    reveal: ['Trước khi ăn', 'bé rửa tay bằng xà phòng'],
  },
  {
    id: 'helmet',
    stim: '🏍️',
    say: ['Đi xe máy', 'bé đội gì?'],
    bubble: 'Đi xe máy, bé đội gì?',
    right: sp('⛑️', 'mũ bảo hiểm'),
    wrong: [sp('👒', 'cái nón lá'), sp('🎩', 'mũ phù thủy'), sp('🧢', 'mũ lưỡi trai')],
    reveal: ['Đi xe máy', 'bé đội mũ bảo hiểm'],
  },
  {
    id: 'cross',
    stim: '🛣️',
    say: ['Qua đường', 'bé phải làm gì?'],
    bubble: 'Qua đường, bé phải làm gì?',
    right: sp('👀', 'nhìn trái, nhìn phải'),
    wrong: [sp('🏃', 'chạy thật nhanh'), sp('📱', 'vừa đi vừa xem điện thoại'), sp('🙈', 'nhắm mắt lại')],
    reveal: ['Qua đường', 'bé nhìn trái, nhìn phải'],
  },
  {
    id: 'redlight',
    stim: '🔴',
    say: ['Đèn đỏ', 'bé làm gì?'],
    bubble: 'Đèn đỏ thì bé làm gì?',
    right: sp('✋', 'dừng lại'),
    wrong: [sp('🏃', 'chạy qua đường'), sp('🚲', 'đạp xe nhanh'), sp('💃', 'nhảy múa')],
    reveal: ['Đèn đỏ', 'bé dừng lại'],
  },
  {
    id: 'teeth',
    stim: '🌙',
    say: ['Tối rồi', 'trước khi ngủ bé làm gì?'],
    bubble: 'Trước khi đi ngủ, bé làm gì?',
    right: sp('🪥', 'đánh răng'),
    wrong: [sp('🍬', 'ăn kẹo'), sp('🍫', 'ăn sô cô la'), sp('🧃', 'uống nước ngọt')],
    reveal: ['Trước khi ngủ', 'bé đánh răng'],
  },
  {
    id: 'cough',
    stim: '🤧',
    say: ['Bạn hắt xì hơi', 'bạn nên làm gì?'],
    bubble: 'Hắt xì hơi, bé làm gì?',
    right: sp('🧻', 'lấy khăn che miệng'),
    wrong: [sp('🤪', 'hắt vào bạn'), sp('🙈', 'chạy trốn'), sp('🎈', 'thổi bóng')],
    reveal: ['Hắt xì hơi', 'bé lấy khăn che miệng'],
  },
];
export const SAFETY_IDS: readonly string[] = ['S:danger', ...SAFETY_SCENES.map((s) => `S:${s.id}`)];

/** Things a child must never touch, and harmless things to stand beside them. */
export const DANGEROUS: readonly { emoji: string; name: string }[] = [
  sp('🔌', 'ổ điện'),
  sp('🔥', 'lửa'),
  sp('🔪', 'con dao'),
  sp('💊', 'thuốc'),
  sp('♨️', 'nồi nước sôi'),
];
export const HARMLESS: readonly { emoji: string; name: string }[] = [
  sp('🧸', 'gấu bông'),
  sp('📚', 'quyển sách'),
  sp('🍎', 'quả táo'),
  sp('⚽', 'quả bóng'),
  sp('🧩', 'miếng ghép'),
  sp('🎈', 'quả bóng bay'),
];

// ---- maths ----

export const MATH_IDS: readonly string[] = ['M:add', 'M:sub', 'M:cmp', 'M:next', 'M:gap'];
