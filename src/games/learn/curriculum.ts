import { ANIMALS, COLORS, FRUITS, NUMBERS_VI, VEHICLES, VOICED_ANIMALS, type Item } from '../../core/content';
import { LETTERS } from '../letters/logic';
import { SHAPES } from '../shapes/logic';
import { CATEGORIES } from '../sortout/logic';
import type { Env, Person, TopicId } from './types';

export interface Topic {
  id: TopicId;
  icon: string;
  /** Short name under the station on the map. */
  title: string;
  /** Some stations mix in drag-and-drop questions. */
  drag: boolean;
}

/** The ten stations, in the order they sit on the map. */
export const TOPICS: readonly Topic[] = [
  { id: 'letters', icon: '🔤', title: 'Chữ cái', drag: false },
  { id: 'numbers', icon: '🔢', title: 'Số', drag: false },
  { id: 'colors', icon: '🎨', title: 'Màu sắc', drag: true },
  { id: 'shapes', icon: '🔷', title: 'Hình', drag: false },
  { id: 'sizes', icon: '🐘', title: 'To nhỏ', drag: true },
  { id: 'animals', icon: '🐾', title: 'Con vật', drag: false },
  { id: 'shadows', icon: '🌑', title: 'Cái bóng', drag: false },
  { id: 'pattern', icon: '🔴', title: 'Quy luật', drag: false },
  { id: 'sorting', icon: '🧺', title: 'Phân loại', drag: true },
  { id: 'family', icon: '👪', title: 'Người thân', drag: false },
];

export function topicOf(id: TopicId): Topic {
  const t = TOPICS.find((x) => x.id === id);
  if (!t) throw new Error(`learn: no topic ${id}`);
  return t;
}

export const QUESTIONS_PER_STATION = 5;

// ---- letters: three picture words each ----

export interface Pic {
  emoji: string;
  name: string;
}
const p = (emoji: string, name: string): Pic => ({ emoji, name });

/** Three words starting with each letter, each with a picture. Used by Khám phá and the word questions. */
export const LETTER_WORDS: Readonly<Record<string, readonly [Pic, Pic, Pic]>> = {
  A: [p('👕', 'áo'), p('🖼️', 'ảnh'), p('🏞️', 'ao')],
  Ă: [p('🍚', 'ăn cơm'), p('🔋', 'ắc quy'), p('📡', 'ăng ten')],
  Â: [p('🫖', 'ấm trà'), p('🎵', 'âm nhạc'), p('☀️', 'ấm áp')],
  B: [p('⚽', 'bóng'), p('🐄', 'bò'), p('🦋', 'bướm')],
  C: [p('🐟', 'cá'), p('🦀', 'cua'), p('🌳', 'cây')],
  D: [p('🐐', 'dê'), p('🍓', 'dâu'), p('🍉', 'dưa hấu')],
  Đ: [p('💡', 'đèn'), p('⏰', 'đồng hồ'), p('🎹', 'đàn')],
  E: [p('👶', 'em bé'), p('👧', 'em gái'), p('👦', 'em trai')],
  Ê: [p('🐸', 'ếch'), p('📐', 'ê ke'), p('🛋️', 'êm ái')],
  G: [p('🐔', 'gà'), p('🐻', 'gấu'), p('🌾', 'gạo')],
  H: [p('🌸', 'hoa'), p('🐯', 'hổ'), p('🎁', 'hộp quà')],
  I: [p('🐷', 'ỉn'), p('🤫', 'im lặng'), p('🖨️', 'in ảnh')],
  K: [p('🍬', 'kẹo'), p('🍦', 'kem'), p('✂️', 'kéo')],
  L: [p('🍃', 'lá'), p('🍐', 'lê'), p('🔥', 'lửa')],
  M: [p('🐱', 'mèo'), p('🌧️', 'mưa'), p('🧢', 'mũ')],
  N: [p('🎀', 'nơ'), p('🕯️', 'nến'), p('🍄', 'nấm')],
  O: [p('🐝', 'ong'), p('😭', 'òa khóc'), p('✊', 'oẳn tù tì')],
  Ô: [p('🚗', 'ô tô'), p('☂️', 'ô che mưa'), p('🐌', 'ốc')],
  Ơ: [p('🌶️', 'ớt'), p('🫑', 'ớt chuông'), p('😮', 'ơ kìa')],
  P: [p('🔋', 'pin'), p('🍕', 'pi da'), p('🍜', 'phở')],
  Q: [p('🍊', 'quả cam'), p('🍌', 'quả chuối'), p('👖', 'quần')],
  R: [p('🐢', 'rùa'), p('🥬', 'rau'), p('🐉', 'rồng')],
  S: [p('⭐', 'sao'), p('🦁', 'sư tử'), p('📖', 'sách')],
  T: [p('🍎', 'táo'), p('🚂', 'tàu'), p('🐰', 'thỏ')],
  U: [p('🙈', 'ú oà'), p('🥾', 'ủng'), p('🥛', 'uống sữa')],
  Ư: [p('🦅', 'chim ưng'), p('🍗', 'ức gà'), p('🌠', 'ước mơ')],
  V: [p('🦆', 'vịt'), p('🐘', 'voi'), p('🧳', 'va li')],
  X: [p('🚗', 'xe'), p('🪣', 'xô'), p('🌭', 'xúc xích')],
  Y: [p('🐦', 'yến'), p('🧑‍⚕️', 'y tá'), p('❤️', 'yêu')],
};

/** Easy-to-tell-apart letters first; the rest join as the child gets ready. */
const LETTER_ORDER = 'BCMOTXVSAHLNGKDRQEPUYIĐÔÊƠÂĂƯ';
export const LETTER_IDS: readonly string[] = [...LETTER_ORDER].map((l) => `L:${l}`);

/** Letters that look or sound alike, offered together once the child is steady. */
export const LETTER_LOOKALIKES: readonly (readonly string[])[] = [
  ['B', 'D', 'Đ', 'P', 'R'],
  ['O', 'Ô', 'Ơ', 'Q', 'C'],
  ['A', 'Ă', 'Â'],
  ['E', 'Ê', 'G'],
  ['M', 'N', 'H'],
  ['U', 'Ư', 'V'],
  ['I', 'L', 'T', 'Y', 'K', 'X'],
];

// ---- numbers ----

export const NUMBER_IDS: readonly string[] = Array.from({ length: 10 }, (_, i) => `N:${i + 1}`);
export const COUNT_THINGS: readonly Item[] = [...FRUITS.slice(0, 6), ...ANIMALS.slice(0, 8)];

export function numberWord(n: number): string {
  return NUMBERS_VI[n] ?? String(n);
}

/** "một, hai, ba": the counting aloud, with commas so the voice pauses between numbers. */
export function countAloud(n: number): string {
  return Array.from({ length: n }, (_, i) => numberWord(i + 1)).join(', ');
}

// ---- colours ----

export const COLOR_IDS: readonly string[] = COLORS.map((c) => `C:${c.id}`);

/** Colours that are easy to mix up, offered together at the higher levels. */
export const COLOR_NEIGHBOURS: Readonly<Record<string, readonly string[]>> = {
  red: ['orange', 'pink'],
  orange: ['red', 'yellow'],
  yellow: ['orange', 'green'],
  green: ['yellow', 'blue'],
  blue: ['purple', 'green'],
  purple: ['blue', 'pink'],
  pink: ['red', 'purple'],
};

export const COLOR_THINGS: Readonly<Record<string, readonly [Pic, Pic, Pic]>> = {
  red: [p('🍎', 'quả táo'), p('🍓', 'quả dâu'), p('🚒', 'xe cứu hoả')],
  orange: [p('🍊', 'quả cam'), p('🥕', 'củ cà rốt'), p('🎃', 'quả bí ngô')],
  yellow: [p('🍌', 'quả chuối'), p('☀️', 'mặt trời'), p('🐥', 'gà con')],
  green: [p('🥒', 'quả dưa chuột'), p('🐸', 'con ếch'), p('🍃', 'lá cây')],
  blue: [p('🐳', 'cá voi'), p('🌊', 'sóng biển'), p('🫐', 'quả việt quất')],
  purple: [p('🍇', 'chùm nho'), p('🍆', 'quả cà tím'), p('🔮', 'quả cầu pha lê')],
  pink: [p('🌸', 'bông hoa'), p('🐷', 'con heo'), p('🎀', 'cái nơ')],
};

// ---- shapes ----

export const SHAPE_ORDER = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'diamond', 'hexagon'] as const;
export const SHAPE_IDS: readonly string[] = SHAPE_ORDER.map((s) => `S:${s}`);

export const SHAPE_LOOKALIKES: readonly (readonly string[])[] = [
  ['circle', 'oval', 'hexagon'],
  ['square', 'diamond', 'hexagon'],
  ['triangle', 'star', 'diamond'],
  ['heart', 'star', 'circle'],
];

export const SHAPE_THINGS: Readonly<Record<string, readonly [Pic, Pic, Pic]>> = {
  circle: [p('⚽', 'quả bóng'), p('🌕', 'mặt trăng'), p('🍪', 'bánh quy')],
  square: [p('🎁', 'hộp quà'), p('🧊', 'khối đá'), p('🖼️', 'khung tranh')],
  triangle: [p('🍕', 'miếng pizza'), p('⛺', 'cái lều'), p('🚩', 'lá cờ')],
  star: [p('⭐', 'ngôi sao'), p('🌟', 'sao lấp lánh'), p('🌠', 'sao băng')],
  heart: [p('❤️', 'trái tim'), p('💖', 'tim hồng'), p('💕', 'hai trái tim')],
  oval: [p('🥚', 'quả trứng'), p('🍉', 'quả dưa hấu'), p('🏈', 'bóng bầu dục')],
  diamond: [p('💎', 'kim cương'), p('🪁', 'cái diều'), p('♦️', 'lá bài rô')],
  hexagon: [p('🍯', 'hũ mật ong'), p('🐝', 'con ong'), p('🔩', 'ốc vít')],
};

export function shapeById(id: string) {
  const s = SHAPES.find((x) => x.id === id);
  if (!s) throw new Error(`learn: no shape ${id}`);
  return s;
}

// ---- sizes ----

export const SIZE_IDS: readonly string[] = ['Z:big', 'Z:small'];
export const SIZE_ITEMS: readonly Item[] = [...ANIMALS.slice(0, 12), ...VEHICLES.slice(0, 4)];

// ---- animals & their voices ----

export const ANIMAL_IDS: readonly string[] = VOICED_ANIMALS.map((a) => `A:${a.emoji}`);
export const SHADOW_IDS: readonly string[] = ANIMALS.map((a) => `H:${a.emoji}`);

/** How each animal's voice is written in Vietnamese. */
export const ONOMATOPOEIA: Readonly<Record<string, string>> = {
  '🐶': 'gâu gâu',
  '🐱': 'meo meo',
  '🐮': 'ò ò',
  '🐷': 'ủn ỉn',
  '🐸': 'ộp ộp',
  '🦁': 'gầm gừ',
  '🐯': 'gừ gừ',
  '🐻': 'gù gù',
  '🦆': 'cạp cạp',
  '🐔': 'cục tác',
  '🐧': 'quạc quạc',
  '🐘': 'tu tu',
  '🐵': 'khẹc khẹc',
  '🐭': 'chít chít',
  '🐴': 'hí hí',
};

/** Animals that look alike in silhouette or colour: harder to tell apart. */
export const ANIMAL_LOOKALIKES: readonly (readonly string[])[] = [
  ['🐻', '🐼', '🐨'],
  ['🐱', '🐯', '🦁'],
  ['🐶', '🐱', '🐰'],
  ['🐷', '🐮', '🐴'],
  ['🐔', '🦆', '🐧'],
  ['🐭', '🐰', '🐵'],
];

export function animalByEmoji(emoji: string): Item {
  const a = ANIMALS.find((x) => x.emoji === emoji);
  if (!a) throw new Error(`learn: no animal ${emoji}`);
  return a;
}

// ---- patterns ----

export const PATTERN_IDS: readonly string[] = ['P:AB', 'P:AAB', 'P:ABB', 'P:ABC'];

// ---- sorting ----

export interface SortKind {
  id: string;
  /** "đồ chơi": "Cái nào là đồ chơi?" */
  kind: string;
  bin: string;
  binName: string;
  things: readonly Item[];
}

export const SORT_KINDS: readonly SortKind[] = [
  ...CATEGORIES.map((c) => ({
    id: c.id,
    kind: c.id === 'toys' ? 'đồ chơi' : c.id === 'clothes' ? 'quần áo' : 'trái cây',
    bin: c.bin,
    binName: c.binName,
    things: c.things as readonly Item[],
  })),
  { id: 'animals', kind: 'con vật', bin: '🏡', binName: 'chuồng thú', things: ANIMALS.slice(0, 10) },
  { id: 'vehicles', kind: 'xe', bin: '🅿️', binName: 'bãi đỗ xe', things: VEHICLES.slice(1, 9) },
];
export const SORT_IDS: readonly string[] = SORT_KINDS.map((k) => `K:${k.id}`);

// ---- family ----

/** Group photos by name (several photos of Mẹ are one person); unnamed photos stay on their own. */
export function peopleFrom(photos: readonly { id: string; url: string; name?: string }[]): Person[] {
  const byName = new Map<string, Person>();
  const out: Person[] = [];
  for (const ph of photos) {
    const name = ph.name?.trim();
    if (!name) {
      out.push({ key: `p${ph.id}`, urls: [ph.url] });
      continue;
    }
    const k = name.toLowerCase();
    const found = byName.get(k);
    if (found) found.urls.push(ph.url);
    else {
      const person: Person = { key: `n${k}`, name, urls: [ph.url] };
      byName.set(k, person);
      out.push(person);
    }
  }
  return out;
}

export function familyIds(env: Env): string[] {
  return env.people.map((q) => `F:${q.key}`);
}

/** The family station needs at least two different people (photos) to tell apart. */
export function familyReady(env: Env): boolean {
  return env.people.length >= 2;
}

// ---- the whole curriculum ----

/** Concepts of a topic in the order they are introduced. */
export function conceptsOf(topic: TopicId, env: Env): string[] {
  switch (topic) {
    case 'letters':
      return [...LETTER_IDS];
    case 'numbers':
      return [...NUMBER_IDS];
    case 'colors':
      return [...COLOR_IDS];
    case 'shapes':
      return [...SHAPE_IDS];
    case 'sizes':
      return [...SIZE_IDS];
    case 'animals':
      return [...ANIMAL_IDS];
    case 'shadows':
      return [...SHADOW_IDS];
    case 'pattern':
      return [...PATTERN_IDS];
    case 'sorting':
      return [...SORT_IDS];
    case 'family':
      return familyIds(env);
  }
}

/** Part of a concept id after the "X:" prefix. */
export function keyOf(concept: string): string {
  return concept.slice(2);
}

export function glyphOf(label: string) {
  const g = LETTERS.find((l) => l.label === label);
  if (!g) throw new Error(`learn: no letter ${label}`);
  return g;
}
