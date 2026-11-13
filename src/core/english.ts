/**
 * A first taste of English: the word for something the child already knows in Vietnamese,
 * said after the Vietnamese one by an English system voice. Off unless a parent turns it on.
 * If the device has no English voice, nothing is said (never a Vietnamese voice mangling
 * English).
 */

/** Vietnamese word (as the games say it) → English word. Lower-case keys. */
export const EN_WORDS: Readonly<Record<string, string>> = {
  // numbers
  một: 'one',
  hai: 'two',
  ba: 'three',
  bốn: 'four',
  năm: 'five',
  sáu: 'six',
  bảy: 'seven',
  tám: 'eight',
  chín: 'nine',
  mười: 'ten',
  // colours
  đỏ: 'red',
  'màu đỏ': 'red',
  'xanh lá': 'green',
  'màu xanh lá': 'green',
  'xanh dương': 'blue',
  'màu xanh dương': 'blue',
  vàng: 'yellow',
  'màu vàng': 'yellow',
  cam: 'orange',
  'màu cam': 'orange',
  tím: 'purple',
  'màu tím': 'purple',
  hồng: 'pink',
  'màu hồng': 'pink',
  đen: 'black',
  'màu đen': 'black',
  trắng: 'white',
  'màu trắng': 'white',
  nâu: 'brown',
  'màu nâu': 'brown',
  // shapes
  'hình tròn': 'circle',
  'hình vuông': 'square',
  'hình tam giác': 'triangle',
  'hình chữ nhật': 'rectangle',
  'hình ngôi sao': 'star',
  'ngôi sao': 'star',
  'hình trái tim': 'heart',
  'trái tim': 'heart',
  // animals
  'con mèo': 'cat',
  mèo: 'cat',
  'con chó': 'dog',
  chó: 'dog',
  'con gà': 'chicken',
  gà: 'chicken',
  'con vịt': 'duck',
  vịt: 'duck',
  'con bò': 'cow',
  bò: 'cow',
  'con lợn': 'pig',
  lợn: 'pig',
  'con heo': 'pig',
  'con ngựa': 'horse',
  ngựa: 'horse',
  'con cừu': 'sheep',
  cừu: 'sheep',
  'con dê': 'goat',
  'con cá': 'fish',
  cá: 'fish',
  'con chim': 'bird',
  chim: 'bird',
  'con voi': 'elephant',
  voi: 'elephant',
  'con hổ': 'tiger',
  hổ: 'tiger',
  'con sư tử': 'lion',
  'sư tử': 'lion',
  'con khỉ': 'monkey',
  khỉ: 'monkey',
  'con gấu': 'bear',
  gấu: 'bear',
  'con thỏ': 'rabbit',
  thỏ: 'rabbit',
  'con ếch': 'frog',
  ếch: 'frog',
  'con rùa': 'turtle',
  rùa: 'turtle',
  'con ong': 'bee',
  ong: 'bee',
  'con bướm': 'butterfly',
  bướm: 'butterfly',
  'con rắn': 'snake',
  'con chuột': 'mouse',
  chuột: 'mouse',
  'con cú': 'owl',
  // fruit & things
  'quả táo': 'apple',
  táo: 'apple',
  'quả chuối': 'banana',
  chuối: 'banana',
  'quả cam': 'orange',
  'quả nho': 'grapes',
  'dưa hấu': 'watermelon',
  'quả dâu': 'strawberry',
  'ô tô': 'car',
  'xe ô tô': 'car',
  'máy bay': 'airplane',
  'tàu hỏa': 'train',
  thuyền: 'boat',
  'xe đạp': 'bicycle',
  'quả bóng': 'ball',
  bóng: 'ball',
  'mặt trời': 'sun',
  'mặt trăng': 'moon',
  'cái cây': 'tree',
  cây: 'tree',
  'bông hoa': 'flower',
  hoa: 'flower',
  'ngôi nhà': 'house',
  nhà: 'house',
  // size & opposites
  to: 'big',
  nhỏ: 'small',
  nóng: 'hot',
  lạnh: 'cold',
  cao: 'tall',
  thấp: 'short',
  vui: 'happy',
  buồn: 'sad',
  nhanh: 'fast',
  chậm: 'slow',
};

/** The English word for a Vietnamese one, or null. Tolerates case, spaces and a leading "con/quả/cái". */
export function englishFor(vi: string): string | null {
  const key = vi.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  const direct = EN_WORDS[key];
  if (direct) return direct;
  const bare = key.replace(/^(con|quả|trái|cái|chiếc|bông|màu|số)\s+/, '');
  return EN_WORDS[bare] ?? (/^\d+$/.test(bare) ? numberWord(Number(bare)) : null);
}

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

/** English number word 0…20, else null. */
export function numberWord(n: number): string | null {
  return Number.isInteger(n) && n >= 0 && n <= 20 ? (ONES[n] ?? null) : null;
}

interface SynthLike {
  speak(u: SpeechSynthesisUtterance): void;
  getVoices(): SpeechSynthesisVoice[];
}

function synth(): SynthLike | null {
  try {
    return (globalThis as { speechSynthesis?: SynthLike }).speechSynthesis ?? null;
  } catch {
    return null;
  }
}

/** An English voice on this device, preferring en-US / en-GB local voices. */
export function englishVoice(voices: readonly SpeechSynthesisVoice[] = synth()?.getVoices() ?? []): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  return en.find((v) => /^en[-_]US$/i.test(v.lang) && v.localService) ?? en.find((v) => /^en[-_](US|GB)$/i.test(v.lang)) ?? en[0] ?? null;
}

export const ENGLISH_KEY = 'be-choi:english';

/** Parent setting: say the English word after the Vietnamese one. Off by default. */
export function englishOn(): boolean {
  try {
    return localStorage.getItem(ENGLISH_KEY) === '1';
  } catch {
    return false;
  }
}

export function setEnglishOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENGLISH_KEY, '1');
    else localStorage.removeItem(ENGLISH_KEY);
  } catch {
    /* private mode */
  }
}

/** If the parent turned English on and we know the word, say it after the Vietnamese. */
export function echoEnglish(vi: string): void {
  if (!englishOn()) return;
  const en = englishFor(vi);
  if (en) sayEnglish(en, 900);
}

/** Kept so Chrome does not garbage-collect the utterance before it ends. */
let live: SpeechSynthesisUtterance | null = null;

/**
 * Queue the English word after whatever is being said (speechSynthesis queues; we do not cancel).
 * Returns false when there is no English word or no English voice.
 */
export function sayEnglish(word: string, delayMs = 250): boolean {
  const s = synth();
  const Ctor = (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
  const voice = englishVoice();
  if (!s || !Ctor || !voice || !word) return false;
  setTimeout(() => {
    try {
      const u = new Ctor(word);
      u.lang = voice.lang;
      u.voice = voice;
      u.rate = 0.8;
      live = u;
      u.onend = () => {
        if (live === u) live = null;
      };
      s.speak(u);
    } catch {
      /* ignore */
    }
  }, delayMs);
  return true;
}
